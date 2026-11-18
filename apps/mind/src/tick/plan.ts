import { SessionJob, sessionJobId, type PlanStep } from '@forkling/schema'
import { readWorks } from '../builds/works.ts'
import { MIND_VERBS, daysSinceCare, foundsInWeek, livePrices, overdueNotes, stepCost, validateMindPlan, type MindPlanContext, type MindStep, type MindVerb, type Trigger } from '@forkling/sim'
import { clampText, planStepFrom, type LlmStep } from '../decision.ts'
import type { ThinkKind } from '../prompts.ts'
import type { Tick } from './context.ts'
import { dropRepeatedStarts, startKey } from '../web/rails.ts'
import { expandablePlaces } from './expand.ts'
import { foundGate } from './found.ts'
import { intentionSeed } from './util.ts'
import { readWrittenPages, varietyFor } from './variety.ts'
import { readProjects } from '../builds/projects.ts'
import { rememberJobWant } from './wants.ts'
import { paceAhead } from '../budget.ts'

const MAX_RECENT = 20

/** Home and the Workshop are the two places Merge starts with. They become place files in W5. */
export const STARTING_PLACES = ['home', 'workshop'] as const

export function thinkKindFor(triggers: readonly Trigger[]): ThinkKind {
  if (triggers.some((t) => t.kind === 'newDay')) return 'morning'
  return 'decide'
}

const mindStepOf = (s: PlanStep): MindStep => ({
  verb: s.verb as MindVerb,
  target: s.targetId ?? null,
  reason: s.reason,
  minutes: s.minutes,
  wantId: s.wantId ?? null,
  ...(s.deep ? { deep: true } : {}),
  ...(s.size ? { size: s.size } : {}),
})

/** The ids of the places the plan may name: the place files, or Home and the Workshop in a world that has none yet. */
/** The ids a write may be a caption for (spec v4 6): every place and every work, those made in this tick included. Project ids join with step 4. */
export const captionTargets = (t: Pick<Tick, 'places' | 'dir' | 'newWorks'>): Set<string> =>
  new Set([...placeIds(t), ...readWorks(t.dir).map((w) => w.id), ...t.newWorks.map((w) => w.meta.id)])

export const placeIds = (t: Pick<Tick, 'places'>): string[] => (t.places.length > 0 ? t.places.map((p) => p.id) : [...STARTING_PLACES])

/** The variety switches that are on, or nothing. The pages are read only when a switch needs them. */
function withVariety(t: Tick): { variety?: MindPlanContext['variety'] } {
  const variety = varietyFor(t.config, (days) => readWrittenPages(t.dir, t.today, days), t.mind.recent)
  return variety ? { variety } : {}
}

/**
 * Today's starting points, when there are any: the plan must have a trip that starts from one unless one already has (`trips.starts`
 * holds the key of every start today). With none known (a world with no web, or the front pages down) there is nothing to ask for.
 */
function withPoints(t: Tick): { points?: NonNullable<MindPlanContext['points']> } {
  if (t.startingPoints.length === 0) return {}
  const keys = new Set(t.startingPoints.map((p) => startKey(p.url)))
  return { points: { isPoint: (target) => keys.has(startKey(target)), takenToday: (t.trips.date === t.today ? t.trips.starts : []).some((k) => keys.has(k)) } }
}

/** What the plan check needs to know that is not in the plan: the day, the mood, the points in hand, what exists. */
/** Its projects, for a build step's target: the ones building, and the ones done or abandoned. */
function projectsContext(dir: string): NonNullable<MindPlanContext['projects']> {
  const { projects } = readProjects(dir)
  const brief = (p: { id: string; name: string }) => ({ id: p.id, name: p.name })
  return { building: projects.filter((p) => p.status === 'building').map(brief), ended: projects.filter((p) => p.status !== 'building').map(brief) }
}

export function planContext(t: Tick): MindPlanContext {
  return {
    startMs: t.nowMs,
    bedMs: t.window.bedMs,
    mood: { mood: t.mood, energy: t.energy },
    pointsInHand: t.mind.allowance?.points ?? 0,
    places: new Set(placeIds(t)),
    // Revisiting a place not cared for in 7 days; growth is the conditions of spec 2.5; founding arrives with requests (W6, slice 6) and notes with W7 (slice 9).
    revisitable: new Set(t.places.filter((p) => p.state.closed === null && daysSinceCare({ lastCareAt: p.state.lastCareAt, founded: p.founded }, t.nowMs) >= 7).map((p) => p.id)),
    expandable: new Set(expandablePlaces(t).map((e) => e.id)),
    expandEarned: new Set(expandablePlaces(t).filter((e) => e.earned.earned).map((e) => e.id)),
    captionTargets: captionTargets(t),
    canFound: foundGate(t).check.ok,
    notes: new Set(t.visitorNotes.filter((n) => n.status === 'found').map((n) => n.id)),
    wants: t.wants,
    prices: livePrices(t.mind.prices),
    longGoal: t.goals.long != null,
    recent: t.mind.recent,
    used: { repliesToday: t.mind.replies?.date === t.today ? t.mind.replies.count : 0, foundThisWeek: foundsInWeek(t.mind.founds ?? [], t.nowMs) },
    lastExpandedPlace: t.mind.lastExpandedPlace ?? null,
    ...withVariety(t),
    ...withPoints(t),
    overdueNotes: new Set(overdueNotes(t.visitorNotes, t.nowMs)),
    projects: projectsContext(t.dir),
    buildAvailable: t.deps.sessions === true,
    paceAhead: paceAhead(t.budget, t.today, t.credits),
  }
}

