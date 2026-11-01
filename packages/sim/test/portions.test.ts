import { describe, expect, it } from 'vitest'
import { Goals, PlanStep, SpeciesPack, WorldObject, Forkling } from '@forkling/schema'
import blobJson from './fixtures/blob.species.json'
import { portionsLeft } from '../src/objects.ts'
import { startPlayback, tallyWindow, type PlaybackInput } from '../src/playback.ts'
import { sunDirection } from '../src/sky.ts'
import { starterWorld, worldWithObjects } from '../src/starter.ts'
import { validatePlan, type PlanContext } from '../src/validate.ts'
import { collectSpots } from '../src/world.ts'

/** The blob, plus a verb that eats from an object that is food, and one that only looks at it. */
const pack = SpeciesPack.parse({
  ...blobJson,
  actions: [
    ...blobJson.actions,
    { id: 'munch', group: 'body', satisfies: { hunger: 50 }, durationSec: [3, 5], target: { type: 'object', where: { edible: true } }, slot: 'idle', reason: 'Munch.' },
    { id: 'peer', group: 'body', satisfies: {}, durationSec: [3, 5], target: { type: 'object' }, slot: 'idle', reason: 'Look.' },
  ],
})

const start = starterWorld().spawn
const bowl = (state: Record<string, unknown> = {}) =>
  WorldObject.parse({
    id: 'bowl',
    kind: 'bowl',
    name: 'The bowl',
    position: [start.x + 3, 0, start.z - 3],
    model: { parts: [{ shape: 'cylinder', size: [0.3, 0.1, 0.3], at: [0, 0.05, 0], color: '#c2703d' }] },
    properties: { edible: true, size: 0.3, portions: 3 },
    state,
    reason: 'Dinner.',
  })

describe('portionsLeft', () => {
  it('is the whole count for a bowl nobody has eaten from, and what is recorded after that', () => {
    expect(portionsLeft(bowl())).toBe(3)
    expect(portionsLeft(bowl({ portionsLeft: 1 }))).toBe(1)
    expect(portionsLeft(bowl({ portionsLeft: 0 }))).toBe(0)
  })

  it('is null for something that has no portions, which never runs out', () => {
    expect(portionsLeft(WorldObject.parse({ ...bowl(), properties: { edible: true, size: 0.3 } }))).toBeNull()
  })
})

describe('an empty bowl in the world', () => {
  const spotsFor = (o: WorldObject) => {
    const w = worldWithObjects([o])
    return collectSpots(pack, w.cfg, w.nav, w.spawn, sunDirection(12), w.objects)
  }

  it('is somewhere to eat while it has portions', () => {
    expect(spotsFor(bowl({ portionsLeft: 2 }))['for:munch']).toHaveLength(1)
  })

  it('offers nothing to eat once the portions are gone, but is still there to look at', () => {
    const spots = spotsFor(bowl({ portionsLeft: 0 }))
    expect(spots['for:munch']).toBeUndefined()
    expect(spots['for:peer']).toHaveLength(1)
    expect(spots.bowl).toHaveLength(1)
  })
})

describe('a plan that eats from an empty bowl', () => {
  const ctx = (o: WorldObject): PlanContext => ({
    pack,
    spotKinds: new Set(),
    objects: [o],
    startMs: Date.parse('2026-11-03T12:00:00Z'),
    asleepAt: () => false,
    hourAt: () => 12,
    recent: [],
  })
  const reasons = (steps: PlanStep[], o: WorldObject) => {
    const r = validatePlan(steps, ctx(o))
    return r.ok ? [] : r.reasons
  }
  const munch = PlanStep.parse({ verb: 'munch', targetId: 'bowl', reason: 'I am hungry.', minutes: 5 })
  const peer = PlanStep.parse({ verb: 'peer', targetId: 'bowl', reason: 'It is pretty.', minutes: 5 })

  it('is turned down, and says the bowl is empty', () => {
    expect(reasons([munch], bowl({ portionsLeft: 0 })).join(' ')).toMatch(/The bowl is empty/)
  })

  it('is fine while the bowl has food, and for a verb that does not eat', () => {
    expect(reasons([munch], bowl({ portionsLeft: 1 }))).toEqual([])
    expect(reasons([peer], bowl({ portionsLeft: 0 }))).toEqual([])
  })
})

describe('tallyWindow counts how often each verb started', () => {
  const EPOCH_START = Date.UTC(2026, 9, 30, 12, 0, 0) / 1000
  const input = (): PlaybackInput => ({
    forkling: Forkling.parse({
      name: 'Blobby',
      species: 'blob',
      needs: { hunger: 5, energy: 70, fun: 50 },
      position: [0, 0, 0],
      mood: 'content',
      intention: { type: 'roam', startedAt: new Date((EPOCH_START + 60) * 1000).toISOString(), seed: 9, reason: 'A stroll.' },
      lastTickAt: new Date((EPOCH_START + 60) * 1000).toISOString(),
      timezone: 'Europe/Stockholm',
    }),
    pack,
    behaviors: [],
    world: worldWithObjects([bowl()]),
    goals: Goals.parse({}),
    stateTime: EPOCH_START + 60,
  })
  const from = (EPOCH_START + 60) * 1000

  it('says how many times it ate from the bowl in a window, so the mind can count the portions', () => {
    const t = tallyWindow(input(), from, from + 900_000)
    expect(t.started.munch).toBeGreaterThanOrEqual(1)
    expect(Object.values(t.started).reduce((a, b) => a + b, 0)).toBeGreaterThan(t.started.munch!)
  })

  it('adds up across the edge of an epoch like everything else', () => {
    const edge = (EPOCH_START + 1800) * 1000
    const a = tallyWindow(input(), edge - 600_000, edge)
    const b = tallyWindow(input(), edge, edge + 600_000)
    const whole = tallyWindow(input(), edge - 600_000, edge + 600_000)
    for (const verb of Object.keys(whole.started)) expect(whole.started[verb]).toBe((a.started[verb] ?? 0) + (b.started[verb] ?? 0))
  })

  it('has nothing in an empty window', () => {
    expect(tallyWindow(input(), from, from).started).toEqual({})
  })

  it('does not change what the replay does', () => {
    const pb = startPlayback(input(), from + 600_000)
    expect(pb.state.pos).toBeDefined()
  })
})
