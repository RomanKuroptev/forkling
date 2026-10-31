import { Intention, type Holding, type MicroBehavior, type PlanStep, type Skills, type SpeciesPack, type WorldObject } from '@forkling/schema'
import { applyStep, type StepEvent, type Stored } from './effects.ts'
import { createForkling, setFocus, stepForkling, STEP, toRepoIntention, type Focus, type StepContext } from './forkling.ts'
import { isWalkable, nearestWalkable, type Point2 } from './nav.ts'
import type { Needs } from './needs.ts'
import { addXp, skillLevel } from './skills.ts'
import { sunDirection } from './sky.ts'
import { starterWorld, worldWithObjects, type StarterWorld } from './starter.ts'
import { collectSpots } from './world.ts'

export interface HeadlessOptions {
  pack: SpeciesPack
  behaviors?: MicroBehavior[]
  seed: number
  /** Hour of day to start at, 0 to 24. */
  startHour: number
  seconds: number
  /** A visitor that stalks the forkling from `arrive` seconds, stops near it, and leaves at `leave`. */
  visitor?: { arrive: number; leave: number }
  world?: StarterWorld
  /** Starting need values; the rest start at the pack's initial values. */
  needs?: Needs
  /** Favour this action and target until `until` seconds into the run. */
  focus?: Focus
  /** Start with full paws. */
  holding?: boolean
}

export interface HeadlessRun {
  /** Rounded positions and intention starts, for comparing runs. */
  trace: string[]
  intentionTypes: Set<string>
  /** Micro-behaviors seen, with the hour they were seen at. */
  micros: { id: string; hour: number }[]
  /** Longest run of consecutive steps spent moving without moving. */
  maxStuckSteps: number
  /** Steps spent off walkable ground. */
  offGrid: number
  needsOutOfRange: number
  /** Steps where a need rose without an action that satisfies it being performed. */
  illegalRises: string[]
  badIntentions: number
  /** When the forkling first noticed the visitor, and when its current intention started at that moment. */
  noticeStep: { time: number; startedAt: number } | null
  slots: Set<string>
  /** `action:target` for every intention started (`action:` when it had no target). */
  targets: string[]
  /** Where it was, sampled every second. */
  positions: Point2[]
}

/**
 * Run a forkling for a while with no renderer, against the starter island, checking the sim's invariants as it
 * goes. Used by the sim and species-pack tests, and the same run is what a world repo's CI will do.
 */
export function runHeadless(opts: HeadlessOptions): HeadlessRun {
  const { pack, behaviors = [] } = opts
  const world = opts.world ?? starterWorld()
  const start = nearestWalkable(world.nav.grid, { x: 0, z: 0 })!
  const state = createForkling(pack, behaviors, opts.seed, start, {
    ...(opts.needs ? { needs: opts.needs } : {}),
    ...(opts.focus ? { focus: opts.focus } : {}),
    ...(opts.holding ? { holding: true } : {}),
  })
  const run: HeadlessRun = {
    trace: [],
    intentionTypes: new Set(),
    micros: [],
    maxStuckSteps: 0,
    offGrid: 0,
    needsOutOfRange: 0,
    illegalRises: [],
    badIntentions: 0,
    noticeStep: null,
    slots: new Set(),
    targets: [],
    positions: [],
  }
  const radius = pack.perception.noticeRadius
  let visitor: Point2 | null = null
  let stuck = 0
  let lastMinute = -1
  let spots: Record<string, Point2[]> = {}
  let lastIntentionStart = -1
  const steps = Math.round(opts.seconds / STEP)

  for (let i = 0; i < steps; i++) {
    const t = i * STEP
    const hour = (opts.startHour + t / 3600) % 24
    // Sunbeams are refreshed once a simulated minute, like the viewer does.
    if (Math.floor(t / 60) !== lastMinute) {
      lastMinute = Math.floor(t / 60)
      spots = collectSpots(pack, world.cfg, world.nav, world.spawn, sunDirection(hour), world.objects)
    }

    if (opts.visitor && t >= opts.visitor.arrive && t < opts.visitor.leave) {
      if (!visitor) visitor = { x: state.pos.x + 14, z: state.pos.z }
      const d = Math.hypot(state.pos.x - visitor.x, state.pos.z - visitor.z)
      // Walk towards the forkling at 1.5 m/s until noticed or close, then stand still.
      if (d > 2.5 && !run.noticeStep) {
        visitor = {
          x: visitor.x + ((state.pos.x - visitor.x) / d) * 1.5 * STEP,
          z: visitor.z + ((state.pos.z - visitor.z) / d) * 1.5 * STEP,
        }
      }
    } else if (opts.visitor && t >= opts.visitor.leave && visitor) {
      visitor = { x: visitor.x + 1.5 * STEP, z: visitor.z }
      if (Math.hypot(visitor.x - state.pos.x, visitor.z - state.pos.z) > 40) visitor = null
    }

    const before = { ...state.needs }
    const posBefore = { ...state.pos }
    const ctx: StepContext = { grid: world.nav.grid, visitor, timeOfDay: hour, spots }
    const wasNoticed = visitor !== null && Math.hypot(posBefore.x - visitor.x, posBefore.z - visitor.z) <= radius
    stepForkling(state, STEP, ctx)

    if (wasNoticed && !run.noticeStep) run.noticeStep = { time: state.time, startedAt: state.intention.startedAt }

    for (const [id, value] of Object.entries(state.needs)) {
      if (value < 0 || value > 100 || Number.isNaN(value)) run.needsOutOfRange++
      const prev = before[id as keyof typeof before] ?? 0
      if (value > prev + 1e-9) {
        const gain = (state.action.satisfies as Record<string, number | undefined>)[id] ?? 0
        if (state.phase !== 'acting' || gain <= 0) {
          run.illegalRises.push(`${id}@${state.time.toFixed(1)} ${state.action.id}/${state.phase}`)
        }
      }
    }
    if (!isWalkable(world.nav.grid, state.pos.x, state.pos.z)) run.offGrid++
    if (state.phase === 'moving') {
      stuck = Math.hypot(state.pos.x - posBefore.x, state.pos.z - posBefore.z) < 1e-6 ? stuck + 1 : 0
      run.maxStuckSteps = Math.max(run.maxStuckSteps, stuck)
    } else {
      stuck = 0
    }
    if (state.intention.startedAt !== lastIntentionStart) {
      lastIntentionStart = state.intention.startedAt
      run.intentionTypes.add(state.intention.type)
      if (!Intention.safeParse(toRepoIntention(state.intention)).success) run.badIntentions++
      run.targets.push(`${state.intention.type}:${state.intention.targetId ?? ''}`)
      run.trace.push(`${state.intention.type}@${state.intention.startedAt.toFixed(1)}`)
    }
    if (state.micro) {
      const id = state.micro.behavior.id
      if (!run.micros.some((m) => m.id === id && Math.abs(m.hour - hour) < 0.05)) run.micros.push({ id, hour })
    }
    run.slots.add(state.slot)
    if (i % 10 === 0) run.positions.push({ x: state.pos.x, z: state.pos.z })
    if (i % 10 === 0) run.trace.push(`${state.pos.x.toFixed(2)},${state.pos.z.toFixed(2)}`)
  }
  return run
}

