import { describe, expect, it } from 'vitest'
import { EDGE_HEADINGS, landEndsAt, offLand } from '../../src/world/walk.ts'

describe('the edge walk: a visitor stays on the land (issues 340, 351, audit QW.2)', () => {
  it('runs at the end of the land in all four directions', () => {
    expect(EDGE_HEADINGS).toHaveLength(4)
  })
  it('finds where a line of ground samples leaves the land, or null when it never does', () => {
    expect(landEndsAt([{ y: 0, chunk: 'owned' }, { y: 0, chunk: 'edge' }, { y: 0, chunk: 'fog' }], 2)).toBe(4)
    expect(landEndsAt([{ y: 0, chunk: 'owned' }, { y: 0, chunk: 'edge' }], 2)).toBeNull()
  })
  it('planted: a visitor over the fog has walked off the land (the run west of issue 340)', () => {
    expect(offLand({ y: -3 }, { y: 0.4, chunk: 'fog' })).toBe(true)
  })
  it('planted: a visitor that fell under the ground has left the land, even over a drawn chunk', () => {
    expect(offLand({ y: -20 }, { y: 1.2, chunk: 'edge' })).toBe(true)
  })
  it('a visitor standing on the edge land, its middle above the ground, is on the land', () => {
    expect(offLand({ y: 1.95 }, { y: 1.2, chunk: 'edge' })).toBe(false)
  })
})
