import { describe, expect, it } from 'vitest'
import { daysSinceCare, neglectFor, neglectLevel } from '../src/neglect.ts'

const DAY = 86_400_000
const at = (iso: string) => Date.parse(iso)

describe('neglect levels (spec 4.4)', () => {
  it.each([
    [0, 0], [6, 0], [7, 1], [13, 1], [14, 2], [27, 2], [28, 3], [400, 3],
  ])('%i days since care is level %i', (days, level) => {
    expect(neglectLevel(days)).toBe(level)
  })
})

describe('days since care', () => {
  it('counts whole days from the last care, and any care resets it to 0', () => {
    const last = '2026-11-01T10:00:00Z'
    expect(daysSinceCare({ lastCareAt: last, founded: '2026-10-01' }, at(last))).toBe(0)
    expect(daysSinceCare({ lastCareAt: last, founded: '2026-10-01' }, at(last) + 6.9 * DAY)).toBe(6)
    expect(daysSinceCare({ lastCareAt: last, founded: '2026-10-01' }, at(last) + 7 * DAY)).toBe(7)
  })
  it('counts from the day it was founded when it has never been cared for', () => {
    expect(daysSinceCare({ lastCareAt: null, founded: '2026-11-01' }, at('2026-11-15T00:00:00Z'))).toBe(14)
  })
  it('is never negative, even if the clock is behind', () => {
    expect(daysSinceCare({ lastCareAt: '2026-11-10T00:00:00Z', founded: '2026-11-01' }, at('2026-11-09T00:00:00Z'))).toBe(0)
  })
})

describe('the neglect of a place', () => {
  const old = { lastCareAt: '2026-09-01T00:00:00Z', founded: '2026-08-01' }
  const now = at('2026-11-12T00:00:00Z')
  it('is the level for the days since care', () => {
    expect(neglectFor({ id: 'house-of-lights', ...old }, now)).toBe(3)
    expect(neglectFor({ id: 'house-of-lights', lastCareAt: '2026-11-05T00:00:00Z', founded: '2026-08-01' }, now)).toBe(1)
    expect(neglectFor({ id: 'house-of-lights', lastCareAt: '2026-11-11T00:00:00Z', founded: '2026-08-01' }, now)).toBe(0)
  })
  it('never goes above 1 for Home and the Workshop, and nothing is removed from the world', () => {
    expect(neglectFor({ id: 'home', ...old }, now)).toBe(1)
    expect(neglectFor({ id: 'workshop', ...old }, now)).toBe(1)
    expect(neglectFor({ id: 'home', lastCareAt: '2026-11-11T00:00:00Z', founded: '2026-08-01' }, now)).toBe(0)
  })
})
