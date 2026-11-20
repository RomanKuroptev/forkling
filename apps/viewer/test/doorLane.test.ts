import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Place } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { DOOR_HALF, placeCentre, starterPlaces, toLandPlace } from '@forkling/sim'
import { INNER_FACE } from '../src/world/building.ts'
import { doorLane, settledPlace } from '../src/world/insideWalls.ts'
import { furnitureBoxes } from '../src/world/solidFurniture.ts'

const day7 = (id: string): Place => Place.parse(JSON.parse(readFileSync(fileURLToPath(new URL(`../../../test/fixtures/worlds/day-7/places/${id}.json`, import.meta.url)), 'utf8')))
const home = () => starterPlaces().find((p) => p.id === 'home')!
const index = (p: Place, name: string) => p.rooms[0]!.parts.findIndex((q) => q.part === name)

/** The lane in world meters, for a place standing at ground height 0. */
const worldLane = (p: Place) => {
  const [px, pz] = placeCentre(toLandPlace(p))
  const l = doorLane(p)
  return { x0: px + l.x0, x1: px + l.x1, z0: pz + l.z0, z1: pz + l.z1 }
}
const inLane = (b: { min: number[]; max: number[] }, l: ReturnType<typeof worldLane>) => Math.min(b.max[0]!, l.x1) - Math.max(b.min[0]!, l.x0) > 1e-6 && Math.min(b.max[2]!, l.z1) - Math.max(b.min[2]!, l.z0) > 1e-6

describe('a clear walk in from the door to the middle of the room (issue 451)', () => {
  it("runs from Home's door, as wide as the door, to the middle of its main room", () => {
    const p = home()
    const [, fd] = p.exterior.footprint
    expect(doorLane(p)).toEqual({ x0: -DOOR_HALF, x1: DOOR_HALF, z0: 0, z1: fd / 2 - INNER_FACE })
  })

  it("draws Home's bench slid sideways out of the way in, at the same depth, inside the walls; the rug stays where Merge laid it", () => {
    for (const p of [home(), day7('home')]) {
      const s = settledPlace(p, kit)
      const bench = index(p, 'bench')
      const was = p.rooms[0]!.parts[bench]!.at
      const now = s.rooms[0]!.parts[bench]!.at
      expect(now[2]).toBe(was[2])
      expect(Math.abs(now[0]) - 0.8).toBeGreaterThanOrEqual(DOOR_HALF)
      expect(Math.abs(now[0]) + 0.8).toBeLessThanOrEqual(p.exterior.footprint[0] / 2 - INNER_FACE)
      const rug = index(p, 'rug-round')
      expect(s.rooms[0]!.parts[rug]).toEqual(p.rooms[0]!.parts[rug])
      // The file is never changed.
      expect(p.rooms[0]!.parts[bench]!.at).toEqual(was)
    }
  })

  it('leaves no solid furniture in the lane in the starter places or day-7, so the visitor bumps into nothing walking straight in', () => {
    for (const p of [...starterPlaces(), day7('home'), day7('workshop'), day7('hillside-room-five-lamps')]) {
      const lane = worldLane(p)
      for (const b of furnitureBoxes(p, kit, 0)) expect(inLane(b, lane), `${p.id} ${b.part} ${JSON.stringify(b)}`).toBe(false)
    }
  })

  it('moves what stands on a table in the lane with the table, and leaves a part that fits nowhere where it is', () => {
    const p = home()
    const table = { ...p, rooms: [{ ...p.rooms[0]!, parts: [...p.rooms[0]!.parts.filter((q) => q.part !== 'bench'), { part: 'table', at: [0.3, 0, 2] as [number, number, number], rot: 0 }, { part: 'lamp-desk', at: [0.3, 0.75, 2] as [number, number, number], rot: 0 }] }] }
    const tSize = kit.parts.find((q) => q.id === 'table')!.size
    table.rooms[0]!.parts[table.rooms[0]!.parts.length - 1]!.at[1] = tSize[1]
    const s = settledPlace(table, kit)
    const n = s.rooms[0]!.parts.length
    const t = s.rooms[0]!.parts[n - 2]!.at
    const lamp = s.rooms[0]!.parts[n - 1]!.at
    expect(t[0]).toBeGreaterThan(0.3)
    expect(lamp[0] - t[0]).toBeCloseTo(0, 9)
    expect(lamp[2] - t[2]).toBeCloseTo(0, 9)
    // A bush Merge set against a desk, a hand's width into the lane (day-30's Grown Place 6): it slides out beside the desk it already
    // stood against, rather than staying in the way.
    const against = { ...p, rooms: [{ ...p.rooms[0]!, parts: [{ part: 'desk', at: [-2.5, 0, 2.25] as [number, number, number], rot: Math.PI / 2 }, { part: 'bush', at: [-1.75, 0, 1.95] as [number, number, number], rot: 0 }] }] }
    const bush = settledPlace(against, kit).rooms[0]!.parts[1]!.at
    expect(bush[0] + 0.6).toBeLessThanOrEqual(-DOOR_HALF)
    expect(bush[2]).toBe(1.95)
    // A room as narrow as the door with a bench square across it: no side to slide to and no room behind, so it stays.
    const narrow = { ...p, exterior: { ...p.exterior, footprint: [4, 2] as [number, number] }, rooms: [{ ...p.rooms[0]!, size: [3, 1.5, 3.2] as [number, number, number], parts: [{ part: 'bench', at: [0, 0, 0.05] as [number, number, number], rot: 0 }] }] }
    expect(settledPlace(narrow, kit).rooms[0]!.parts[0]!.at).toEqual([0, 0, 0.05])
  })
})
