import { describe, expect, it } from 'vitest'
import { nightFactor } from '../src/world/night.ts'

describe('how night it is (0 by day, 1 in the dark of the night)', () => {
  it('is 0 at noon and 1 in the middle of the night', () => {
    expect(nightFactor(12)).toBe(0)
    expect(nightFactor(0)).toBeCloseTo(1, 6)
    expect(nightFactor(2)).toBeCloseTo(1, 6)
    expect(nightFactor(23)).toBeCloseTo(1, 6)
  })

  it('stays between 0 and 1, and rises through the evening without a dip', () => {
    let last = nightFactor(14)
    for (let hour = 14; hour <= 23; hour += 0.25) {
      const night = nightFactor(hour)
      expect(night).toBeGreaterThanOrEqual(0)
      expect(night).toBeLessThanOrEqual(1)
      expect(night, `${hour}`).toBeGreaterThanOrEqual(last - 1e-9)
      last = night
    }
  })

  it('falls through the morning without a rise', () => {
    let last = nightFactor(3)
    for (let hour = 3; hour <= 12; hour += 0.25) {
      expect(nightFactor(hour), `${hour}`).toBeLessThanOrEqual(last + 1e-9)
      last = nightFactor(hour)
    }
  })

  it('is already well on by dusk, so windows are lit when the light goes', () => {
    expect(nightFactor(20.5)).toBeGreaterThan(0.5)
  })
})
