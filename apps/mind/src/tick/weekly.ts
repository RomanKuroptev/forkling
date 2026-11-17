import { kit } from '@forkling/schema/kit'
import { Health, LongGoalReview, WeeklyReview, WorkMeta, requestAnswerForPrompt } from '@forkling/schema'
import { checkAbout, goalReviewDue, MAX_REVIEW_RENAMES, neglectFor, validatePlacePatch, weeklyDue, WEEKLY_RETRY_MS } from '@forkling/sim'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readWorks } from '../builds/works.ts'
import { clampText } from '../decision.ts'
import { claimsHuman, wordCount } from '../honesty.ts'
import { stopFailure } from '../llm.ts'
import { buildGoalReviewUser, GOAL_REVIEW_MAX_TOKENS } from '../prompts/goal-review.ts'
import { buildWeeklyUser, type WeeklyInput } from '../prompts/weekly.ts'
import { readSelfRequests } from '../self-requests.ts'
import { readTimelineSince } from '../stream.ts'
import { readWishes } from '../wishes.ts'
import type { Tick } from './context.ts'
import { clock, weekday } from './util.ts'

/** The review, about.md, the long goal and the renames take room, and Sonnet's thinking counts too. */
const WEEKLY_OUTPUT_TOKENS = 6000
const MAX_STEP_LINES = 20
const MAX_NAME_CHARS = 40
/** Spec 9.5: a request to Roman is up to 120 words. */
const MAX_REQUEST_WORDS = 120
const MAX_ASKED = 3
/** What the weekly prompt shows of Roman's answer to a request (`oneLine(…, 700)` in `prompts/weekly.ts`). */
const ANSWER_CHARS = 700
/** Every version of about.md is kept as a copy named by the Sunday it changed (spec 9.2). */
export const aboutHistoryPath = (date: string): string => `self/history/${date}.md`

const DAY_MS = 86_400_000

/** The copy of about.md kept in `self/history/<date>.md`: the text as it became, and why each part changed. */
export function renderAboutHistory(date: string, write: { text: string; changes: readonly { what: string; why: string }[] }): string {
  return [`# about.md as of ${date}`, '', write.text.trim(), '', '## Why it changed', '', ...(write.changes.length > 0 ? write.changes.map((c) => `- ${c.what}: ${c.why}`) : ['- No reason was given.']), ''].join('\n')
}

function weeklyInput(t: Tick): WeeklyInput {
  const steps = readTimelineSince(t.dir, t.today, 7)
  const counts = new Map<string, number>()
  for (const s of steps) counts.set(s.verb, (counts.get(s.verb) ?? 0) + 1)
  const warnings = (() => {
    try {
      const health = Health.safeParse(JSON.parse(readFileSync(join(t.dir, 'mind/health.json'), 'utf8')))
      return health.success ? health.data.warnings : []
    } catch {
      return []
    }
  })()
  return {
    localTime: `${weekday(t.tz, t.nowMs)} ${t.today} ${clock(t.tz, t.nowMs)}`,
    timeZone: t.tz,
    verbs: [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([verb, count]) => ({ verb, count })),
    steps: steps.slice(-MAX_STEP_LINES).map((s) => `${s.at.slice(0, 10)} ${s.verb}${s.targetId ? ` ${s.targetId}` : ''}: ${s.reason}`),
    places: t.places.map((p) => ({ id: p.id, name: p.name, tags: p.tags, neglect: neglectFor({ id: p.id, lastCareAt: p.state.lastCareAt, founded: p.founded, closed: p.state.closed !== null }, t.nowMs) })),
    interests: Object.entries(t.interests.topics)
      .sort((a, b) => b[1].weight - a[1].weight)
      .slice(0, 10)
      .map(([topic, i]) => `${topic} (${Math.round(i.weight)})`),
    works: readWorks(t.dir)
      .slice(0, 20)
      .map((w) => ({ id: w.id, title: w.title, kind: w.kind, status: w.status })),
    wishes: readWishes(t.dir)
      .filter((w) => w.status === 'open' || w.status === 'building')
      .slice(0, 10)
      .map((w) => `${w.name} (${w.status})`),
    blocked: Object.keys(t.mind.pausedHosts ?? {}),
    warnings,
    longGoal: t.goals.long ? { text: t.goals.long.text, reason: t.goals.long.reason, since: t.goals.long.setAt.slice(0, 10) } : null,
    about: t.about,
    asked: readSelfRequests(t.dir)
      .slice(0, MAX_ASKED)
      .map((r) => {
        const answer = r.answer ? requestAnswerForPrompt(r.answer) : null
        // An answer over 80 words is cut for the prompt; Roman is told in the tick log, so he can shorten it.
        // The prompt shows at most 700 characters of it, so that cut is told too.
        if (answer && (answer.cut || answer.text.length > ANSWER_CHARS)) t.notes.push(`the answer to the request of ${r.date} is over 80 words or 700 characters, so Merge sees only the start of it (for Roman)`)
        return { date: r.date, body: r.body, answer: answer ? answer.text.slice(0, ANSWER_CHARS) : null, kind: r.kind, title: r.title, status: r.status }
      }),
  }
}

