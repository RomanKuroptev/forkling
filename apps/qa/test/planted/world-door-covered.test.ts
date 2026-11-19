import { describe, expect, it } from 'vitest'
import { coveredDoorFindings, type CoveredDoor } from '../../src/world/fights.ts'

describe('no door hidden behind its own wall (issues 370 and 371, second try)', () => {
  it('passes a world where every door stands in front of its wall', () => {
    expect(coveredDoorFindings([], 'day-30')).toEqual([])
  })

  it('planted: the upper floor door of grown place 5 covered by the wall moved 1 cm out is a major look finding', () => {
    const door: CoveredDoor = { place: 'grown-place-5', door: 'part room-2/4 (door-wood)', by: 'the body of the building', gap: 0.01, area: 2.1, at: [-16, 4.05, 19.46] }
    const found = coveredDoorFindings([door], 'day-30')
    expect(found).toHaveLength(1)
    expect(found[0]!.fingerprint).toBe('world.door-covered|day-30|grown-place-5/room-2/4')
    expect(found[0]!.severity).toBe('major')
    expect(found[0]!.fixKind).toBe('look')
    expect(found[0]!.what).toContain('1.0 cm behind the body of the building')
  })
})
