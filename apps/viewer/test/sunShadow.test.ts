import { describe, expect, it } from 'vitest'
import { sunDirection } from '@forkling/sim'
import { SUN_SHADOW, sunPose } from '../src/world/sunShadow.ts'

describe("the sun's shadow box follows the visitor (issue 429)", () => {
  it('a visitor inside a place 67 m from the middle of the world is well inside the shadow box', () => {
    const dir = sunDirection(14)
    const visitor = { x: 48, z: -47 }
    const { position, target } = sunPose(dir, visitor)
    expect(Math.hypot(target[0] - visitor.x, target[2] - visitor.z)).toBeLessThan(SUN_SHADOW.step)
    // The place (12 by 10 m) fits in the box with room to spare.
    expect(Math.abs(target[0] - visitor.x) + 12).toBeLessThan(SUN_SHADOW.half)
    // The sun still shines from its own direction onto that point.
    expect(position[0] - target[0]).toBeCloseTo(dir[0]! * SUN_SHADOW.distance, 5)
    expect(position[2] - target[2]).toBeCloseTo(dir[2]! * SUN_SHADOW.distance, 5)
  })

  it('moves in steps, so the shadows do not crawl as the visitor walks', () => {
    const dir = sunDirection(14)
    expect(sunPose(dir, { x: 48.2, z: -47 }).target).toEqual(sunPose(dir, { x: 49.9, z: -46.1 }).target)
  })

  it('with no visitor it looks at the middle of the world', () => {
    expect(sunPose(sunDirection(14), null).target).toEqual([0, 0, 0])
  })
})
