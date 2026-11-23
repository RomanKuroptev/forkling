import { describe, expect, it } from 'vitest'
import { SpeciesPack, type MicroBehavior } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import blobJson from './fixtures/blob.species.json'
import { resolveSlot } from '../src/animation.ts'
import { createForkling, stepForkling, STEP, toRepoIntention, type StepContext } from '../src/forkling.ts'
import { buildBodyWorld } from '../src/body-world.ts'
import { findPath } from '../src/nav.ts'
import { starterPlaces } from '../src/starter-places.ts'
import { runHeadless, type HeadlessOptions } from '../src/headless.ts'

const blob = SpeciesPack.parse(blobJson)
const world = buildBodyWorld(1, starterPlaces())

const simulate = (opts: Omit<HeadlessOptions, 'pack'> & { pack?: SpeciesPack }) => runHeadless({ pack: blob, ...opts })

describe('stepForkling with the blob pack (no animations, no behaviors)', () => {
  const run = simulate({ seed: 1, startHour: 10, seconds: 600, visitor: { arrive: 120, leave: 300 } })

  it('never goes 3 seconds without progress while moving', () => {
    expect(run.maxStuckSteps).toBeLessThan(30)
  })

  it('stays on walkable ground the whole time', () => {
    expect(run.offGrid).toBe(0)
  })

  it('does a variety of things in 10 minutes', () => {
    expect(run.intentionTypes.size).toBeGreaterThanOrEqual(4)
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
    expect(run.offGrid).toBe(0)
    expect(run.maxStuckSteps).toBeLessThan(30)
  })
})

describe('a visitor standing in the way', () => {
  // Merge walking out of Home's door with a visitor standing in it (the night fixture): it walked straight on through the visitor,
  // whose keep-away only stops the visitor's own steps, and the camera ended up inside Merge.
  const walkOutThrough = (seed: number, visitor: { x: number; z: number }) => {
    const state = createForkling(blob, [], seed, { x: 8, z: 15 })
    const ctx: StepContext = { grid: world.grid, visitor, timeOfDay: 12, spots: {} }
    state.noticed = true
    state.action = blob.actions.find((a) => a.id === 'roam')!
    state.phase = 'moving'
    state.path = findPath(world.grid, state.pos, { x: 8, z: 28 })!
    state.goal = { x: 8, z: 28 }
    let nearest = Infinity
    for (let i = 0; i < 200; i++) {
      stepForkling(state, STEP, ctx)
      nearest = Math.min(nearest, Math.hypot(state.pos.x - visitor.x, state.pos.z - visitor.z))
    }
    return { state, nearest }
  }

  it('never walks nearer a visitor than it goes to greet one, on any seed or line', () => {
    for (let seed = 1; seed <= 12; seed++)
      for (const visitor of [{ x: 8, z: 19 }, { x: 8.4, z: 18.2 }, { x: 7.7, z: 21 }]) {
        expect(walkOutThrough(seed, visitor).nearest).toBeGreaterThanOrEqual(1.3 - 1e-9)
      }
  })

  it('steps out of the way of a visitor instead of standing in it', () => {
    // Standing still 1.3 m in front of them, it held a visitor walking in through Home's door (day-0): the visitor keeps 1.6 m
    // from its face, so in the doorway neither could pass.
    for (let seed = 1; seed <= 12; seed++) {
      const state = createForkling(blob, [], seed, { x: 8, z: 15 })
      const visitor = { x: 8, z: 19 }
      const ctx: StepContext = { grid: world.grid, visitor, timeOfDay: 12, spots: {} }
      state.noticed = true
      state.action = blob.actions.find((a) => a.id === 'roam')!
      state.phase = 'moving'
      state.path = findPath(world.grid, state.pos, { x: 8, z: 28 })!
      const pausing = () => state.intention.type === 'pause' && (state.phase as string) === 'acting'
      for (let i = 0; i < 100 && !pausing(); i++) stepForkling(state, STEP, ctx)
      expect(pausing()).toBe(true)
      expect(Math.abs(state.pos.x - visitor.x)).toBeGreaterThanOrEqual(1.5)
    }
  })
})

describe('acting after a micro-behavior', () => {
  it('does not resume an action from the repo that is not allowed at this time of day', () => {
    // The repo says it was resting, but resting is for the day and it is bed time now.
    const dayRest = SpeciesPack.parse({ ...blobJson, actions: blob.actions.map((a) => (a.id === 'rest' ? { ...a, requires: ['day'] } : a)) })
    const state = createForkling(dayRest, [], 1, { x: 2, z: 20 }, { firstAction: 'rest' })
    const ctx: StepContext = { grid: world.grid, visitor: null, timeOfDay: 12, asleep: true, spots: {} }
    for (let i = 0; i < 5; i++) stepForkling(state, STEP, ctx)
    expect(state.intention.type).not.toBe('rest')
  })

  it('still resumes an action that is allowed', () => {
    const state = createForkling(blob, [], 1, { x: 2, z: 20 }, { firstAction: 'rest' })
    const ctx: StepContext = { grid: world.grid, visitor: null, timeOfDay: 12, spots: {} }
    for (let i = 0; i < 5; i++) stepForkling(state, STEP, ctx)
    expect(state.intention.type).toBe('rest')
  })

  it('keeps the full action duration when a before-sleep behavior runs first', () => {
    const tuck: MicroBehavior = { id: 'tuck', when: 'beforeSleep', chance: 1, durationSec: 1.2 }
    const start = { x: 2, z: 20 }
    const state = createForkling(blob, [tuck], 1, start, { firstAction: 'rest' })
    const ctx: StepContext = { grid: world.grid, visitor: null, timeOfDay: 12, spots: {} }
    let sawTuck = false
    let restingSteps = 0
    for (let i = 0; i < 400; i++) {
      stepForkling(state, STEP, ctx)
      if (state.micro?.behavior.id === 'tuck') sawTuck = true
      else if (sawTuck && state.action.id === 'rest' && state.phase === 'acting') restingSteps++
      else if (sawTuck && restingSteps > 0) break
    }
    expect(sawTuck).toBe(true)
    // blob's rest lasts 10 to 20 seconds; the tuck must not cut it short.
    expect(restingSteps * STEP).toBeGreaterThanOrEqual(10)
  })
})

describe('sitting at the desk (issue 461)', () => {
  const seated = buildBodyWorld(1, starterPlaces(), kit)
  const deskPack = SpeciesPack.parse({
    ...blobJson,
    actions: [...blobJson.actions, { id: 'work', durationSec: [60, 60], target: { type: 'spot', kind: 'desk' }, slot: 'idle', reason: 'Blob went to its desk.' }],
  })

  it('walks to the chair at the desk and turns to face the desk when it gets there', () => {
    const spots = seated.spots([0, 1, 0])
    const spot = spots.desk![0]!
    const state = createForkling(deskPack, [], 1, { x: 8, z: 19 }, { firstAction: 'work' })
    const ctx: StepContext = { grid: seated.grid, visitor: null, timeOfDay: 12, spots }
    for (let i = 0; i < 300 && !(state.intention.type === 'work' && state.phase === 'acting'); i++) stepForkling(state, STEP, ctx)
    expect(state.phase).toBe('acting')
    expect(state.pos).toEqual({ x: spot.x, z: spot.z })
    expect(state.heading).toBeCloseTo(spot.face!, 9)
  })
})
