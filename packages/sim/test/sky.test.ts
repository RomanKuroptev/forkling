import { describe, expect, it } from 'vitest'
import { sunDirection } from '../src/sky.ts'

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