export interface PlanRunOptions {
  pack: SpeciesPack
  behaviors?: MicroBehavior[]
  seed: number
  /** Unix ms when the first step starts. */
  startMs: number
  steps: readonly PlanStep[]
  objects: readonly WorldObject[]
  holding?: Holding
  stored?: Stored
  skills?: Skills
  needs?: Needs
}

export interface PlanStepRun {
  n: number
  verb: string
  ok: boolean
  reason?: string
  /** Where the body stood when the step ended. */
  position: Point2
  events: StepEvent[]
}

export interface PlanRun {
  steps: PlanStepRun[]
  objects: WorldObject[]
  holding: Holding | undefined
  stored: Stored
  skills: Skills
}

/**
 * Play a plan out with no renderer: the body does each step for its minutes, then the step's effect lands on the
 * world, as the mind will do it for real. Stops at the first step that cannot happen. The world gets rebuilt for every
 * step, so what one step makes (or picks up) is there, or gone, for the next.
 */
export function runPlan(opts: PlanRunOptions): PlanRun {
  const { pack, behaviors = [] } = opts
  let objects: WorldObject[] = [...opts.objects]
  let holding = opts.holding
  let stored: Stored = opts.stored ?? {}
  let skills: Skills = opts.skills ?? {}

  const first = worldWithObjects(objects)
  const start = nearestWalkable(first.nav.grid, { x: first.spawn.x, z: first.spawn.z }, 25) ?? { x: first.spawn.x, z: first.spawn.z }
  const body = createForkling(pack, behaviors, opts.seed, start, opts.needs ? { needs: opts.needs } : {})
  const steps: PlanStepRun[] = []

  let elapsed = 0
  for (const [i, step] of opts.steps.entries()) {
    const n = i + 1
    const verb = pack.actions.find((a) => a.id === step.verb)
    if (!verb) {
      steps.push({ n, verb: step.verb, ok: false, reason: `"${step.verb}" is not something a ${pack.id} can do`, position: { ...body.pos }, events: [] })
      break
    }

    const world = worldWithObjects(objects)
    const hour = (((opts.startMs + elapsed * 1000) / 3_600_000) % 24 + 24) % 24
    const spots = collectSpots(pack, world.cfg, world.nav, world.spawn, sunDirection(hour), world.objects)
    const ctx: StepContext = { grid: world.nav.grid, visitor: null, timeOfDay: hour, spots }
    const seconds = step.minutes * 60
    body.holding = holding !== undefined
    setFocus(
      body,
      {
        action: step.verb,
        ...(step.targetId !== undefined ? { targetId: step.targetId } : {}),
        ...(step.position !== undefined ? { position: { x: step.position[0], z: step.position[1] } } : {}),
        until: body.time + seconds,
      },
      ctx,
    )
    for (let k = 0, total = Math.round(seconds / STEP); k < total; k++) stepForkling(body, STEP, ctx)
    elapsed += seconds

    const result = applyStep({ holding, stored, position: { ...body.pos }, objects }, step, verb, {
      nowMs: opts.startMs + elapsed * 1000,
      skill: skillLevel(skills, verb.group),
      seed: (opts.seed + i * 104729) >>> 0,
    })
    if (!result.ok) {
      steps.push({ n, verb: step.verb, ok: false, reason: result.reason, position: { ...body.pos }, events: [] })
      break
    }
    holding = result.world.holding
    stored = result.world.stored
    objects = [...result.world.objects]
    skills = addXp(skills, result.group, result.xp)
    steps.push({ n, verb: step.verb, ok: true, position: { ...body.pos }, events: result.events })
  }
  return { steps, objects, holding, stored, skills }
}
