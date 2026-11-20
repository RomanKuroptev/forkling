import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Place } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { FLOOR_TOP } from '../src/world/kitBase.ts'
import { interiorInstances } from '../src/world/kitGeometry.ts'

const lamps = Place.parse(JSON.parse(readFileSync(join(__dirname, '../../../test/fixtures/worlds/day-7/places/hillside-room-five-lamps.json'), 'utf8')))
const top = (m: readonly number[]) => m[13]! + Math.abs(m[5]!) / 2
const bottom = (m: readonly number[]) => m[13]! - Math.abs(m[5]!) / 2
const only = (part: string, rot = 0): Place => ({ ...lamps, rooms: [{ ...lamps.rooms[0]!, parts: [{ part, at: [0, 0, 0], rot }] }] })

describe('a rug lies on the floor, not under it or in its plane (issue 432)', () => {
  it("the Five Lamps Room's round rug shows over its floor, every face clear of the floor's top", () => {
    const inst = interiorInstances(lamps, kit, 0)
    const floorTop = top(inst[0]!.matrix)
    expect(floorTop).toBeCloseTo(FLOOR_TOP, 5)
    const rug = inst.filter((i) => i.group === 'lamp-room/13')
    expect(rug.length).toBeGreaterThan(0)
    for (const i of rug) {
      expect(top(i.matrix)).toBeGreaterThan(floorTop + 0.005)
      expect(Math.abs(bottom(i.matrix) - floorTop)).toBeGreaterThan(0.005)
    }
  })

  it('every rug of the kit, set on the floor at 0, lies just over the floor, turned or not', () => {
    for (const id of ['rug-round', 'rug-square']) {
      for (const rot of [0, Math.PI / 2]) {
        const rug = interiorInstances(only(id, rot), kit, 0).filter((i) => i.group !== undefined)
        expect(rug.length, id).toBeGreaterThan(0)
        for (const i of rug) {
          expect(top(i.matrix), id).toBeGreaterThan(FLOOR_TOP + 0.005)
          // Not floating either: its underside is under the floor's top.
          expect(bottom(i.matrix), id).toBeLessThan(FLOOR_TOP - 0.005)
        }
      }
    }
  })

  it('a part taller than the floor stands where it was put, and is not lit trim', () => {
    const bench = interiorInstances(only('bench'), kit, 0).filter((i) => i.group !== undefined)
    expect(Math.min(...bench.map((i) => bottom(i.matrix)))).toBeLessThan(0.05)
    expect(bench.some((i) => i.trim)).toBe(false)
  })

  it("keeps its colours at night: a rug is lit trim, so Home's orange rug does not turn brown in the dark (look.md rule 3)", () => {
    for (const id of ['rug-round', 'rug-square']) {
      const rug = interiorInstances(only(id), kit, 0).filter((i) => i.group !== undefined)
      expect(rug.every((i) => i.trim === true), id).toBe(true)
    }
  })
})
