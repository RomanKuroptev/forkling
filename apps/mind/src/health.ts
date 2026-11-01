import { MAX_BUILDS_PER_DAY, MAX_CODE_PER_WEEK, MAX_PHOTOS_PER_DAY, type BudgetLedger, type Goals, type Health, type MindState, type TickLine } from '@forkling/schema'
import { STRONG_NEED } from '@forkling/sim'
import { MAX_ARTIFACTS_PER_DAY } from './art.ts'
import { weekOf } from './builds.ts'
import { MAX_READINGS_PER_DAY } from './reading.ts'

/** What the health summary needs besides the tick line: the world as the tick left it. */
export interface HealthContext {
  /** The forkling's local date. */
  today: string
  nowMs: number
  goals: Goals
  mind: MindState
  budget: BudgetLedger
}

/** A need under 15, an idle spell or a wait this long (in minutes) is worth a warning. */
const WARN_MINUTES = 60
const WARN_GAP_MINUTES = 30
const WARN_DECIDE_CALLS = 15
const WARN_SAME_STEP = 3
const WARN_FAILED_CALLS = 3
const WARN_REJECTIONS = 3
const WARN_BUILD_HOURS = 48
/** How far past an even share of the month the spend may run before it is a warning, in dollars. */
const PACE_SLACK_USD = 0.5
/** A gap longer than this is a stopped clock, not a slow one, and counts for no more than this. */
const MAX_COUNTED_GAP = 180

const DECIDE_KINDS = new Set(['morning', 'decide'])
const bump = (record: Record<string, number>, key: string, by = 1) => ({ ...record, [key]: (record[key] ?? 0) + by })
const minutesBetween = (fromIso: string, toIso: string) => Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60_000))

function daysInMonth(date: string): number {
  const [y, m] = date.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

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
  let triggersByKind = before?.triggersByKind ?? {}
  let stepsStarted = before?.stepsStarted ?? {}
  let decideCalls = before?.decideCalls ?? 0
  let failures = before?.failures ?? 0
  let rejections = before?.rejections ?? 0
  for (const c of line.calls) {
    if (!c.ok) {
      failures++
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

  // How long things have been wrong: only while awake, since the body cannot do anything about a need in bed.
  const needsCritical: Record<string, number> = {}
  for (const [need, value] of Object.entries(line.needs)) {
    needsCritical[need] = awake && value < STRONG_NEED ? (prev?.needsCritical[need] ?? 0) + gap : 0
  }
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
  const used = (state: { date: string; count: number } | undefined) => (state?.date === ctx.today ? state.count : 0)
  const quotas: Health['quotas'] = {
    readings: { used: used(mind.readings), max: MAX_READINGS_PER_DAY },
    creative: { used: used(mind.arts), max: MAX_ARTIFACTS_PER_DAY },
    photos: { used: used(mind.photos), max: MAX_PHOTOS_PER_DAY },
    builds: { used: used(mind.builds), max: MAX_BUILDS_PER_DAY },
    codeThisWeek: { used: mind.codeWeek?.week === weekOf(ctx.today) ? mind.codeWeek.count : 0, max: MAX_CODE_PER_WEEK },
  }
  const dayOfMonth = Number(ctx.today.slice(8, 10))
  const spend = { monthUsd: budget.spentUsd, capUsd: budget.capUsd, paceUsd: (budget.capUsd * dayOfMonth) / daysInMonth(ctx.today) }
  // The one that has waited longest: an object, or a coded project waiting for a person to read it.
  const waiting = [mind.openBuild, mind.openCode].filter((b) => b !== null).sort((a, b) => Date.parse(a.requestedAt) - Date.parse(b.requestedAt))[0]
  const openBuild = waiting ? { id: waiting.id, kind: waiting.kind, ageHours: Math.max(0, Math.round((ctx.nowMs - Date.parse(waiting.requestedAt)) / 3_600_000)) } : null

  const warnings: string[] = []
  for (const [need, minutes] of Object.entries(needsCritical)) {
    if (minutes > WARN_MINUTES) warnings.push(`${need} has been under ${STRONG_NEED} for ${minutes} minutes while awake`)
  }
  if (idleMinutes > WARN_MINUTES) warnings.push(`no step in progress for ${idleMinutes} minutes while awake`)
  for (const [step, n] of Object.entries(stepsStarted)) {
    if (n >= WARN_SAME_STEP) warnings.push(`started "${step}" ${n} times today`)
  }
  if (decideCalls > WARN_DECIDE_CALLS) warnings.push(`${decideCalls} decide calls today (more than ${WARN_DECIDE_CALLS})`)
  if (failures >= WARN_FAILED_CALLS) warnings.push(`${failures} failed calls today`)
  if (rejections >= WARN_REJECTIONS) warnings.push(`${rejections} plans turned down today`)
  if (longestGapMinutes > WARN_GAP_MINUTES) warnings.push(`longest wait between ticks today was ${longestGapMinutes} minutes (they should come every 10)`)
  if (spend.monthUsd > spend.paceUsd + PACE_SLACK_USD) warnings.push(`spent $${spend.monthUsd.toFixed(2)} of $${spend.capUsd}, ahead of the pace ($${spend.paceUsd.toFixed(2)} by today)`)
  if (openBuild && openBuild.ageHours > WARN_BUILD_HOURS) warnings.push(`build ${openBuild.id} has been open for ${openBuild.ageHours} hours`)

  return {
    updatedAt: line.at,
    engine: line.engine,
    date: ctx.today,
    lastTick: { at: line.at, asleep: line.asleep, summary: line.summary, think: line.think, triggers: line.triggers.map((t) => t.kind), callsFailed: line.calls.filter((c) => !c.ok).length },
    plan,
    today: { ticks: (before?.ticks ?? 0) + 1, decideCalls, callsByKind, triggersByKind, failures, rejections, stepsStarted, longestGapMinutes },
    quotas,
    needsCritical,
    mood,
    spend,
    openBuild,
    warnings,
  }
}
