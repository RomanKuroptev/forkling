import { describe, expect, it } from 'vitest'
import { findSunbeams, isSunlit, sunDirection, type Caster } from '../src/sky.ts'
import { isWalkable } from '../src/nav.ts'
import { cfg, world } from './helpers/world.ts'

describe('sunDirection', () => {
  it('is a unit vector', () => {
    for (const h of [0, 6, 9.5, 12, 15, 18, 23]) {
      expect(Math.hypot(...sunDirection(h))).toBeCloseTo(1)
    }
  })

  it('rises in the east at 6, peaks early in the afternoon and sets in the west at 20', () => {
    expect(sunDirection(8)[0]).toBeGreaterThan(0)
    expect(sunDirection(17)[0]).toBeLessThan(0)
    expect(Math.abs(sunDirection(13)[0])).toBeLessThan(0.05)
    expect(sunDirection(13)[1]).toBeGreaterThan(sunDirection(9)[1])
    expect(sunDirection(6)[1]).toBeCloseTo(0, 1)
    expect(sunDirection(20)[1]).toBeCloseTo(0, 1)
  })

  it('is still above the horizon through dusk, and gone by the time night starts', () => {
    expect(sunDirection(18)[1]).toBeGreaterThan(0.1)
    expect(sunDirection(19.5)[1]).toBeGreaterThan(0)
    expect(sunDirection(21)[1]).toBeLessThan(0)
  })

  it('is above the horizon by day and below it at night', () => {
    expect(sunDirection(12)[1]).toBeGreaterThan(0.5)
    expect(sunDirection(2)[1]).toBeLessThan(0)
    expect(sunDirection(22)[1]).toBeLessThan(0)
  })
})

describe('isSunlit', () => {
  const lowSun = (() => {
    const v: [number, number, number] = [0.9, 0.3, 0]
    const n = Math.hypot(...v)
    return v.map((c) => c / n) as [number, number, number]
  })()
  const point = { x: 0, y: 0, z: 0 }
  const tree = (x: number, z: number): Caster => ({ x, z, radius: 1, top: 4 })

  it('is lit with nothing in the way', () => {
    expect(isSunlit(point, lowSun, [])).toBe(true)
  })

  it('is shaded by a tall caster towards the sun', () => {
    expect(isSunlit(point, lowSun, [tree(3, 0)])).toBe(false)
  })

  it('is lit when the caster is off to the side, behind, or too far to reach over', () => {
    expect(isSunlit(point, lowSun, [tree(3, 5)])).toBe(true)
    expect(isSunlit(point, lowSun, [tree(-3, 0)])).toBe(true)
    expect(isSunlit(point, lowSun, [tree(30, 0)])).toBe(true)
  })

  it('is shaded when standing under a canopy', () => {
    expect(isSunlit(point, lowSun, [tree(0.3, 0)])).toBe(false)
  })

  it('is never lit while the sun is below the horizon', () => {
    expect(isSunlit(point, sunDirection(2), [])).toBe(false)
  })
})

describe('findSunbeams', () => {
  const beams = (hour: number) => findSunbeams(cfg, world.grid, sunDirection(hour), world.casters)
  const key = (p: { x: number; z: number }) => `${p.x},${p.z}`

  it('finds none at night', () => {
    expect(beams(2)).toEqual([])
  })

  it('finds walkable, sunlit spots beside props', () => {
    const found = beams(10)
    expect(found.length).toBeGreaterThan(3)
    for (const p of found) {
      expect(isWalkable(world.grid, p.x, p.z)).toBe(true)
      expect(world.casters.some((c) => Math.hypot(c.x - p.x, c.z - p.z) <= 6)).toBe(true)
    }
  })

  it('moves with the time of day', () => {
    const morning = new Set(beams(9).map(key))
    const afternoon = new Set(beams(15).map(key))
    const shared = [...morning].filter((k) => afternoon.has(k)).length
    expect(shared).toBeLessThan(morning.size)
  })

  it('is deterministic', () => {
    expect(beams(11)).toEqual(beams(11))
  })
})
