import { SourceStats, TOTAL_CAP_USD, type BudgetLedger, type Goals, type Health, type MindState, type TickLine } from '@forkling/schema'
import { MAX_POINTS_IN_HAND, doorStats, drawStats, placeNovelty, textNovelty, weeklyHealthWarnings, workNovelty, type DiaryLike, type DoorDay, type PlaceNudgeLike, type PlaceNudgeRequest, type PlaceNudgeStep, type TextLike, type WorkLike } from '@forkling/sim'
import { daysInMonth, paceAhead, paceUsd } from './budget.ts'
import { topHostShare } from './web/stats.ts'
import { MAX_READS_PER_DAY } from './web/trip.ts'

/** What the health summary needs besides the tick line: the world as the tick left it. */
export interface HealthContext {
  /** The forkling's local date. */
  today: string
  nowMs: number
  goals: Goals
  mind: MindState
  budget: BudgetLedger
  /** `mind/sources.json`, for the host that gave most of the week's reads. Missing means none yet. */
  sources?: SourceStats
  /** The loop could not push after 3 tries (spec 2.2). */
  pushFailing?: boolean
  /** The works in `works/`, for the week's work numbers. */
  works?: readonly (WorkLike & { constraint?: { refused: boolean } | null; collision?: readonly string[] | null })[]
  /** What Merge has written (notebook) and its diary, for the text numbers of the week (spec 12.6). */
  texts?: { writings: readonly TextLike[]; diaries: readonly DiaryLike[] }
  /** Trips by day and how many started through a stranger's door, the last 7 days. */
  doorDays?: readonly DoorDay[]
  /** The last 7 days for the weekly health check (spec 9.6): the steps started and the build attempts. Absent means no check. */
  week?: { steps: readonly { verb: string; at: string }[]; builds: { total: number; failed: number } }
  /** The places, requests and steps of the last days, for the place nudges (spec 12.3). `dayOf` gives the forkling's own day. */
  placeNudges?: { places: readonly PlaceNudgeLike[]; requests: readonly PlaceNudgeRequest[]; steps: readonly PlaceNudgeStep[]; dayOf?: (iso: string) => string }
}

/** A need under 15, an idle spell or a wait this long (in minutes) is worth a warning. */
const WARN_MINUTES = 60
const WARN_GAP_MINUTES = 30
const WARN_DECIDE_CALLS = 15
const WARN_SAME_STEP = 3
const WARN_FAILED_CALLS = 3
const WARN_REJECTIONS = 3
const WARN_CUT_OFF = 3
const WARN_BUILD_HOURS = 48
/** A gap longer than this is a stopped clock, not a slow one, and counts for no more than this. */
const MAX_COUNTED_GAP = 180

const DECIDE_KINDS = new Set(['morning', 'decide'])
/** The calls W7 added, watched against the $20 cap: reflection, the sleep rewrite (batch and late call) and the weekly review. */
export const W7_KINDS: readonly string[] = ['reflection', 'sleep', 'sleeplate', 'weekly']
/** A projection from the first two days of a month means nothing. */
const MIN_DAYS_TO_PROJECT = 3

/**
 * Roman's warning: would W7's calls push the month over $20? The month's spend so far is spread over the days gone, projected to
 * the whole month, and the server's price added. It warns only when that passes the cap and W7's calls are part of the spend; a
 * month that is ahead for other reasons is the pace warning's business. Pure.
 */
export function w7SpendWarning(budget: BudgetLedger, today: string): string | null {
  const day = Number(today.slice(8, 10))
  if (day < MIN_DAYS_TO_PROJECT) return null
  const w7 = W7_KINDS.reduce((sum, kind) => sum + (budget.byKind[kind]?.usd ?? 0), 0)
  if (w7 <= 0) return null
  const projected = (budget.spentUsd / day) * daysInMonth(today) + budget.serverUsd
  if (projected <= TOTAL_CAP_USD + 1e-9) return null
  return `W7 spend would pass $${TOTAL_CAP_USD}: the month projects to $${projected.toFixed(2)} with the server ($${budget.serverUsd.toFixed(2)}); reflection, the sleep rewrite and the weekly review are $${w7.toFixed(2)} of the $${budget.spentUsd.toFixed(2)} spent so far`
}
const bump = (record: Record<string, number>, key: string, by = 1) => ({ ...record, [key]: (record[key] ?? 0) + by })
const minutesBetween = (fromIso: string, toIso: string) => Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60_000))

