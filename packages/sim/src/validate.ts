import type { Holding, PlanStep, Skills, SpeciesAction, SpeciesPack, WorldObject } from '@forkling/schema'
import { applyStep, type StepWorld, type Stored } from './effects.ts'
import type { Point2 } from './nav.ts'
import { offersSpot, portionsLeft } from './objects.ts'
import { skillLevel } from './skills.ts'
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
  /** What is in its paws and stored at home when the plan starts. Missing means nothing. */
  holding?: Holding | undefined
  stored?: Stored
  /** Where it stands when the plan starts, in meters. */
  position?: Point2
  skills?: Skills
  /** How many more things it may make today (a creative step leaves something in `art/`). Missing means no limit. */
  creativeLeft?: number
  /** How many more reading sessions (read or study steps) it may have today. Missing means no limit. */
  readingsLeft?: number
  /** How many more eye-cam frames it may take today. Photographing has its own limit and does not use `creativeLeft`. Missing means no limit. */
  photosLeft?: number
  /** How many more coded projects it may ask for this week. Missing means no limit. */
  codeLeft?: number
  /** Seed for the looks of what the plan makes. Only matters to what the simulation leaves behind, never to whether it works. */
  seed?: number
}

export type PlanResult = { ok: true } | { ok: false; reasons: string[] }

/** Whether `targetId` is a place `action` can happen: its own spot kind, or an object that offers that kind. */
function reachableTarget(action: SpeciesAction & { target: { type: 'spot'; kind: string } }, targetId: string, objects: readonly WorldObject[], ctx: PlanContext): boolean {
  const kind = action.target.kind
  if (targetId === kind) return ctx.spotKinds.has(kind)
  return objects.some((o) => o.id === targetId && offersSpot(o, kind))
}

/** What can be told about a step without playing it out: the verb exists, its target has the right shape, the time suits. */
function checkStep(step: PlanStep, n: number, startMs: number, objects: readonly WorldObject[], ctx: PlanContext): string[] {
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
  } else if (target.type === 'object') {
    if (step.position !== undefined) reasons.push(`${label} happens at an object, so it takes no position`)
  } else {
    if (step.position !== undefined) reasons.push(`${label} happens at a ${target.kind}, so it takes no position`)
    if (step.targetId !== undefined && !reachableTarget({ ...action, target }, step.targetId, objects, ctx)) {
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
 * is the only gate between them and the body. It plays the plan out on a copy of the world, so a step that needs wood
 * is turned down unless an earlier one left wood in its paws. Reports every problem it finds, not just the first.
 */
export function validatePlan(steps: readonly PlanStep[], ctx: PlanContext): PlanResult {
  const reasons: string[] = []
  if (steps.length < 1 || steps.length > MAX_STEPS) reasons.push(`a plan needs 1 to ${MAX_STEPS} steps, not ${steps.length}`)

  let world: StepWorld = { holding: ctx.holding, stored: ctx.stored ?? {}, position: ctx.position ?? { x: 0, z: 0 }, objects: ctx.objects }
  const verbKeys: (string | undefined)[] = ctx.recent.map((s) => s.verb)
  const targetKeys: (string | undefined)[] = ctx.recent.map((s) => s.targetId)

  let minutes = 0
  steps.forEach((step, i) => {
    const n = i + 1
    const startMs = ctx.startMs + minutes * 60_000
    const found = checkStep(step, n, startMs, world.objects, ctx)
    reasons.push(...found)

    const verb = ctx.pack.actions.find((a) => a.id === step.verb)
    // Carrying on with something half made is not a fixation, however many sessions it takes.
    let continuing = false
    if (found.length === 0 && verb) {
      const target = step.targetId === undefined ? undefined : world.objects.find((o) => o.id === step.targetId)
      continuing = verb.effect === 'make' && target?.made !== undefined && !target.made.done
      const result = applyStep(world, step, verb, { nowMs: startMs, skill: skillLevel(ctx.skills ?? {}, verb.group), seed: ctx.seed ?? 0 })
      // A step that cannot happen is taken to have done nothing, so later steps are judged on what really is there.
      if (result.ok) world = result.world
      else reasons.push(`step ${n} ("${step.verb}"): ${result.reason}`)
    }
    verbKeys.push(continuing ? undefined : step.verb)
    targetKeys.push(step.targetId)
    minutes += step.minutes
  })
  if (minutes > MAX_PLAN_MINUTES) reasons.push(`the plan takes ${Math.round(minutes / 60)} hours, more than a day's waking`)

  // Food that has run out cannot be eaten: the plan would walk there and find nothing.
  steps.forEach((step, n) => {
    const verb = ctx.pack.actions.find((a) => a.id === step.verb)
    const target = step.targetId ? ctx.objects.find((o) => o.id === step.targetId) : undefined
    if (verb && target && Object.values(verb.satisfies).some((v) => (v ?? 0) > 0) && portionsLeft(target) === 0) reasons.push(`step ${n + 1}: ${target.name} is empty`)
  })

  if (ctx.creativeLeft !== undefined) {
    const making = steps.filter((s) => {
      const artifact = ctx.pack.actions.find((a) => a.id === s.verb)?.artifact
      return artifact !== undefined && artifact !== 'photo' && artifact !== 'code'
    }).length
    if (making > ctx.creativeLeft) reasons.push(`the plan would make ${making} ${making === 1 ? 'thing' : 'things'}, but there is room for ${ctx.creativeLeft} more today`)
  }
  if (ctx.readingsLeft !== undefined) {
    const reading = steps.filter((s) => {
      const effect = ctx.pack.actions.find((a) => a.id === s.verb)?.effect
      return effect === 'read' || effect === 'study'
    }).length
    if (reading > ctx.readingsLeft) reasons.push(`the plan would have ${reading} reading ${reading === 1 ? 'session' : 'sessions'}, but there is room for ${ctx.readingsLeft} more today`)
  }
  if (ctx.photosLeft !== undefined) {
    const photographs = steps.filter((s) => ctx.pack.actions.find((a) => a.id === s.verb)?.artifact === 'photo').length
    if (photographs > ctx.photosLeft) reasons.push(`the plan would take ${photographs} ${photographs === 1 ? 'photograph' : 'photographs'}, but there ${ctx.photosLeft === 1 ? 'is 1 frame' : `are ${ctx.photosLeft} frames`} left today`)
  }

  if (ctx.codeLeft !== undefined) {
    const coding = steps.filter((s) => ctx.pack.actions.find((a) => a.id === s.verb)?.artifact === 'code').length
    if (coding > ctx.codeLeft) reasons.push(`the plan would start ${coding} coded ${coding === 1 ? 'project' : 'projects'}, but there is room for ${ctx.codeLeft} this week`)
  }

  const verb = fixation(verbKeys, MAX_VERB_RUN)
  if (verb) reasons.push(`"${verb}" would be done more than ${MAX_VERB_RUN} times in a row`)
  const target = fixation(targetKeys, MAX_TARGET_RUN)
  if (target) reasons.push(`"${target}" would be the target more than ${MAX_TARGET_RUN} times in a row`)

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons }
}