/**
 * The weekly review (spec 9.5): on Sunday at 20:00 one Sonnet call looks back over the week. Code runs it at the right time and
 * keeps what the rules allow: an `about.md` inside its limits (and nothing that claims to be human, which is logged), the long
 * goal kept, finished, dropped or changed, and up to 2 renames. What Merge says about itself, and what it does about its goal and
 * its names, is its own. The week is booked as done only when the answer was usable.
 */
export async function weeklyStep(t: Tick): Promise<void> {
  const { mind } = t
  if (!weeklyDue({ nowMs: t.nowMs, timezone: t.tz, asleep: t.asleep, lastWeeklyDate: mind.lastWeeklyDate ?? null, lastTriedMs: mind.weeklyTriedAt ? Date.parse(mind.weeklyTriedAt) : null })) return

  const result = await t.ask('weekly', 'claude-sonnet-5-5', buildWeeklyUser(weeklyInput(t)), WeeklyReview, WEEKLY_OUTPUT_TOKENS)
  const parsed = WeeklyReview.safeParse(result?.parsed)
  if (!result || !parsed.success || stopFailure(result.stopReason, result.parsed)) {
    if (!t.deps.dryRun) t.notes.push(`the weekly review gave nothing usable: trying again in ${WEEKLY_RETRY_MS / 60_000} minutes`)
    mind.weeklyTriedAt = t.nowIso
    return
  }
  const review = parsed.data

  applyAbout(t, review)
  applyLongGoal(t, review.longGoal)
  applyRenames(t, review.renames)
  applyRequest(t, review.request, review.requestKind, review.requestTitle)

  mind.lastWeeklyDate = t.today
  delete mind.weeklyTriedAt
  t.parts.push('weekly review')
}

const MAX_GOAL_STEP_LINES = 30
const GOAL_REVIEW_STEP_DAYS = 3

/**
 * The long goal is looked at every 3 days, not only on Sunday (it stood unreviewed from its first hour). One Sonnet call asks the
 * weekly review's own question about the goal: continue, finish, drop or change, and why. Code only runs it at the right time and
 * applies the answer by the weekly review's rules (`applyLongGoal`). Merge may keep its goal, but the reason is kept in its memory
 * either way. A Sunday review that has just looked at the goal in this tick is not followed by another look.
 */
