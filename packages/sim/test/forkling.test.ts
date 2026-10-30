import { describe, expect, it } from 'vitest'
import { Intention, SpeciesPack, type MicroBehavior } from '@forkling/schema'
import blobJson from './fixtures/blob.species.json'
import { resolveSlot } from '../src/animation.ts'
import { createForkling, stepForkling, STEP, type StepContext } from '../src/forkling.ts'
import { isWalkable, nearestWalkable, type Point2 } from '../src/nav.ts'
import { sunDirection } from '../src/sky.ts'
import { collectSpots } from '../src/world.ts'
import { cfg, spawn, world } from './helpers/world.ts'

const blob = SpeciesPack.parse(blobJson)
const noBehaviors: MicroBehavior[] = []

interface Run {
  /** Rounded positions and intention starts, for comparing runs. */
  trace: string[]
  intentionTypes: Set<string>
  micros: { id: string; hour: number }[]
  maxStuckSteps: number
  offGrid: number
  needsOutOfRange: number
  /** Steps where a need rose without the current action being performed and satisfying it. */
  illegalRises: string[]
  badIntentions: number
  noticeStep: { time: number; startedAt: number } | null
  slots: Set<string>
}

interface RunOptions {
  seed: number
  startHour: number
  seconds: number
  behaviors?: MicroBehavior[]
  /** A visitor that stalks the forkling from `arrive` seconds, stops near it, and leaves at `leave`. */
  visitor?: { arrive: number; leave: number }
  pack?: SpeciesPack
}

function simulate(opts: RunOptions): Run {
  const pack = opts.pack ?? blob
  const start = nearestWalkable(world.grid, { x: 0, z: 0 })!
  const state = createForkling(pack, opts.behaviors ?? noBehaviors, opts.seed, start)
  const run: Run = {
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
  }
  const radius = pack.perception.noticeRadius
  let visitor: Point2 | null = null
  let stuck = 0
  let lastSun = -1
  let spots: Record<string, Point2[]> = {}
  let lastIntentionStart = -1
  const steps = Math.round(opts.seconds / STEP)

  for (let i = 0; i < steps; i++) {
    const t = i * STEP
    const hour = (opts.startHour + t / 3600) % 24
    // Sunbeams are refreshed once a simulated minute, like the viewer does.
    if (Math.floor(t / 60) !== lastSun) {
      lastSun = Math.floor(t / 60)
      spots = collectSpots(pack, cfg, world, spawn, sunDirection(hour))
    }

    if (opts.visitor && t >= opts.visitor.arrive && t < opts.visitor.leave) {
      if (!visitor) visitor = { x: state.pos.x + 14, z: state.pos.z }
      const d = Math.hypot(state.pos.x - visitor.x, state.pos.z - visitor.z)
      if (d > 2.5 && !run.noticeStep) {
        // Walk towards the forkling at 1.5 m/s until close, then stand still.
        visitor = { x: visitor.x + ((state.pos.x - visitor.x) / d) * 1.5 * STEP, z: visitor.z + ((state.pos.z - visitor.z) / d) * 1.5 * STEP }
      }
    } else if (opts.visitor && t >= opts.visitor.leave && visitor) {
      visitor = { x: visitor.x + 1.5 * STEP, z: visitor.z }
      if (Math.hypot(visitor.x - state.pos.x, visitor.z - state.pos.z) > 40) visitor = null
    }

    const before = { ...state.needs }
    const posBefore = { ...state.pos }
    const ctx: StepContext = { grid: world.grid, visitor, timeOfDay: hour, spots }
    const wasNoticed = visitor !== null && Math.hypot(posBefore.x - visitor.x, posBefore.z - visitor.z) <= radius
    stepForkling(state, STEP, ctx)

    if (wasNoticed && !run.noticeStep) {
      run.noticeStep = { time: state.time, startedAt: state.intention.startedAt }
    }

    // Invariants.
    for (const [id, value] of Object.entries(state.needs)) {
      if (value < 0 || value > 100 || Number.isNaN(value)) run.needsOutOfRange++
      const prev = before[id as keyof typeof before] ?? 0
      if (value > prev + 1e-9) {
        const gains = (state.action.satisfies as Record<string, number | undefined>)[id] ?? 0
        if (state.phase !== 'acting' || gains <= 0) run.illegalRises.push(`${id}@${state.time.toFixed(1)} ${state.action.id}/${state.phase}`)
      }
    }
    if (!isWalkable(world.grid, state.pos.x, state.pos.z)) run.offGrid++
    if (state.phase === 'moving') {
      stuck = Math.hypot(state.pos.x - posBefore.x, state.pos.z - posBefore.z) < 1e-6 ? stuck + 1 : 0
      run.maxStuckSteps = Math.max(run.maxStuckSteps, stuck)
    } else {
      stuck = 0
    }
    if (state.intention.startedAt !== lastIntentionStart) {
      lastIntentionStart = state.intention.startedAt
      run.intentionTypes.add(state.intention.type)
      if (!Intention.safeParse(state.intention).success) run.badIntentions++
      run.trace.push(`${state.intention.type}@${state.intention.startedAt.toFixed(1)}`)
    }
    if (state.micro && !run.micros.some((m) => m.id === state.micro!.behavior.id && Math.abs(m.hour - hour) < 1e-9)) {
      run.micros.push({ id: state.micro.behavior.id, hour })
    }
    run.slots.add(state.slot)
    if (i % 10 === 0) run.trace.push(`${state.pos.x.toFixed(2)},${state.pos.z.toFixed(2)}`)
  }
  return run
}

