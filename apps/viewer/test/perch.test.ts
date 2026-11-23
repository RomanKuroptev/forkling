import { describe, expect, it } from 'vitest'
import { kit } from '@forkling/schema/kit'
import { bodyWorldFor } from '@forkling/sim'
import { PERCH_REACH, perchLift } from '../src/forkling/perch.ts'

const world = bodyWorldFor({ seed: 1, places: [], kit })
const spots = world.spots([0, 1, 0])
const desk = spots.desk![0]!

describe('Merge up on the seat at its desk (issue 461)', () => {
  it('sits at the seat height on the chair when its step is at the desk', () => {
    expect(perchLift(spots, { targetId: 'desk', moving: false }, desk)).toBeCloseTo(0.5, 9)
  })

  it('eases up over the last stretch, by how far it still has to go', () => {
    const at = (d: number) => perchLift(spots, { targetId: 'desk', moving: true }, { x: desk.x, z: desk.z + d })
    expect(at(PERCH_REACH + 0.01)).toBe(0)
    expect(at(PERCH_REACH / 2)).toBeGreaterThan(0)
    expect(at(PERCH_REACH / 2)).toBeLessThan(0.5)
    expect(at(PERCH_REACH * 0.25)).toBeGreaterThan(at(PERCH_REACH * 0.75))
  })

  it('stays on the floor at the chair when its step is somewhere else and it is not walking off the seat', () => {
    expect(perchLift(spots, { targetId: 'home', moving: false }, desk)).toBe(0)
    expect(perchLift(spots, { moving: false }, desk)).toBe(0)
  })

  it('eases down as it walks off the seat to somewhere else', () => {
    expect(perchLift(spots, { targetId: 'home', moving: true }, { x: desk.x, z: desk.z + PERCH_REACH * 0.9 })).toBeLessThan(0.1)
  })

  it('is on the floor away from any seat', () => {
    expect(perchLift(spots, { targetId: 'desk', moving: true }, { x: desk.x + 3, z: desk.z })).toBe(0)
  })
})
