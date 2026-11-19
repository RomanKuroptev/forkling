import { describe, expect, it } from 'vitest'
import { centre, frontOf, headingTo, lookAt } from '../src/review/explore/aim.ts'

describe('aiming the explorer', () => {
  it('heads the way the sim counts: 0 along +z, a quarter turn along +x, a half turn along -z', () => {
    expect(headingTo({ x: 0, z: 0 }, { x: 0, z: 5 })).toBeCloseTo(0)
    expect(headingTo({ x: 0, z: 0 }, { x: 5, z: 0 })).toBeCloseTo(Math.PI / 2)
    expect(Math.abs(headingTo({ x: 0, z: 0 }, { x: 0, z: -5 }))).toBeCloseTo(Math.PI)
  })
  it('looks up at something above the eye and down at something below', () => {
    expect(lookAt([0, 1.6, 0], [0, 11.6, 10]).pitch).toBeCloseTo(Math.PI / 4)
    expect(lookAt([0, 1.6, 0], [0, 0, 10]).pitch).toBeLessThan(0)
  })
  it('stands in front of a place on its door side', () => {
    const box = { min: [0, 0, 0] as [number, number, number], max: [8, 4, 6] as [number, number, number] }
    expect(centre(box)).toEqual([4, 2, 3])
    expect(frontOf(box, 5)).toEqual({ x: 4, z: 11 })
  })
})