export async function goalReviewStep(t: Tick): Promise<void> {
  const { mind } = t
  const long = t.goals.long
  if (!long || t.parts.includes('weekly review')) return
  // The topic of the goal is closed for writing: look at it early, once a day (audit 17 Nov).
  const early = mind.goalReviewEarly?.date === t.today && mind.goalReviewEarlyOn !== t.today
  if (!goalReviewDue({ nowMs: t.nowMs, asleep: t.asleep, reviewedAt: long.reviewedAt, lastTriedMs: mind.goalReviewTriedAt ? Date.parse(mind.goalReviewTriedAt) : null, early })) return

  const steps = readTimelineSince(t.dir, t.today, GOAL_REVIEW_STEP_DAYS).slice(-MAX_GOAL_STEP_LINES)
  const user = buildGoalReviewUser({
    localTime: `${weekday(t.tz, t.nowMs)} ${t.today} ${clock(t.tz, t.nowMs)}`,
    timeZone: t.tz,
    longGoal: { text: long.text, reason: long.reason, since: long.setAt.slice(0, 10), reviewed: long.reviewedAt.slice(0, 10) },
    steps: steps.map((s) => `${s.at.slice(0, 10)} ${s.verb}${s.targetId ? ` ${s.targetId}` : ''}: ${s.reason}`),
    interests: Object.entries(t.interests.topics)
      .sort((a, b) => b[1].weight - a[1].weight)
      .slice(0, 10)
      .map(([topic, i]) => `${topic} (${Math.round(i.weight)})`),
    ...(early && mind.goalReviewEarly ? { closedForWriting: { pages: mind.goalReviewEarly.closed, days: t.config.variety.sameTopicWrites.days } } : {}),
  })
  const result = await t.ask('goalreview', 'claude-sonnet-5-5', user, LongGoalReview, GOAL_REVIEW_MAX_TOKENS)
  const parsed = LongGoalReview.safeParse(result?.parsed)
  if (!result || !parsed.success || stopFailure(result.stopReason, result.parsed)) {
    if (!t.deps.dryRun) t.notes.push(`the long goal review gave nothing usable: trying again in ${WEEKLY_RETRY_MS / 60_000} minutes`)
    mind.goalReviewTriedAt = t.nowIso
    return
  }
  applyLongGoal(t, parsed.data)
  if (parsed.data.action === 'continue') t.remember.push({ at: t.nowIso, kind: 'event', text: clampText(`I looked at my long goal and kept it: ${parsed.data.reason.trim() || 'It is still what I want.'}`, 300) })
  delete mind.goalReviewTriedAt
  if (early) {
    mind.goalReviewEarlyOn = t.today
    delete mind.goalReviewEarly
  }
  t.parts.push(early ? 'reviewed the long goal early' : 'reviewed the long goal')
}

/** The one optional request to Roman (spec 9.5): up to 120 words in Merge's voice. It is kept as a file and shown on `/requests/`; nothing changes because of it. */
function applyRequest(t: Tick, request: string | null, kind?: 'tool' | 'setting' | 'other' | null, title?: string | null): void {
  const body = request?.trim()
  if (!body) return
  if (wordCount(body) > MAX_REQUEST_WORDS) return void t.notes.push(`the request to Roman was turned down: it is over ${MAX_REQUEST_WORDS} words`)
  if (claimsHuman(body)) return void t.notes.push('claim dropped, request to Roman: it claimed to be human')
  if (existsSync(join(t.dir, `self/requests/${t.today}.md`))) return void t.notes.push('the request to Roman was not kept: there is already one for today')
  t.selfRequest = { date: t.today, body, kind: kind ?? 'other', title: clampText((title ?? '').replace(/\s+/g, ' ').trim(), 60) }
  t.remember.push({ at: t.nowIso, kind: 'event', text: 'I asked Roman for something.' })
  t.parts.push('asked Roman for something')
}

/** The date of the newest copy in `self/history/` (a file named by its date), or null when about.md has never changed. */
function lastAboutChange(dir: string): string | null {
  const folder = join(dir, 'self/history')
  if (!existsSync(folder)) return null
  const dates = readdirSync(folder).flatMap((f) => (/^\d{4}-\d{2}-\d{2}\.md$/.test(f) ? [f.slice(0, 10)] : []))
  return dates.sort().at(-1) ?? null
}

function applyAbout(t: Tick, review: WeeklyReview): void {
  const text = review.about?.trim()
  if (!text) return
  if (claimsHuman(text)) {
    t.notes.push('claim dropped, about.md: it claimed to be human, so the old version stays (for Roman)')
    return
  }
  const check = checkAbout(t.about, text, { lastChangeDate: lastAboutChange(t.dir), today: t.today })
  if (!check.ok) {
    t.notes.push(`about.md turned down, the old version stays: ${check.reasons.join('; ')}`)
    return
  }
  if (text === t.about.trim()) return
  const changes = review.aboutChanges
    .map((c) => ({ what: clampText(c.what.trim(), 200), why: clampText(c.why.trim(), 300) }))
    .filter((c) => c.what && c.why)
    .slice(0, 8)
  t.about = text
  t.aboutWrite = { text, changes, at: t.nowIso }
  t.remember.push({ at: t.nowIso, kind: 'event', text: 'I rewrote what I wrote about myself (about.md).' })
  t.parts.push('rewrote about.md')
}

