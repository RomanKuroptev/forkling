import type { PlanStep } from '@forkling/schema'
import { MIND_VERBS, daysSinceCare, stepCost, validateMindPlan, type MindPlanContext, type MindStep, type MindVerb, type Trigger } from '@forkling/sim'
import { clampText, planStepFrom, type LlmStep } from '../decision.ts'
import type { ThinkKind } from '../prompts.ts'
import type { Tick } from './context.ts'
import { dropRepeatedStarts } from '../web/rails.ts'
import { expandablePlaces } from './expand.ts'
import { intentionSeed } from './util.ts'

const MAX_RECENT = 20

/** Home and the Workshop are the two places Merge starts with. They become place files in W5. */
export const STARTING_PLACES = ['home', 'workshop'] as const

export function thinkKindFor(triggers: readonly Trigger[]): ThinkKind | 'bedtime' {
  if (triggers.some((t) => t.kind === 'newDay')) return 'morning'
  if (triggers.some((t) => t.kind === 'bedtime')) return 'bedtime'
  if (triggers.some((t) => t.kind === 'weekly')) return 'weekly'
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
export const placeIds = (t: Pick<Tick, 'places'>): string[] => (t.places.length > 0 ? t.places.map((p) => p.id) : [...STARTING_PLACES])

/** What the plan check needs to know that is not in the plan: the day, the mood, the points in hand, what exists. */
export function planContext(t: Tick): MindPlanContext {
  return {
    startMs: t.nowMs,
    bedMs: t.window.bedMs,
    mood: { mood: t.mood, energy: t.energy },
    pointsInHand: t.mind.allowance?.points ?? 0,
    places: new Set(placeIds(t)),
    // Revisiting a place not cared for in 7 days; growth is the conditions of spec 2.5; founding arrives with requests (W6, slice 6) and notes with W7.
    revisitable: new Set(t.places.filter((p) => daysSinceCare({ lastCareAt: p.state.lastCareAt, founded: p.founded }, t.nowMs) >= 7).map((p) => p.id)),
    expandable: new Set(expandablePlaces(t).map((e) => e.id)),
    canFound: false,
    notes: new Set(),
    wants: [],
    recent: t.mind.recent,
    used: { repliesToday: 0, sketchesToday: t.mind.sketches?.date === t.today ? t.mind.sketches.count : 0, foundThisWeek: 0 },
    lastExpandedPlace: t.mind.lastExpandedPlace ?? null,
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
  const check = validateMindPlan(usable.map(mindStepOf), planContext(t))
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
    const cost = stepCost({ verb: step.verb as MindVerb, ...(step.size ? { size: step.size } : {}), ...(step.deep ? { deep: true } : {}) })
    t.mind.allowance = { ...t.mind.allowance, points: Math.max(0, t.mind.allowance.points - cost) }
  }
  t.mind.recent = [...t.mind.recent, { verb: step.verb, ...(step.targetId ? { targetId: step.targetId } : {}), at: t.nowIso }].slice(-MAX_RECENT)
  const goalRef = `today:${index}`
  const heldBeliefs = step.because && step.because.length > 0 ? { beliefRefs: step.because } : {}
  const targetName = step.targetId ? (t.objects.find((o) => o.id === step.targetId)?.name ?? step.targetId) : ''
  t.remember.push({
    at: t.nowIso,
    kind: 'step',
    text: `Started ${step.verb}${targetName ? ` (${targetName})` : ''}: ${started.reason}`,
    verb: step.verb,
    ...(step.targetId && t.objectIds.has(step.targetId) ? { objectId: step.targetId } : {}),
    goalRef,
    ...heldBeliefs,
  })
  t.steps.push({ at: t.nowIso, verb: step.verb, ...(step.targetId ? { targetId: step.targetId } : {}), reason: started.reason, goalRef, ...heldBeliefs })
  t.parts.push(`step ${index + 1}/${t.goals.today!.steps.length}: ${step.verb}`)
}
