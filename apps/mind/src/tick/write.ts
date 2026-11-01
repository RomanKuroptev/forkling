import { Forkling, type Goals, type Intention, type MindState } from '@forkling/schema'
import { toRepoIntention } from '@forkling/sim'
import { renderPlan } from '../reading.ts'
import { appendStream, appendTimeline, prune } from '../stream.ts'
import { deleteFile, writeJson, writeText } from '../world.ts'
import type { Tick, TickResult } from './context.ts'
import { epochOf, round, same } from './util.ts'

/**
 * Running totals the tick adds to from the replayed body (the time on a step, the times it was broken off) are written
 * only when something else is. The next tick's tally starts at the last write, so the stretch in between is counted
 * once, and a quiet tick leaves the world's files alone.
 */
const withoutWorked = (g: Goals): Goals => {
  if (!g.now) return g
  const { workedSec: _worked, ...now } = g.now
  return { ...g, now }
}
const withoutBrokenOff = (m: MindState): Omit<MindState, 'brokenOff'> => {
  const { brokenOff: _broken, ...rest } = m
  return rest
}

/** Wake, bedtime and the body: written when something happened, or once per half hour so the repo stays fresh. */
export function writeWorld(t: Tick): TickResult {
  const { dir, deps, w, forkling, goals, mind, budget, skills, beliefs, interests, holding, stored, temperament, asleep, nowMs, nowIso, today, parts } = t
  if (asleep !== forkling.asleep) parts.push(asleep ? 'went to bed' : 'woke up')
  const inboxConsumed = t.thought && w.inbox.length > 0
  const goalsChanged = !same(withoutWorked(goals), withoutWorked(w.goals))
  const mindChanged = !same(withoutBrokenOff(mind), withoutBrokenOff(w.mindState))
  const workedChanged = goals.now?.workedSec !== w.goals.now?.workedSec
  const brokenOffChanged = !same(mind.brokenOff, w.mindState.brokenOff)
  const budgetChanged = !same(budget, w.budget)
  const skillsChanged = !same(skills, w.skills)
  const beliefsChanged = !same(beliefs, w.beliefs)
  const interestsChanged = !same(interests, w.interests)
  const carryingChanged = !same(holding, forkling.holding) || !same(stored, forkling.stored)
  const writeBody =
    t.started !== null ||
    goalsChanged ||
    mindChanged ||
    inboxConsumed ||
    skillsChanged ||
    carryingChanged ||
    t.rolled ||
    asleep !== forkling.asleep ||
    (t.appraisals.length > 0 && t.mood !== forkling.mood) ||
    t.lateNight !== forkling.lateNight ||
    epochOf(nowMs) !== epochOf(Date.parse(forkling.lastTickAt))

  const written: string[] = []
  if (!deps.dryRun) {
    const { body, mood, feelings, lateNight } = t
    if (writeBody) {
      const active = goals.now && goals.today?.steps[goals.now.index]
      const bodyIntention = toRepoIntention(body.intention)
      const inPack = t.pack.actions.some((a) => a.id === bodyIntention.type)
      // A step the mind is focused on keeps its own reason and link; anything else the body chose keeps the pack's.
      const onStep = active && inPack && bodyIntention.type === active.verb && nowMs < Date.parse(goals.now!.until)
      const intention: Intention =
        t.started ??
        (onStep
          ? { ...bodyIntention, reason: active.reason, goalRef: `today:${goals.now!.index}` }
          : inPack
            ? bodyIntention
            : forkling.intention)
      const { holding: _held, ...rest } = forkling
      const next = Forkling.parse({
        ...rest,
        needs: Object.fromEntries(Object.entries(body.needs).map(([id, v]) => [id, round(v, 1)])),
        position: [round(body.pos.x, 2), 0, round(body.pos.z, 2)],
        mood,
        feelings: { valence: round(feelings.valence, 2), arousal: round(feelings.arousal, 2) },
        intention,
        ...(holding ? { holding } : {}),
        stored,
        asleep,
        ...(lateNight ? { lateNight } : {}),
        lastTickAt: nowIso,
      })
      if (writeJson(dir, 'forkling.json', next)) written.push('forkling.json')
    }
    for (const id of t.touched) {
      const object = t.objects.find((o) => o.id === id)
      if (object && writeJson(dir, `objects/${id}.json`, object)) written.push(`objects/${id}.json`)
    }
    for (const id of t.gone) {
      deleteFile(dir, `objects/${id}.json`)
      written.push(`objects/${id}.json`)
    }
    if ((goalsChanged || (writeBody && workedChanged)) && writeJson(dir, 'mind/goals.json', goals)) written.push('mind/goals.json')
    if ((mindChanged || (writeBody && brokenOffChanged)) && writeJson(dir, 'mind/state.json', mind)) written.push('mind/state.json')
    if (budgetChanged && writeJson(dir, 'brain/budget.json', budget)) written.push('brain/budget.json')
    if (skillsChanged && writeJson(dir, 'brain/skills.json', skills)) written.push('brain/skills.json')
    if (t.rolled && temperament && writeJson(dir, 'brain/temperament.json', temperament)) written.push('brain/temperament.json')
    if (beliefsChanged && writeJson(dir, 'memory/beliefs.json', beliefs)) written.push('memory/beliefs.json')
    if (interestsChanged && writeJson(dir, 'brain/interests.json', interests)) written.push('brain/interests.json')
    if (t.planPage && writeText(dir, `notebook/plans/${today}.md`, renderPlan(today, goals))) written.push(`notebook/plans/${today}.md`)
    for (const request of t.buildRequests) if (writeJson(dir, `mind/builds/${request.id}.json`, request)) written.push(`mind/builds/${request.id}.json`)
    for (const art of t.madeArt) if (writeJson(dir, `art/${art.id}.json`, art)) written.push(`art/${art.id}.json`)
    for (const page of t.notebook) if (writeText(dir, page.path, page.text)) written.push(page.path)
    if (t.journal && writeText(dir, `journal/${t.journal.date}.md`, t.journal.text)) written.push(`journal/${t.journal.date}.md`)
    if (t.summaryNext && writeText(dir, 'memory/summary.md', t.summaryNext)) written.push('memory/summary.md')
    if (t.remember.length > 0) {
      appendStream(dir, today, t.remember)
      written.push(`memory/stream/${today}.jsonl`)
    }
    if (t.steps.length > 0) {
      for (const entry of t.steps) appendTimeline(dir, today, entry)
      written.push(`memory/timeline/${today}.jsonl`)
    }
    // A new morning clears out streams past their keeping time.
    if (!asleep && forkling.asleep) written.push(...prune(dir, today))
    if (inboxConsumed) {
      for (const item of w.inbox) {
        deleteFile(dir, item.path)
        written.push(item.path)
      }
    }
  }

  const summary = parts.length > 0 ? parts.join(', ') : written.length > 0 ? 'sync' : ''
  return { changed: written.length > 0, logged: false, summary, written, notes: t.notes, calls: t.calls, photos: mind.photos?.queue.length ?? 0, build: t.buildRequests[0]?.id ?? null, ...(t.prompt ? { prompt: t.prompt } : {}) }
}
