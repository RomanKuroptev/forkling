import { describe, expect, it } from 'vitest'
import { EDGE_RAY, LAND_SIDE, edgeShown } from '../../src/world/walk.ts'

describe('the end of the land is drawn where the walk stops (issue 454, audit QW.2)', () => {
  it('planted: a ray back at the land from past the stop that meets nothing (the flat sheet of issue 454) is unseen', () => {
    expect(edgeShown(null)).toBe(false)
  })

  it('planted: one that meets something else, such as the land seen from under it far in, is unseen', () => {
    expect(edgeShown({ distance: 1.5, object: 'Mesh' })).toBe(false)
    expect(edgeShown({ distance: EDGE_RAY.out + 0.5, object: LAND_SIDE })).toBe(false)
  })

  it('passes when the land\'s side stands between the stop and the fog', () => {
    expect(edgeShown({ distance: 2, object: LAND_SIDE })).toBe(true)
  })
})