/**
 * The rolling health summary: the previous one and the tick that just happened make the next. Pure. Never needs the
 * history, so it stays small, and anyone can read what is wrong from one file.
 */
export function buildHealth(prev: Health | null, line: TickLine, ctx: HealthContext): Health {
  const sameDay = prev?.date === ctx.today
  const before = sameDay ? prev!.today : null
  const gap = prev ? Math.min(MAX_COUNTED_GAP, minutesBetween(prev.lastTick.at, line.at)) : 0
  const awake = !line.asleep
  const awakeBoth = awake && !!prev && !prev.lastTick.asleep

  // The day's counters.
  let callsByKind = before?.callsByKind ?? {}
  let spendByKind = before?.spendByKind ?? {}
  let triggersByKind = before?.triggersByKind ?? {}
  let stepsStarted = before?.stepsStarted ?? {}
  let decideCalls = before?.decideCalls ?? 0
  let failures = before?.failures ?? 0
  let rejections = before?.rejections ?? 0
  let refusals = before?.refusals ?? 0
  let cutOff = before?.cutOff ?? 0
  for (const c of line.calls) {
    if (c.usd > 0) spendByKind = bump(spendByKind, c.kind, c.usd)
    if (!c.ok) {
      failures++
      if (c.stop === 'refusal') refusals++
      if (c.stop === 'cut_off') cutOff++
      continue
    }
    callsByKind = bump(callsByKind, c.kind)
    if (DECIDE_KINDS.has(c.kind)) decideCalls++
  }
  for (const t of line.triggers) triggersByKind = bump(triggersByKind, t.kind)
  if (line.notes.some((n) => n.startsWith('plan rejected'))) rejections++
  if (line.stepAfter && line.stepAfter.startedAt !== line.stepBefore?.startedAt) {
    stepsStarted = bump(stepsStarted, `${line.stepAfter.verb}${line.stepAfter.targetId ? ` ${line.stepAfter.targetId}` : ''}`)
  }
  const longestGapMinutes = Math.max(before?.longestGapMinutes ?? 0, awakeBoth ? gap : 0)

  const idleMinutes = awake && !ctx.goals.now ? (prev?.plan.idleMinutes ?? 0) + gap : 0
  const mood = prev && prev.mood.label === line.mood ? { label: line.mood, minutes: prev.mood.minutes + gap } : { label: line.mood, minutes: 0 }

  const now = ctx.goals.now
  const steps = ctx.goals.today?.steps.length ?? 0
  const plan: Health['plan'] = {
    planId: line.planId,
    stepsLeft: ctx.goals.today ? Math.max(0, steps - (now ? now.index + 1 : steps)) : 0,
    current: line.stepAfter ? { index: line.stepAfter.index, verb: line.stepAfter.verb, ...(line.stepAfter.targetId ? { targetId: line.stepAfter.targetId } : {}), until: line.stepAfter.until, overdueMinutes: Math.max(0, Math.floor((ctx.nowMs - Date.parse(line.stepAfter.until)) / 60_000)) } : null,
    lastReplanAt: line.planId && line.planId !== prev?.plan.planId ? line.at : (prev?.plan.lastReplanAt ?? null),
    idleMinutes,
  }

  const { mind, budget } = ctx
  const quotas: Health['quotas'] = { readings: { used: mind.trips?.date === ctx.today ? mind.trips.reads : 0, max: MAX_READS_PER_DAY } }
  const pausedHosts = Object.fromEntries(Object.entries(mind.pausedHosts).filter(([, until]) => Date.parse(until) > ctx.nowMs))
  const web: Health['web'] = { pausedHosts, topHost: topHostShare(ctx.sources ?? SourceStats.parse({}), ctx.today) }
  const spend = { monthUsd: budget.spentUsd, capUsd: budget.capUsd, paceUsd: paceUsd(budget, ctx.today) }
  // The one that has waited longest: an object, or a coded project waiting for a person to read it.
  const waiting = [mind.openBuild, mind.openCode].filter((b) => b !== null).sort((a, b) => Date.parse(a.requestedAt) - Date.parse(b.requestedAt))[0]
  const openBuild = waiting ? { id: waiting.id, kind: waiting.kind, ageHours: Math.max(0, Math.round((ctx.nowMs - Date.parse(waiting.requestedAt)) / 3_600_000)) } : null

  const warnings: string[] = []
  if (ctx.pushFailing) warnings.push('push failing')
  if (idleMinutes > WARN_MINUTES) warnings.push(`no step in progress for ${idleMinutes} minutes while awake`)
  for (const [step, n] of Object.entries(stepsStarted)) {
    if (n >= WARN_SAME_STEP) warnings.push(`started "${step}" ${n} times today`)
  }
  if (decideCalls > WARN_DECIDE_CALLS) warnings.push(`${decideCalls} decide calls today (more than ${WARN_DECIDE_CALLS})`)
  if (failures >= WARN_FAILED_CALLS) warnings.push(`${failures} failed calls today`)
  if (cutOff >= WARN_CUT_OFF) warnings.push(`${cutOff} answers cut off at the output limit today (the limit may be too low)`)
  if (rejections >= WARN_REJECTIONS) warnings.push(`${rejections} plans turned down today`)
  if (longestGapMinutes > WARN_GAP_MINUTES) warnings.push(`longest wait between ticks today was ${longestGapMinutes} minutes (they should come every 10)`)
  if (paceAhead(budget, ctx.today)) warnings.push(`spent $${spend.monthUsd.toFixed(2)} of $${spend.capUsd}, ahead of the pace ($${spend.paceUsd.toFixed(2)} by today)`)
  for (const [host, until] of Object.entries(pausedHosts)) warnings.push(`${host} is paused until ${until.slice(0, 16)}Z (it answered 429 or 403)`)
  const w7Warning = w7SpendWarning(budget, ctx.today)
  if (w7Warning) warnings.push(w7Warning)
  if (ctx.week) warnings.push(...weeklyHealthWarnings({ steps: ctx.week.steps, nowMs: ctx.nowMs, wakeMoods: (mind.wakeMoods ?? []).map((m) => m.mood), builds: ctx.week.builds }))
  if (openBuild && openBuild.ageHours > WARN_BUILD_HOURS) warnings.push(`build ${openBuild.id} has been open for ${openBuild.ageHours} hours`)

  return {
    updatedAt: line.at,
    engine: line.engine,
    date: ctx.today,
    lastTick: { at: line.at, asleep: line.asleep, summary: line.summary, think: line.think, triggers: line.triggers.map((t) => t.kind), callsFailed: line.calls.filter((c) => !c.ok).length },
    plan,
    today: { ticks: (before?.ticks ?? 0) + 1, decideCalls, callsByKind, spendByKind, triggersByKind, failures, rejections, refusals, cutOff, stepsStarted, longestGapMinutes },
    quotas,
    web,
    allowance: { points: Math.round(mind.allowance?.points ?? 0), max: MAX_POINTS_IN_HAND },
    mood,
    needsCritical: {},
    spend,
    openBuild,
    novelty: {
      works: workNovelty(ctx.works ?? [], { sinceMs: ctx.nowMs - 7 * 86_400_000 }),
      texts: textNovelty({ writings: ctx.texts?.writings ?? [], diaries: ctx.texts?.diaries ?? [], sinceMs: ctx.nowMs - 7 * 86_400_000 }),
      doors: doorStats(ctx.doorDays ?? [], ctx.today),
      oneHost: web.topHost ? { host: web.topHost.host, share: web.topHost.share, wouldFire: web.topHost.share > 0.6 } : null,
      draws: drawStats((ctx.works ?? []).map((w) => ({ made: w.made, status: w.status, constraint: w.constraint ?? null, collision: w.collision ?? null })), { sinceMs: ctx.nowMs - 7 * 86_400_000 }),
      places: placeNovelty({ places: ctx.placeNudges?.places ?? [], requests: ctx.placeNudges?.requests ?? [], steps: ctx.placeNudges?.steps ?? [], nowMs: ctx.nowMs, sinceMs: ctx.nowMs - 7 * 86_400_000, ...(ctx.placeNudges?.dayOf ? { dayOf: ctx.placeNudges.dayOf } : {}) }),
    },
    warnings,
  }
}
