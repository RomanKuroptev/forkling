import { describe, expect, it } from 'vitest'
import { IslandConfig, Vec3 } from '../src/index.ts'

describe('Vec3', () => {
  it('parses a tuple of three finite numbers', () => {
    expect(Vec3.parse([1, 2, 3])).toEqual([1, 2, 3])
  })

  it('rejects non-finite values and wrong lengths', () => {
    expect(Vec3.safeParse([1, 2]).success).toBe(false)
    expect(Vec3.safeParse([1, Number.NaN, 3]).success).toBe(false)
    expect(Vec3.safeParse([1, Infinity, 3]).success).toBe(false)
  })
})

describe('IslandConfig', () => {
  it('fills defaults for a ~100 m island', () => {
    const cfg = IslandConfig.parse({ seed: 7 })
    expect(cfg.size).toBe(100)
    expect(cfg.waterLevel).toBeLessThan(cfg.maxHeight)
    expect(cfg.resolution).toBeGreaterThan(0)
  })

  it('rejects water above the highest point', () => {
    expect(IslandConfig.safeParse({ seed: 1, maxHeight: 2, waterLevel: 3 }).success).toBe(false)
  })

  it('requires an integer seed', () => {
    expect(IslandConfig.safeParse({ seed: 1.5 }).success).toBe(false)
  })
})
