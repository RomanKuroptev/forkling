import { describe, expect, it } from 'vitest'
import { SpeciesPack, WorldObject } from '@forkling/schema'
import blobJson from './fixtures/blob.species.json'
import { runHeadless, type HeadlessOptions } from '../src/headless.ts'
import { isWalkable, nearestWalkable } from '../src/nav.ts'
import { starterWorld, worldWithObjects } from '../src/starter.ts'
import { collectSpots } from '../src/world.ts'
import { sunDirection } from '../src/sky.ts'

/** The blob plus one action that goes to a perch, so objects with the `perch` affordance can be targeted. */
const pack = SpeciesPack.parse({
  ...blobJson,
  actions: [
    ...blobJson.actions,
    { id: 'perch', satisfies: { fun: 10 }, durationSec: [4, 6], target: { type: 'spot', kind: 'perch' }, slot: 'sit', reason: 'Up high.' },
  ],
})

const start = starterWorld().spawn
const rock = WorldObject.parse({
  id: 'lookout-rock',
  kind: 'rock',
  name: 'The lookout rock',
  position: [start.x + 9, 0, start.z + 3],
  model: { asset: 'nature/rock_largeA' },
  affordances: ['perch'],
  reason: 'Good view.',
})
const world = worldWithObjects([rock])

describe('objects as spots', () => {
  it('offers an object by its affordance and by its id, on walkable ground', () => {
    const spots = collectSpots(pack, world.cfg, world.nav, world.spawn, sunDirection(12), world.objects)
    expect(spots['lookout-rock']).toHaveLength(1)
    expect(spots.perch!.length).toBeGreaterThan(1)
    const p = spots['lookout-rock']![0]!
    expect(isWalkable(world.nav.grid, p.x, p.z)).toBe(true)
    expect(Math.hypot(p.x - rock.position[0], p.z - rock.position[2])).toBeLessThan(4)
  })

  it('keeps the world free of object spots when there are no objects', () => {
    const plain = starterWorld()
    const spots = collectSpots(pack, plain.cfg, plain.nav, plain.spawn, sunDirection(12), plain.objects)
    expect(Object.keys(spots)).not.toContain('lookout-rock')
  })
})

describe('focus', () => {
  const run = (opts: Partial<HeadlessOptions> & { seconds: number }) => runHeadless({ pack, world, startHour: 12, seed: 3, ...opts })
  const perches = (r: ReturnType<typeof runHeadless>) => r.targets.filter((t) => t.startsWith('perch:'))

  it('keeps returning to the focused action and target while the focus lasts', () => {
    const focused = run({ seconds: 900, focus: { action: 'perch', targetId: 'lookout-rock', until: 900 } })
    const free = run({ seconds: 900 })
    expect(perches(focused).length).toBeGreaterThanOrEqual(3)
    expect(perches(focused).every((t) => t === 'perch:lookout-rock')).toBe(true)
    expect(perches(focused).length).toBeGreaterThan(perches(free).length * 2)
  })

  it('does not outrank a starving need', () => {
    const r = run({ seconds: 120, needs: { hunger: 2 }, focus: { action: 'perch', targetId: 'lookout-rock', until: 120 } })
    expect(r.intentionTypes.has('eat')).toBe(true)
  })

  it('looks after a critical need it can fix with one action, then goes back to the plan', () => {
    const r = run({ seconds: 580, needs: { hunger: 2 }, focus: { action: 'perch', targetId: 'lookout-rock', until: 600 } })
    expect(r.intentionTypes.has('eat')).toBe(true)
    // Nothing else breaks the plan off: no roaming or dashing about on the way.
    expect([...r.intentionTypes].filter((t) => !['perch', 'eat', 'idle', 'pause'].includes(t))).toEqual([])
    expect(perches(r).length).toBeGreaterThanOrEqual(3)
    expect(r.targets.filter((t) => t.startsWith('eat:')).length).toBeLessThanOrEqual(2)
  })

  it('keeps to the plan when the critical need is one it cannot fix by itself', () => {
    const noFood = SpeciesPack.parse({ ...pack, actions: pack.actions.filter((a) => a.id !== 'eat') })
    const r = runHeadless({ pack: noFood, world, startHour: 12, seed: 3, seconds: 580, needs: { hunger: 2 }, focus: { action: 'perch', targetId: 'lookout-rock', until: 600 } })
    expect([...r.intentionTypes].filter((t) => !['perch', 'idle', 'pause'].includes(t))).toEqual([])
    expect(perches(r).length).toBeGreaterThanOrEqual(5)
  })

  it('lets go once it has expired', () => {
    const r = run({ seconds: 1800, focus: { action: 'perch', targetId: 'lookout-rock', until: 300 } })
    const later = r.targets.slice(r.targets.length >> 1)
    expect(later.filter((t) => t === 'perch:lookout-rock').length).toBeLessThanOrEqual(2)
  })

  it('goes to a position when the focus names one', () => {
    const target = nearestWalkable(world.nav.grid, { x: start.x - 12, z: start.z + 6 }, 8)!
    const r = run({ seconds: 300, focus: { action: 'roam', position: target, until: 300 } })
    expect(r.trace.some((t) => t.startsWith('roam@'))).toBe(true)
    const nearTarget = r.positions.some((p) => Math.hypot(p.x - target.x, p.z - target.z) < 3)
    expect(nearTarget).toBe(true)
  })
})