function applyLongGoal(t: Tick, goal: WeeklyReview['longGoal']): void {
  const reason = clampText(goal.reason.trim() || 'It is what I want now.', 200)
  const current = t.goals.long
  if (goal.action === 'continue') {
    if (current) t.goals.long = { ...current, reviewedAt: t.nowIso }
    return
  }
  if (goal.action === 'finish' || goal.action === 'drop') {
    if (!current) return
    delete t.goals.long
    t.remember.push({ at: t.nowIso, kind: 'event', text: clampText(`I ${goal.action === 'finish' ? 'finished' : 'gave up'} my long goal "${current.text}": ${reason}`, 300) })
    t.parts.push(goal.action === 'finish' ? 'finished the long goal' : 'gave up the long goal')
    return
  }
  const text = clampText(goal.text?.trim() ?? '', 300)
  if (!text) {
    t.notes.push('the weekly review changed the long goal but gave no new long goal: it stays as it was')
    return
  }
  if (claimsHuman(text)) {
    t.notes.push('claim dropped, long goal: it claimed to be human')
    return
  }
  t.goals.long = { text, reason, setAt: current?.text === text ? current.setAt : t.nowIso, reviewedAt: t.nowIso }
  t.remember.push({ at: t.nowIso, kind: 'event', text: clampText(`My long goal is now "${text}": ${reason}`, 300) })
  t.parts.push('new long goal')
}

function applyRenames(t: Tick, renames: WeeklyReview['renames']): void {
  renames.forEach((r, n) => {
    if (n >= MAX_REVIEW_RENAMES) {
      t.notes.push(`rename of ${r.id} turned down: at most ${MAX_REVIEW_RENAMES} renames in a review`)
      return
    }
    const name = r.name.trim()
    const reason = clampText(r.reason.trim(), 140)
    if (!name || !reason) return void t.notes.push(`rename of ${r.id} turned down: it needs a name and a reason`)
    if (name.length > MAX_NAME_CHARS) return void t.notes.push(`rename of ${r.id} turned down: "${clampText(name, 20)}..." is over ${MAX_NAME_CHARS} characters`)
    if (claimsHuman(name) || claimsHuman(reason)) return void t.notes.push(`claim dropped, rename of ${r.id}: it claimed to be human`)
    if (r.kind === 'place') renamePlace(t, r.id, name, reason)
    else renameWork(t, r.id, name, reason)
  })
}

function renamePlace(t: Tick, id: string, name: string, reason: string): void {
  const place = t.places.find((p) => p.id === id)
  if (!place) return void t.notes.push(`rename of ${id} turned down: there is no such place`)
  if (id === 'home' || id === 'workshop') return void t.notes.push(`rename of ${id} turned down: Home and the Workshop keep their names`)
  if (place.name === name) return
  const week = t.nowMs - 7 * DAY_MS
  const renamesThisWeek = t.places.reduce((n, p) => n + p.history.filter((h) => h.verb === 'rename' && Date.parse(h.at) > week).length, 0)
  const checked = validatePlacePatch(place, { verb: 'rename', name, summary: clampText(`Renamed from "${place.name}": ${reason}`, 1000) }, { kit, nowIso: t.nowIso, renamesThisWeek })
  if (!checked.ok) return void t.notes.push(`rename of ${id} turned down: ${checked.reasons.join('; ')}`)
  t.placeUpdates.push(checked.place)
  t.places = t.places.map((p) => (p.id === id ? checked.place : p))
  t.remember.push({ at: t.nowIso, kind: 'made', text: clampText(`Renamed ${place.name} to ${name}: ${reason}`, 300) })
  t.parts.push(`renamed ${place.name}`)
}

function renameWork(t: Tick, id: string, title: string, reason: string): void {
  const work = readWorks(t.dir).find((w) => w.id === id)
  if (!work) return void t.notes.push(`rename of ${id} turned down: there is no such work`)
  if (work.title === title) return
  const renamed = WorkMeta.safeParse({ ...work, title, titleHistory: [...work.titleHistory, { at: t.nowIso, from: work.title, reason }].slice(-10) })
  if (!renamed.success) return void t.notes.push(`rename of ${id} turned down: ${renamed.error.issues.map((i) => i.message).join('; ')}`)
  t.workUpdates.push(renamed.data)
  t.remember.push({ at: t.nowIso, kind: 'made', text: clampText(`Renamed "${work.title}" to "${title}": ${reason}`, 300) })
  t.parts.push(`renamed ${work.title}`)
}
