import type { PlanStep, SpeciesAction, SpeciesPack, WorldObject } from '@forkling/schema'
import { isDusk } from './time.ts'

/** The same verb this many times in a row is a fixation. */
export const MAX_VERB_RUN = 2
/** The same target this many times in a row is a fixation. */
export const MAX_TARGET_RUN = 3
const MAX_STEPS = 12
const MAX_PLAN_MINUTES = 16 * 60

export interface PlanContext {
  pack: SpeciesPack
  /** Spot kinds the world offers (`perch`, `sunbeam`, `food`...). */
  spotKinds: ReadonlySet<string>
  objects: readonly WorldObject[]
  /** When the first step would start, Unix ms. */
  startMs: number
  /** Whether the forkling would be in bed at a Unix time. */
  asleepAt: (ms: number) => boolean
  /** Local hour of day, 0 to 24, at a Unix time. */
  hourAt: (ms: number) => number
  /** The steps it took just before this plan, oldest first. */
  recent: readonly { verb: string; targetId?: string | undefined }[]
}

export type PlanResult = { ok: true } | { ok: false; reasons: string[] }

/** Whether `targetId` is a place `action` can happen: its own spot kind, or an object that offers that kind. */
function reachableTarget(action: SpeciesAction & { target: { type: 'spot'; kind: string } }, targetId: string, ctx: PlanContext): boolean {
  const kind = action.target.kind
  if (targetId === kind) return ctx.spotKinds.has(kind)
  return ctx.objects.some((o) => o.id === targetId && o.affordances.includes(kind as never))
}

function checkStep(step: PlanStep, n: number, startMs: number, ctx: PlanContext): string[] {
  const action = ctx.pack.actions.find((a) => a.id === step.verb)
  if (!action) return [`step ${n}: "${step.verb}" is not something a ${ctx.pack.id} can do`]
  const label = `step ${n} ("${step.verb}")`

  if (action.requires.includes('visitorNearby') || action.target.type === 'visitor') {
    return [`${label} needs a visitor nearby, which cannot be planned ahead`]
  }

  const reasons: string[] = []
  const target = action.target
  if (target.type === 'none') {
    if (step.targetId !== undefined || step.position !== undefined) reasons.push(`${label} goes nowhere in particular, so it takes no target`)
  } else if (target.type === 'wander') {
    if (step.targetId !== undefined) reasons.push(`${label} wanders, so it takes a position, not "${step.targetId}"`)
  } else {
    if (step.position !== undefined) reasons.push(`${label} happens at a ${target.kind}, so it takes no position`)
    if (step.targetId !== undefined && !reachableTarget({ ...action, target }, step.targetId, ctx)) {
      reasons.push(`${label}: "${step.targetId}" is not somewhere ${step.verb} can happen`)
    }
  }

  const asleep = ctx.asleepAt(startMs)
  for (const req of action.requires) {
    const ok = req === 'day' ? !asleep : req === 'night' ? asleep : req === 'dusk' ? isDusk(ctx.hourAt(startMs)) : true
    if (!ok) reasons.push(`step ${n} ("${step.verb}") cannot happen then: it needs ${req}`)
  }
  return reasons
}

/** The longest run, ending anywhere, of consecutive equal keys; returns the key that first reaches `limit + 1`. */
function fixation(keys: readonly (string | undefined)[], limit: number): string | null {
  let run = 0
  for (let i = 0; i < keys.length; i++) {
    run = keys[i] !== undefined && keys[i] === keys[i - 1] ? run + 1 : 1
    if (keys[i] !== undefined && run > limit) return keys[i]!
  }
  return null
}

/**
 * Whether a plan can actually be carried out, and why not if it can't. The mind's plans are free text and verbs; this
 * is the only gate between them and the body. Reports every problem it finds, not just the first.
 */
export function validatePlan(steps: readonly PlanStep[], ctx: PlanContext): PlanResult {
  const reasons: string[] = []
  if (steps.length < 1 || steps.length > MAX_STEPS) reasons.push(`a plan needs 1 to ${MAX_STEPS} steps, not ${steps.length}`)

  let minutes = 0
  steps.forEach((step, i) => {
    reasons.push(...checkStep(step, i + 1, ctx.startMs + minutes * 60_000, ctx))
    minutes += step.minutes
  })
  if (minutes > MAX_PLAN_MINUTES) reasons.push(`the plan takes ${Math.round(minutes / 60)} hours, more than a day's waking`)

  const all = [...ctx.recent, ...steps]
  const verb = fixation(all.map((s) => s.verb), MAX_VERB_RUN)
  if (verb) reasons.push(`"${verb}" would be done more than ${MAX_VERB_RUN} times in a row`)
  const target = fixation(all.map((s) => s.targetId), MAX_TARGET_RUN)
  if (target) reasons.push(`"${target}" would be the target more than ${MAX_TARGET_RUN} times in a row`)

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons }
}
