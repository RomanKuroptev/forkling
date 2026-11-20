import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { kit } from '@forkling/schema/kit'
import { Place } from '@forkling/schema'
import { placeCentre, toLandPlace } from '@forkling/sim'
import { stairColliders } from '../src/world/stairs.ts'
import { interiorInstances, wallBoxes } from '../src/world/kitGeometry.ts'
import { FLOOR_TOP } from '../src/world/kitBase.ts'

/** A two-floor house, 12 by 10, with stairs along the left wall climbing toward the front, as day-30 builds them. */
const house = (over: { rot?: number; roomHeight?: number; stairs?: boolean } = {}): Place =>
  Place.parse({
    id: 'tall-house',
    name: 'Tall House',
    purpose: 'Two floors.',
    tags: ['places'],
    founded: '2026-11-20',
    chunk: [1, 0],
    offset: [0, 0],
    related: [],
    paths: [],
    exterior: { style: 'stone', footprint: [12, 10], floors: 2, palette: 'paper', sign: 'TALL HOUSE' },
    rooms: [
      { id: 'ground', name: 'Ground', size: [11, 9, over.roomHeight ?? 3], at: [0, 0], floor: 0, parts: over.stairs === false ? [] : [{ part: 'stairs', at: [-4.55, 0, -0.8], rot: over.rot ?? 0 }] },
      { id: 'upper', name: 'Upper', size: [11, 9, over.roomHeight ?? 3], at: [0, 0], floor: 1, parts: [] },
    ],
    exhibits: [],
    state: { construction: null, lastCareAt: '2026-11-21T19:40:00+01:00', neglect: 0, lamps: true, closed: null },
    away: [],
    history: [],
  })

const BASE = 2
/** The two ends of the middle line of a ramp's top face, in the world. */
function rampLine(r: ReturnType<typeof stairColliders>['ramps'][number]): [THREE.Vector3, THREE.Vector3] {
  const q = new THREE.Quaternion(...r.quaternion)
  const at = new THREE.Vector3(...r.position)
  const end = (s: number) => new THREE.Vector3(0, r.half[1], s * r.half[2]).applyQuaternion(q).add(at)
  return [end(-1), end(1)]
}

describe('stairs a visitor can climb (issue 333)', () => {
  const [px, pz] = placeCentre(toLandPlace(house()))

  it('a flight is a ramp from its foot on the floor to its top at the floor above, as wide as the stairs', () => {
    const { ramps } = stairColliders(house(), kit, BASE)
    expect(ramps).toHaveLength(1)
    const [low, high] = rampLine(ramps[0]!)
    // It reaches a little past the foot, under the floor, so there is no lip to trip on.
    expect(high.x).toBeCloseTo(px - 4.55, 5)
    expect(high.z).toBeCloseTo(pz - 0.8 + 1.5, 5)
    expect(high.y).toBeCloseTo(BASE + 3 + FLOOR_TOP, 5)
    expect(low.x).toBeCloseTo(px - 4.55, 5)
    expect(low.z).toBeLessThan(pz - 0.8 - 1.5 + 1e-6)
    expect(low.y).toBeLessThanOrEqual(BASE + 1e-6)
    expect(ramps[0]!.half[0]).toBeCloseTo(0.6, 5)
  })

  it('a flight turned a quarter climbs toward +x, and one in a taller storey climbs the whole storey', () => {
    const [, high] = rampLine(stairColliders(house({ rot: Math.PI / 2 }), kit, BASE).ramps[0]!)
    expect(high.x).toBeCloseTo(px - 4.55 + 1.5, 5)
    expect(high.z).toBeCloseTo(pz - 0.8, 5)
    const [, tall] = rampLine(stairColliders(house({ roomHeight: 3.6 }), kit, BASE).ramps[0]!)
    expect(tall.y).toBeCloseTo(BASE + 3.6 + FLOOR_TOP, 5)
  })

  it('the floor above is solid to stand on everywhere but the stairwell', () => {
    const { slabs } = stairColliders(house(), kit, BASE)
    expect(slabs.length).toBeGreaterThan(1)
    for (const s of slabs) expect(s.position[1] + s.half[1]).toBeCloseTo(BASE + 3 + FLOOR_TOP, 5)
    const covers = (x: number, z: number) => slabs.some((s) => Math.abs(x - s.position[0]) < s.half[0] && Math.abs(z - s.position[2]) < s.half[2])
    expect(covers(px, pz)).toBe(true)
    expect(covers(px + 4, pz - 3)).toBe(true)
    // Over the stairs there is no floor.
    expect(covers(px - 4.55, pz - 0.8)).toBe(false)
    expect(covers(px - 4.55, pz + 0.6)).toBe(false)
    // A house with no stairs has its whole upper floor, and no ramp.
    const none = stairColliders(house({ stairs: false }), kit, BASE)
    expect(none.ramps).toEqual([])
    expect(none.slabs).toHaveLength(1)
    // A one-floor house has neither.
    const low = Place.parse({ ...house(), exterior: { ...house().exterior, floors: 1 }, rooms: [house().rooms[0]] })
    expect(stairColliders(low, kit, BASE)).toEqual({ ramps: [], slabs: [] })
  })

  it('the upper floor is drawn with the stairwell open, and the stairs reach it', () => {
    const inst = interiorInstances(house(), kit, BASE)
    const at = (i: (typeof inst)[number]) => [i.matrix[12]!, i.matrix[13]!, i.matrix[14]!]
    const size = (i: (typeof inst)[number]) => [Math.hypot(i.matrix[0]!, i.matrix[1]!, i.matrix[2]!), Math.hypot(i.matrix[4]!, i.matrix[5]!, i.matrix[6]!), Math.hypot(i.matrix[8]!, i.matrix[9]!, i.matrix[10]!)]
    const upperFloor = inst.filter((i) => i.shape === 'box' && Math.abs(at(i)[1]! - (BASE + 3 + (FLOOR_TOP - 0.03) / 2)) < 1e-6 && size(i)[1]! < 0.2)
    expect(upperFloor.length).toBeGreaterThan(1)
    const over = (x: number, z: number) => upperFloor.some((i) => Math.abs(x - at(i)[0]!) < size(i)[0]! / 2 && Math.abs(z - at(i)[2]!) < size(i)[2]! / 2)
    expect(over(px, pz)).toBe(true)
    expect(over(px - 4.55, pz - 0.8)).toBe(false)
    // In a taller storey the stairs are drawn as tall as it, so the top step meets the floor above.
    const tall = interiorInstances(house({ roomHeight: 3.6 }), kit, BASE).filter((i) => i.group === 'ground/0')
    const top = Math.max(...tall.map((i) => at(i)[1]! + size(i)[1]! / 2))
    expect(top).toBeCloseTo(BASE + 3.6, 5)
  })

  it('the door gap is on the ground floor only: the upper front wall stops the visitor', () => {
    const walls = wallBoxes(house())
    const overDoor = walls.filter((w) => w.x0 <= px - 1 && w.x1 >= px + 1 && w.z1 > pz + 4.5)
    expect(overDoor).toHaveLength(1)
    expect(overDoor[0]!.y0).toBeCloseTo(3, 5)
    expect(overDoor[0]!.height).toBeCloseTo(6, 5)
  })
})
