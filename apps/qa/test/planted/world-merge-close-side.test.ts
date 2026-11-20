import { describe, expect, it } from 'vitest'
import { MAX_OFF_FACE, offFace } from '../../src/world/bump.ts'

// Merge at (8, 17.7) facing the door (+z, heading 0), as by Home's bench in day-7 (issue 348, second look).
const merge = { x: 8, z: 17.7 }

describe('the merge-close camera stands in front of Merge\'s face (issue 348, second look)', () => {
  it('planted: the clear pose that saw Merge edge-on from its side is more than 45 deg round, and fails', () => {
    // The lens 1.5 m off to Merge's right, at eye level: the eyes were slivers.
    const side = [8 + 1.5, 0.7, 17.7]
    expect(offFace(merge, 0, side)).toBeCloseTo(90)
    expect(offFace(merge, 0, side)).toBeGreaterThan(MAX_OFF_FACE)
    // Behind it is worse.
    expect(offFace(merge, 0, [8, 0.7, 16.2])).toBeCloseTo(180)
  })

  it('straight in front, or a little round, raised over the bench or not, passes', () => {
    expect(offFace(merge, 0, [8, 0.7, 19.2])).toBeCloseTo(0)
    expect(offFace(merge, 0, [8, 1.5, 19.2])).toBeCloseTo(0)
    const round = [8 + Math.sin(Math.PI / 6) * 1.5, 0.7, 17.7 + Math.cos(Math.PI / 6) * 1.5]
    expect(offFace(merge, 0, round)).toBeCloseTo(30)
    expect(offFace(merge, 0, round)).toBeLessThanOrEqual(MAX_OFF_FACE)
  })

  it('reads the heading the way the viewer turns Merge: across the -pi to pi seam', () => {
    // Facing -z (heading pi), a lens on the -z side is in front.
    expect(offFace(merge, Math.PI, [8, 0.7, 16.2])).toBeCloseTo(0)
    expect(offFace(merge, -Math.PI + 0.1, [8, 0.7, 16.2])).toBeLessThan(10)
  })
})
