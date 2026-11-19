import type { ModelId } from '../budget.ts'
import { Decision } from '../decision.ts'
import { buildUser, type PlanLimits } from '../prompts.ts'
import type { Tick } from './context.ts'
import { readRecentPast } from '../past.ts'
import { foldName, hiddenVisitor, livePrices, moodWords, openPlaceRequests, sameWorkStreak, tiredLimits, topicWriteCounts } from '@forkling/sim'
import { expandablePlaces } from './expand.ts'
import { unreadSeen } from '../web/lookup.ts'
import { readTrailsSince } from '../web/wander-state.ts'
import { canFoundNow, foundGate } from './found.ts'
import { checkPlan, placeIds } from './plan.ts'
import { readProjects } from '../builds/projects.ts'
import { clock, weekday } from './util.ts'
import { readWrittenPages } from './variety.ts'

const MAX_SHOWN_FOUND = 10
const MAX_SHOWN_KEPT = 5
/** The most start pages read lately shown to a plan. */
const MAX_SHOWN_READ_LATELY = 10

/**
 * Where a wander would read nothing new: today's starting points read lately (so each one marked "(read lately)" is explained),
 * then the first page each trip of the last 30 days really read, newest first, once each.
 */
function readLatelyStarts(t: Tick): { title: string; url: string }[] {
  const out: { title: string; url: string }[] = t.startingPoints.filter((p) => t.wander.readRecently(p.url)).map((p) => ({ title: p.title, url: p.url }))
  for (const trail of readTrailsSince(t.dir, t.today, 30).reverse()) {
    const first = trail.pages.find((p) => !p.failed)
    if (first && !out.some((o) => o.url === first.url)) out.push({ title: first.title, url: first.url })
  }
  return out.slice(0, MAX_SHOWN_READ_LATELY)
}

/** The notes shown to a decide call: those found and not answered (oldest first, so none waits for ever) and the latest it kept, to quote or build from. */
function noteLines(t: Tick) {
  const line = (n: Tick['visitorNotes'][number]) => {
    const key = foldName(n.name)
    const entry = key && !hiddenVisitor(key, t.w.notesHidden) ? t.visitors.visitors[key] : undefined
    return { id: n.id, status: n.status === 'found' ? 'found' : n.status, place: n.placeId, name: n.name, message: n.message, ...(entry && entry.notes >= 2 ? { talkedBefore: true } : {}) }
  }
  return [...t.visitorNotes.filter((n) => n.status === 'found').slice(0, MAX_SHOWN_FOUND).map(line), ...t.visitorNotes.filter((n) => n.status === 'kept').slice(-MAX_SHOWN_KEPT).map(line)]
}

/** Its projects for a decide call (spec-v4 3.2): building ones with their aims and last 3 captions, finished and dropped ones by name. */
function projectLines(t: Tick) {
  const { projects } = readProjects(t.dir)
  return {
    building: projects.filter((p) => p.status === 'building').map((p) => ({ id: p.id, name: p.name, aim: p.aim, captions: p.sessions.slice(-3).map((s) => s.caption) })),
    ended: projects.filter((p) => p.status !== 'building').slice(-10).map((p) => ({ name: p.name, status: p.status })),
  }
}

/** The limits plan validation applies, as facts about now: only the ones that are on, or that hold for every plan. Data already read for validation. */
function planLimits(t: Tick): PlanLimits {
  const { sameTopicWrites, sameWorkTinker } = t.config.variety
  const tired = tiredLimits({ mood: t.mood, energy: t.energy })
  const streak = sameWorkTinker.on ? sameWorkStreak(t.mind.recent.filter((r) => r.verb === 'tinker' && r.targetId).map((r) => r.targetId!)) : null
  return {
    ...(sameTopicWrites.on ? { writes: { limit: sameTopicWrites.limit, days: sameTopicWrites.days, topics: topicWriteCounts(readWrittenPages(t.dir, t.today, sameTopicWrites.days * 2), { nowMs: t.nowMs, days: sameTopicWrites.days }) } } : {}),
    ...(streak ? { sameWork: { limit: sameWorkTinker.limit, count: streak.count, title: streak.title } } : {}),
    ...(tired.maxSteps !== null ? { tired: { maxSteps: tired.maxSteps, blocked: t.deps.sessions ? ['expand', 'found', 'tinker', 'build'] : ['expand', 'found', 'tinker'] } } : {}),
    reasonChars: 140,
    ...(t.trips.date === t.today && t.trips.starts.length > 0 ? { tripsToday: t.trips.starts } : {}),
    ...(() => {
      const lately = readLatelyStarts(t)
      return lately.length > 0 ? { readLately: lately } : {}
    })(),
  }
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
    foundable: canFoundNow(t),
    fromRoman: (t.mind.fromRoman ?? []).map((x) => x.text),
    requests: openPlaceRequests(foundGate(t).requests).map((r) => ({ name: r.name, status: r.status })),
    triggers: t.triggers,
    localTime: `${weekday(tz, nowMs)} ${t.today} ${clock(tz, nowMs)}`,
    wakeTime: clock(tz, window.wakeMs),
    bedTime: clock(tz, window.bedMs),
    hoursLeft: Math.max(0, Math.round((window.bedMs - nowMs) / 3_600_000)),
    limits: planLimits(t),
    allowance: { points: t.mind.allowance?.points ?? 0, prices: livePrices(t.mind.prices) },
    mood: moodWords({ mood: t.mood, energy: t.energy }),
    justNow: t.justNow,
    beliefs: t.beliefs,
    memory: t.w.summary,
    interests: t.interests,
    past: readRecentPast(t.dir, t.today, t.w.art),
    startingPoints: t.startingPoints.map((p) => (t.wander.readRecently(p.url) ? { ...p, readLately: true } : p)),
    seenPages: unreadSeen(t.mind.seen ?? [], { not: t.startingPoints.map((p) => p.url), readRecently: t.wander.readRecently }),
    notes: noteLines(t),
    ...(t.deps.sessions ? { projects: projectLines(t) } : {}),
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
