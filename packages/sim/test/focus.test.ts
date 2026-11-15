import { describe, expect, it } from 'vitest'
import { SpeciesPack } from '@forkling/schema'
import blobJson from './fixtures/blob.species.json'
import { buildBodyWorld } from '../src/body-world.ts'
import { runHeadless, type HeadlessOptions } from '../src/headless.ts'
import { nearestWalkable } from '../src/nav.ts'
import { starterPlaces } from '../src/starter-places.ts'

/** The blob plus one action that goes to a named spot, so a place can be targeted by its id. */
const pack = SpeciesPack.parse({
  ...blobJson,
  actions: [
    ...blobJson.actions,
    { id: 'visit', satisfies: { fun: 10 }, durationSec: [4, 6], target: { type: 'spot', kind: 'workshop' }, slot: 'sit', reason: 'Over there.' },
  ],
  // Rarely chosen on its own, so a visit in the results is the focus at work.
  weights: { ...blobJson.weights, visit: 0.02 },
})

const world = buildBodyWorld(1, starterPlaces())
const start = world.spawn

describe('places as spots', () => {
  it('offers each place by its id, on walkable ground', () => {
    const spots = world.spots([0.3, 0.8, 0.3])
    expect(spots.home).toHaveLength(1)
    expect(spots.workshop).toHaveLength(1)
  })
})

describe('focus', () => {
  const run = (opts: Partial<HeadlessOptions> & { seconds: number }) => runHeadless({ pack, world, startHour: 12, seed: 3, ...opts })
  const visits = (r: ReturnType<typeof runHeadless>) => r.targets.filter((t) => t.startsWith('visit:'))

  it('keeps returning to the focused action and target while the focus lasts', () => {
    const focused = run({ seconds: 900, focus: { action: 'visit', targetId: 'workshop', until: 900 } })
    const free = run({ seconds: 900 })
    expect(visits(focused).length).toBeGreaterThanOrEqual(3)
    expect(visits(focused).every((t) => t === 'visit:workshop')).toBe(true)
    expect(visits(focused).length).toBeGreaterThan(visits(free).length * 2)
  })

  it('lets go once it has expired', () => {
    const r = run({ seconds: 1800, focus: { action: 'visit', targetId: 'workshop', until: 300 } })
    const free = run({ seconds: 1800 })
    const laterVisits = (x: ReturnType<typeof runHeadless>) => x.targets.slice(x.targets.length >> 1).filter((t) => t === 'visit:workshop').length
    // After the focus is gone the body chooses for itself again, no more often than it would have anyway.
    expect(laterVisits(r)).toBeLessThanOrEqual(laterVisits(free) + 2)
    expect(r.targets.filter((t) => t === 'visit:workshop').length).toBeGreaterThan(laterVisits(r))
  })

  it('goes to a position when the focus names one', () => {
    const target = nearestWalkable(world.grid, { x: start.x - 4, z: start.z + 3 }, 8)!
    const r = run({ seconds: 300, focus: { action: 'roam', position: target, until: 300 } })
    expect(r.trace.some((t) => t.startsWith('roam@'))).toBe(true)
    const nearTarget = r.positions.some((p) => Math.hypot(p.x - target.x, p.z - target.z) < 3)
    expect(nearTarget).toBe(true)
  })
})
