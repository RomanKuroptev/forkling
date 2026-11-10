import type { PlanStep } from '@forkling/schema'
import { MIND_VERBS, stepCost, validateMindPlan, type MindPlanContext, type MindStep, type MindVerb, type Trigger } from '@forkling/sim'
import { clampText, planStepFrom, type LlmStep } from '../decision.ts'
import type { ThinkKind } from '../prompts.ts'
import type { Tick } from './context.ts'
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

/** What the plan check needs to know that is not in the plan: the day, the mood, the points in hand, what exists. */
export function planContext(t: Tick): MindPlanContext {
  return {
    startMs: t.nowMs,
    bedMs: t.window.bedMs,
    mood: { mood: t.mood, energy: t.energy },
    pointsInHand: t.mind.allowance?.points ?? 0,
    places: new Set(STARTING_PLACES),
    // Care of places, growth, founding and notes arrive with places (W5), requests (W6) and notes (W7).
    revisitable: new Set(),
    expandable: new Set(),
    canFound: false,
    notes: new Set(),
    wants: [],
    recent: t.mind.recent,
    used: { repliesToday: 0, sketchesToday: 0, foundThisWeek: 0 },
    lastExpandedPlace: null,
  }
}

/** The plan as plan steps, checked by the rules of spec 2.6. The steps come back with their minutes clamped to the verb's range. */
export function checkPlan(t: Tick, plan: LlmStep[]) {
  const steps = plan.map((s) => planStepFrom(s))
  const usable = steps.filter((s): s is PlanStep => s !== null)
  if (usable.length !== steps.length) return { usable, check: { ok: false, reasons: ['a step was missing its verb or its reason'] } as const }
  const check = validateMindPlan(usable.map(mindStepOf), planContext(t))
  if (!check.ok) return { usable, check }
  return { usable: usable.map((s, i) => ({ ...s, minutes: check.steps[i]!.minutes })), check }
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