/**
 * The plan as plan steps, checked by the rules of spec 2.6. A wander that starts where a trip already started today is taken
 * out first (the trip-start rail, spec 12.2) and the rest stands, so the check sees the plan as it will run. The steps come
 * back with their minutes clamped to the verb's range.
 */
export function checkPlan(t: Tick, plan: LlmStep[]) {
  const steps = plan.map((s) => planStepFrom(s))
  const made = steps.filter((s): s is PlanStep => s !== null)
  if (made.length !== steps.length) return { usable: made, droppedStarts: [] as string[], check: { ok: false, reasons: ['a step was missing its verb or its reason'] } as const }
  const rail = dropRepeatedStarts(made, t.trips.date === t.today ? t.trips.starts : [])
  const usable = rail.steps
  const check = validateMindPlan(usable.map(mindStepOf), { ...planContext(t), removedSteps: rail.dropped.length })
  if (!check.ok) return { usable, droppedStarts: rail.dropped, check }
  return { usable: usable.map((s, i) => ({ ...s, minutes: check.steps[i]!.minutes })), droppedStarts: rail.dropped, check }
}

/** Begins step `index` of today's plan: a focus window for the body, and an intention that says why. */
export function startStep(t: Tick, index: number, reason?: string): void {
  const step = t.goals.today?.steps[index]
  if (!step) return
  t.goals.now = { index, startedAt: t.nowIso, until: new Date(t.nowMs + step.minutes * 60_000).toISOString() }
  const started = {
    // The body shows a mind verb as one of its own actions (the pack's `mindPoses`).
    type: t.pack.mindPoses[step.verb] ?? step.verb,
    // What a mind verb is aimed at (a topic, a place, an idea) is the step's, not a thing the body walks to.
    ...(step.targetId && !MIND_VERBS.includes(step.verb as MindVerb) ? { targetId: step.targetId } : {}),
    startedAt: t.nowIso,
    seed: intentionSeed(t.forkling.seed, t.nowMs),
    reason: clampText(reason?.trim() || step.reason, 200),
    goalRef: `today:${index}`,
  }
  t.started = started
  // A step spends its points when it starts, so the next plan is made with what is left.
  if ((MIND_VERBS as readonly string[]).includes(step.verb) && t.mind.allowance) {
    const cost = stepCost({ verb: step.verb as MindVerb, ...(step.size ? { size: step.size } : {}), ...(step.deep ? { deep: true } : {}), ...(step.verb === 'write' && step.targetId && captionTargets(t).has(step.targetId) ? { caption: true } : {}), ...(step.verb === 'expand' && expandablePlaces(t).some((e) => e.id === step.targetId && e.earned.earned) ? { earned: true } : {}) }, livePrices(t.mind.prices))
    t.mind.allowance = { ...t.mind.allowance, points: Math.max(0, t.mind.allowance.points - cost) }
  }
  // A build step asks the worker for a session (spec-v4 3.3) and holds the plan until its result arrives (`settleJobs`).
  if (step.verb === 'build' && step.targetId) {
    t.newJobs.push(SessionJob.parse({ id: sessionJobId(t.nowIso), kind: 'session', requestedAt: t.nowIso, target: clampText(step.targetId, 60), reason: clampText(step.reason, 200), pointsInHand: t.mind.allowance?.points ?? 0 }))
    rememberJobWant(t, sessionJobId(t.nowIso), step.wantId)
  }
  t.mind.recent = [...t.mind.recent, { verb: step.verb, ...(step.targetId ? { targetId: step.targetId } : {}), at: t.nowIso }].slice(-MAX_RECENT)
  const goalRef = `today:${index}`
  const heldBeliefs = step.because && step.because.length > 0 ? { beliefRefs: step.because } : {}
  const targetName = step.targetId ?? ''
  t.remember.push({
    at: t.nowIso,
    kind: 'step',
    text: `Started ${step.verb}${targetName ? ` (${targetName})` : ''}: ${started.reason}`,
    verb: step.verb,
    goalRef,
    ...heldBeliefs,
  })
  t.steps.push({ at: t.nowIso, verb: step.verb, ...(step.targetId ? { targetId: step.targetId } : {}), reason: started.reason, goalRef, ...heldBeliefs })
  t.parts.push(`step ${index + 1}/${t.goals.today!.steps.length}: ${step.verb}`)
}
