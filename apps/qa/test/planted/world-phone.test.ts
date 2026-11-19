import { describe, expect, it } from 'vitest'
import { COVER_LEVEL, coveredShare, samplePoints } from '../../src/world/phone.ts'
import { letterPixels } from '../../src/world/pictures.ts'

describe('the phone overlay and readable letters (audit spec 7.4)', () => {
  it('samples five points over Merge', () => {
    const pts = samplePoints({ min: [0, 0, 0], max: [4, 2, 4] })
    expect(pts[0]).toEqual([2, 1, 2])
    expect(pts).toHaveLength(5)
  })
  it('planted: the stick over most of Merge is over the level; Merge in the clear is not', () => {
    expect(coveredShare([{ visible: true, covered: true }, { visible: true, covered: true }, { visible: true, covered: false }])).toBeGreaterThan(COVER_LEVEL)
    expect(coveredShare([{ visible: true, covered: false }, { visible: true, covered: false }])).toBe(0)
    expect(coveredShare([{ visible: false, covered: false }])).toBeNull()
  })
  it('planted: letters 5 cm high are too small to read on a phone from 6 m; 20 cm letters are fine', () => {
    expect(letterPixels(0.05)).toBeLessThan(10)
    expect(letterPixels(0.2)).toBeGreaterThan(10)
  })
})
