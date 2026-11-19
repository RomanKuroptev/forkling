import { describe, expect, it } from 'vitest'
import { fightFindings, type SurfaceFight } from '../../src/world/fights.ts'

const fight = (place: string, a: string, b: string, area: number, normal: [number, number, number]): SurfaceFight => ({ place, a, b, area, at: [0, 0.14, 0], normal })

describe('no surfaces that fight (issues 350, 353, 335, 337, 364, 370, 371)', () => {
  it('passes a world whose places have no faces in one plane', () => {
    expect(fightFindings([], 'day-7')).toEqual([])
  })

  it('planted: the Workshop floor flush with the slab, and leg feet flush with a ceiling, are one finding per place', () => {
    const found = fightFindings(
      [
        fight('workshop', 'the base of the building', 'a floor', 99, [0, 1, 0]),
        fight('workshop', 'the body of the building', 'a floor', 0.01, [1, 0, 0]),
        fight('grown-place-4', 'a floor', 'part room-3/4 (table)', 0.004, [0, -1, 0]),
      ],
      'day-7',
    )
    expect(found.map((f) => f.fingerprint)).toEqual(['world.surfaces-fight|day-7|workshop', 'world.surfaces-fight|day-7|grown-place-4'])
    expect(found[0]!.severity).toBe('major')
    expect(found[0]!.what).toContain('the base of the building and a floor, facing up, 99.00 square meters')
    expect(found[1]!.severity).toBe('minor')
    expect(found[1]!.what).toContain('facing down')
    expect(found.every((f) => f.fixKind === 'look' && f.id === 'world.surfaces-fight')).toBe(true)
  })
})
