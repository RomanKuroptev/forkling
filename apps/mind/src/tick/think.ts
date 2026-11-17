import type { ModelId } from '../budget.ts'
import { Decision } from '../decision.ts'
import { buildUser } from '../prompts.ts'
import type { Tick } from './context.ts'
import { readRecentPast } from '../past.ts'
import { foldName, hiddenVisitor, livePrices, moodWords, openPlaceRequests } from '@forkling/sim'
import { expandablePlaces } from './expand.ts'
import { unreadSeen } from '../web/lookup.ts'
import { foundGate, foundableInterest } from './found.ts'
import { checkPlan, placeIds } from './plan.ts'
import { clock, weekday } from './util.ts'

const MAX_SHOWN_FOUND = 10
const MAX_SHOWN_KEPT = 5

/** The notes shown to a decide call: those found and not answered (oldest first, so none waits for ever) and the latest it kept, to quote or build from. */
function noteLines(t: Tick) {
  const line = (n: Tick['visitorNotes'][number]) => {
    const key = foldName(n.name)
    const entry = key && !hiddenVisitor(key, t.w.notesHidden) ? t.visitors.visitors[key] : undefined
    return { id: n.id, status: n.status === 'found' ? 'found' : n.status, place: n.placeId, name: n.name, message: n.message, ...(entry && entry.notes >= 2 ? { talkedBefore: true } : {}) }
  }
  return [...t.visitorNotes.filter((n) => n.status === 'found').slice(0, MAX_SHOWN_FOUND).map(line), ...t.visitorNotes.filter((n) => n.status === 'kept').slice(-MAX_SHOWN_KEPT).map(line)]
}

/** The morning plan or a decision: one call, and one more if the body cannot carry out the plan. */
export async function think(t: Tick): Promise<void> {
  const { thinkKind, tz, nowMs, notes, window } = t
  if (!thinkKind) return
  const model: ModelId = 'claude-haiku-5-5'
  const user = buildUser({
    kind: thinkKind,
    forkling: t.forkling,
    goals: t.goals,
    mindState: t.mind,
    places: placeIds(t),
    growable: expandablePlaces(t).filter((e) => e.earned.earned).map((e) => `${e.id} (${e.earned.by === 'made' ? `${e.earned.works.length} works shown since it last changed size` : `your reading on ${e.earned.family}`})`),
    foundable: foundableInterest(t),
    fromRoman: (t.mind.fromRoman ?? []).map((x) => x.text),
    requests: openPlaceRequests(foundGate(t).requests).map((r) => ({ name: r.name, status: r.status })),
    triggers: t.triggers,
    localTime: `${weekday(tz, nowMs)} ${t.today} ${clock(tz, nowMs)}`,
    wakeTime: clock(tz, window.wakeMs),
    bedTime: clock(tz, window.bedMs),
    hoursLeft: Math.max(0, Math.round((window.bedMs - nowMs) / 3_600_000)),
    allowance: { points: t.mind.allowance?.points ?? 0, prices: livePrices(t.mind.prices) },
    mood: moodWords({ mood: t.mood, energy: t.energy }),
    justNow: t.justNow,
    beliefs: t.beliefs,
    memory: t.w.summary,
    interests: t.interests,
    past: readRecentPast(t.dir, t.today, t.w.art),
    startingPoints: t.startingPoints,
    seenPages: unreadSeen(t.mind.seen ?? [], { not: t.startingPoints.map((p) => p.url), readRecently: t.wander.readRecently }),
    notes: noteLines(t),
  })
  let asking = user
  // A plan the body cannot carry out gets one more chance, with the reasons, before the body falls back on itself.
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await t.ask(thinkKind, model, asking, Decision)
    if (!result) break
    if (!result.parsed) {
      notes.push(`no usable answer (stopped: ${result.stopReason ?? 'unknown'})`)
      t.mind.thinkFailedAt = t.nowIso
      break
    }
    t.decision = result.parsed
    t.thought = true
    const checked = t.decision.plan && t.decision.plan.length > 0 ? checkPlan(t, t.decision.plan) : null
    if (!checked || checked.check.ok || attempt === 1) break
    notes.push(`plan turned down (${checked.check.reasons.join('; ')}): asking again`)
    asking = [
      user,
      '',
      '## Your plan was turned down',
      'It cannot be carried out as written:',
      ...checked.check.reasons.map((r) => `- ${r}`),
      'Write the whole plan again so that every step can happen.',
    ].join('\n')
  }
}
