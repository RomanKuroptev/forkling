import { describe, expect, it } from 'vitest'
import { boardHiddenShare, boxGap, footprintOverlap, inView, segmentHitsBox, volumeOverlap, type Box } from '../src/qa-geometry.ts'

const box = (min: [number, number, number], max: [number, number, number]): Box => ({ min, max })

describe('box measures for the world checks (audit spec 7.2)', () => {
  it('measures how much two footprints overlap on the ground, ignoring height', () => {
    expect(footprintOverlap(box([0, 0, 0], [4, 3, 4]), box([2, 10, 2], [6, 12, 6]))).toBeCloseTo(4)
    expect(footprintOverlap(box([0, 0, 0], [4, 3, 4]), box([4, 0, 0], [8, 3, 4]))).toBe(0)
    expect(footprintOverlap(box([0, 0, 0], [4, 3, 4]), box([5, 0, 5], [8, 3, 8]))).toBe(0)
  })
  it('measures the volume two boxes share', () => {
    expect(volumeOverlap(box([0, 0, 0], [2, 2, 2]), box([1, 1, 1], [3, 3, 3]))).toBeCloseTo(1)
    expect(volumeOverlap(box([0, 0, 0], [2, 2, 2]), box([0, 3, 0], [2, 4, 2]))).toBe(0)
  })
  it('says how far apart two boxes are, 0 when they touch or overlap', () => {
    expect(boxGap(box([0, 0, 0], [1, 1, 1]), box([1, 0, 0], [2, 1, 1]))).toBe(0)
    expect(boxGap(box([0, 0, 0], [1, 1, 1]), box([0, 4, 0], [1, 5, 1]))).toBeCloseTo(3)
    expect(boxGap(box([0, 0, 0], [1, 1, 1]), box([4, 5, 0], [5, 6, 1]))).toBeCloseTo(5)
  })
  it('knows whether a point is inside a camera view (heading 0 looks along +z)', () => {
    const eye: [number, number, number] = [0, 1.6, 0]
    expect(inView(eye, 0, 0, 70, 1.6, [0, 1.6, 10])).toBe(true)
    expect(inView(eye, 0, 0, 70, 1.6, [0, 1.6, -10])).toBe(false)
    expect(inView(eye, Math.PI, 0, 70, 1.6, [0, 1.6, -10])).toBe(true)
    expect(inView(eye, 0, 0, 70, 1.6, [20, 1.6, 10])).toBe(false)
    expect(inView(eye, 0, 0, 70, 1.6, [0, 30, 10])).toBe(false)
  })
})

describe('what stands between an eye and a sign (issues 356, 366)', () => {
  const board = { min: [0, 1, 5] as [number, number, number], max: [2.6, 2.2, 5] as [number, number, number] }
  it('a line through a box hits it, one beside it or behind its end does not', () => {
    expect(segmentHitsBox([0, 0, 0], [0, 0, 10], { min: [-1, -1, 4], max: [1, 1, 5] })).toBe(true)
    expect(segmentHitsBox([0, 0, 0], [0, 0, 10], { min: [2, -1, 4], max: [3, 1, 5] })).toBe(false)
    expect(segmentHitsBox([0, 0, 0], [0, 0, 3], { min: [-1, -1, 4], max: [1, 1, 5] })).toBe(false)
  })
  it('a column through the board hides part of it, one behind it hides nothing', () => {
    const through = { min: [0.2, 0, 4.6] as [number, number, number], max: [1, 3, 5.4] as [number, number, number] }
    const behind = { min: [0.2, 0, 3] as [number, number, number], max: [1, 3, 3.8] as [number, number, number] }
    expect(boardHiddenShare(board, 0, [through])).toBeGreaterThan(0)
    expect(boardHiddenShare(board, 0, [behind])).toBe(0)
  })
})
