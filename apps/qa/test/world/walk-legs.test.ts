import { describe, expect, it } from 'vitest'
import { MAX_LEG, WALK_VIEW, shortLegs } from '../../src/world/walk.ts'
import { PICTURE_VIEW } from '../../src/world/pictures.ts'

describe('the size the walks draw at', () => {
  it('is the pictures size, so a walk alone walks as it does after the pictures and draws a quarter of the 1280x800 page', () => {
    expect(WALK_VIEW).toEqual(PICTURE_VIEW)
    expect(WALK_VIEW.width * WALK_VIEW.height).toBeLessThanOrEqual((1280 * 800) / 4)
  })
})

describe('the walks follow their path in short stretches', () => {
  it('cuts a 55 m straight stretch into pieces of at most 20 m along the same line, and keeps every point of the path', () => {
    const start = { x: 8, z: 25 }
    const path = [{ x: -47.125, z: 21.125 }, { x: -48, z: 16.89 }]
    const legs = shortLegs(start, path)
    expect(legs.at(-1)).toEqual(path[1])
    expect(legs).toContainEqual(path[0])
    let from = start
    for (const p of legs) {
      expect(Math.hypot(p.x - from.x, p.z - from.z)).toBeLessThanOrEqual(MAX_LEG + 1e-9)
      from = p
    }
    expect(legs).toHaveLength(4)
    // The cut points lie on the line from the start to the door.
    expect(legs[1]!.x).toBeCloseTo(8 + ((-47.125 - 8) * 2) / 3)
    expect(legs[1]!.z).toBeCloseTo(25 + ((21.125 - 25) * 2) / 3)
  })

  it('leaves a short path as it is', () => {
    expect(shortLegs({ x: 0, z: 0 }, [{ x: 3, z: 4 }, { x: 6, z: 8 }])).toEqual([{ x: 3, z: 4 }, { x: 6, z: 8 }])
  })
})
