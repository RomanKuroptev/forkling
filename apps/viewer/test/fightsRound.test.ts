import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Place, type Kit } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { placeFights } from '../src/qa/fights.ts'
import { FLOOR_TOP } from '../src/world/kitBase.ts'

const lamps = Place.parse(JSON.parse(readFileSync(join(__dirname, '../../../test/fixtures/worlds/day-7/places/hillside-room-five-lamps.json'), 'utf8')))
const withPart = (part: string, y: number): Place => ({ ...lamps, rooms: [{ ...lamps.rooms[0]!, parts: [{ part, at: [0, y, 0], rot: 0 }] }] })

/**
 * A round part (a puck, taller than the floor so it is drawn where it is put) whose top disc lies in the floor's top plane: the
 * shards of issue 432, which the check could not see while it read only boxes.
 */
const puckKit: Kit = {
  ...kit,
  parts: [
    ...kit.parts,
    { id: 'puck', name: 'Puck', category: 'furniture', size: [1.5, 0.3, 1.5], primitives: [{ shape: 'cylinder', size: [1.5, 0.3, 1.5], at: [0, 0.15, 0], color: 'accent' }], slots: [] },
  ],
}

describe('surfaces that fight: round parts against the floor (issue 432)', () => {
  it("sees a cylinder's top in the floor's top plane", () => {
    const found = placeFights({ places: [withPart('puck', FLOOR_TOP - 0.3)], kit: puckKit, heightAt: () => 0, nowMs: 0 })
    expect(found.map((f) => [f.a, f.b].sort().join(' / '))).toContain('a floor / part lamp-room/0 (puck)')
    const fight = found.find((f) => /puck/.test(f.a + f.b))!
    expect(fight.normal[1]).toBeGreaterThan(0.99)
  })

  it('says nothing of a cylinder standing on the floor, or of the sides of a round part', () => {
    expect(placeFights({ places: [withPart('puck', 0)], kit: puckKit, heightAt: () => 0, nowMs: 0 })).toEqual([])
  })

  it('none for the rugs of the fixture worlds, which lie on the floor', () => {
    expect(placeFights({ places: [lamps, withPart('rug-round', 0.1), withPart('rug-round', 0), withPart('rug-square', 0.1)], kit, heightAt: () => 0, nowMs: 0 })).toEqual([])
  })
})