describe('stepForkling with the blob pack (no animations, no behaviors)', () => {
  const run = simulate({ seed: 1, startHour: 10, seconds: 600, visitor: { arrive: 120, leave: 300 } })

  it('keeps every need within 0 and 100', () => {
    expect(run.needsOutOfRange).toBe(0)
  })

  it('never goes 3 seconds without progress while moving', () => {
    expect(run.maxStuckSteps).toBeLessThan(30)
  })

  it('stays on walkable ground the whole time', () => {
    expect(run.offGrid).toBe(0)
  })

  it('does a variety of things in 10 minutes', () => {
    expect(run.intentionTypes.size).toBeGreaterThanOrEqual(4)
  })

  it('only ever raises a need by performing an action that satisfies it', () => {
    expect(run.illegalRises).toEqual([])
  })

  it('produces valid intentions with a reason in the pack voice', () => {
    expect(run.badIntentions).toBe(0)
  })

  it('re-decides the moment it notices the visitor', () => {
    expect(run.noticeStep).not.toBeNull()
    expect(run.noticeStep!.startedAt).toBeCloseTo(run.noticeStep!.time, 5)
  })

  it('is deterministic for a seed and differs between seeds', () => {
    const again = simulate({ seed: 1, startHour: 10, seconds: 600, visitor: { arrive: 120, leave: 300 } })
    expect(again.trace).toEqual(run.trace)
    const other = simulate({ seed: 2, startHour: 10, seconds: 600, visitor: { arrive: 120, leave: 300 } })
    expect(other.trace).not.toEqual(run.trace)
  })

  it('resolves every slot it asks for to nothing, as a pack without animations must', () => {
    for (const slot of run.slots) expect(resolveSlot(slot as never, new Set())).toBeNull()
  })

  it('reaches its spot targets: it eats at the food spot', () => {
    expect(run.intentionTypes.has('eat')).toBe(true)
  })
})

describe('micro-behaviors', () => {
  const behaviors: MicroBehavior[] = [
    { id: 'wiggle', when: 'idle', chance: 0.6, durationSec: 1.5 },
    { id: 'tuck', when: 'beforeSleep', chance: 1, durationSec: 1.2 },
    { id: 'yawn', when: 'afterWake', chance: 1, durationSec: 1 },
    { id: 'zoom', when: 'dusk', chance: 1, durationSec: 1 },
  ]

  it('plays idle, before-sleep and after-wake behaviors', () => {
    const run = simulate({ seed: 3, startHour: 10, seconds: 600, behaviors })
    const ids = new Set(run.micros.map((m) => m.id))
    expect(ids.has('wiggle')).toBe(true)
    expect(ids.has('tuck')).toBe(true)
    expect(ids.has('yawn')).toBe(true)
  })

  it('plays dusk behaviors only at dusk', () => {
    const day = simulate({ seed: 3, startHour: 10, seconds: 300, behaviors })
    expect(day.micros.some((m) => m.id === 'zoom')).toBe(false)
    const dusk = simulate({ seed: 3, startHour: 18.5, seconds: 300, behaviors })
    expect(dusk.micros.some((m) => m.id === 'zoom')).toBe(true)
  })

  it('keeps the invariants with behaviors running', () => {
    const run = simulate({ seed: 4, startHour: 18.8, seconds: 600, behaviors, visitor: { arrive: 60, leave: 200 } })
    expect(run.needsOutOfRange).toBe(0)
    expect(run.offGrid).toBe(0)
    expect(run.illegalRises).toEqual([])
    expect(run.maxStuckSteps).toBeLessThan(30)
  })
})

describe('a visitor never raises needs by themselves', () => {
  it('leaves needs alone while a visitor stands right next to a forkling that ignores them', () => {
    const pack = SpeciesPack.parse({
      ...blobJson,
      // Only the ignore action is available near a visitor, and it satisfies nothing.
      actions: blob.actions.filter((a) => a.id !== 'greet'),
      weights: {},
    })
    const run = simulate({ seed: 5, startHour: 10, seconds: 300, pack, visitor: { arrive: 20, leave: 280 } })
    expect(run.noticeStep).not.toBeNull()
    expect(run.illegalRises).toEqual([])
  })
})
