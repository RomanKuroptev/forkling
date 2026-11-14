import { describe, expect, it } from 'vitest'
import { MAX_REFLECTIONS_PER_DAY, REFLECT_GAP_MS, REFLECT_THRESHOLD, REFLECT_THRESHOLD_COLD, fixedImportance, importanceSum, reflectDue, surpriseImportance } from '../src/importance.ts'

const HOUR = 3_600_000

describe('fixed importance (spec 9.3)', () => {
  it('a build failed 6, a build landed 5, a note found 4, a souvenir kept 3', () => {
    expect(fixedImportance('buildFailed')).toBe(6)
    expect(fixedImportance('buildLanded')).toBe(5)
    expect(fixedImportance('noteFound')).toBe(4)
    expect(fixedImportance('souvenirKept')).toBe(3)
  })
  it('a reflection insight is 5 and boredom is 6 (12.4)', () => {
    expect(fixedImportance('insight')).toBe(5)
    expect(fixedImportance('boredom')).toBe(6)
  })
})

describe('surprise adds its score again from 7 (spec 9.3)', () => {
  it('adds nothing under 7 and the surprise itself from 7', () => {
    expect(surpriseImportance(0)).toBe(0)
    expect(surpriseImportance(6)).toBe(0)
    expect(surpriseImportance(7)).toBe(7)
    expect(surpriseImportance(10)).toBe(10)
  })
})

describe('importanceSum', () => {
  it('adds the scores of events after a point, and ignores earlier ones', () => {
    const items = [
      { at: 100, importance: 5 },
      { at: 200, importance: 3 },
      { at: 300, importance: 4 },
    ]
    expect(importanceSum(items, 150)).toBe(7)
    expect(importanceSum(items, 0)).toBe(12)
    expect(importanceSum(items, 300)).toBe(0)
    expect(importanceSum([], 0)).toBe(0)
  })
})

describe('reflectDue (spec 9.3, 9.4)', () => {
  const base = { sum: 60, wantCount: 5, reflectionsToday: 0, lastReflectionMs: null, nowMs: 100 * HOUR, asleep: false }
  it('has the numbers of the spec', () => {
    expect([REFLECT_THRESHOLD, REFLECT_THRESHOLD_COLD, MAX_REFLECTIONS_PER_DAY, REFLECT_GAP_MS]).toEqual([60, 30, 2, 2 * HOUR])
  })
  it('runs at 60, not at 59', () => {
    expect(reflectDue(base)).toBe(true)
    expect(reflectDue({ ...base, sum: 59 })).toBe(false)
  })
  it('runs at 30 while there are fewer than 3 wants', () => {
    expect(reflectDue({ ...base, sum: 30, wantCount: 2 })).toBe(true)
    expect(reflectDue({ ...base, sum: 29, wantCount: 0 })).toBe(false)
    expect(reflectDue({ ...base, sum: 30, wantCount: 3 })).toBe(false)
  })
  it('at most 2 a day', () => {
    expect(reflectDue({ ...base, reflectionsToday: 1 })).toBe(true)
    expect(reflectDue({ ...base, reflectionsToday: 2 })).toBe(false)
  })
  it('at least 2 hours apart', () => {
    expect(reflectDue({ ...base, lastReflectionMs: base.nowMs - 2 * HOUR + 1 })).toBe(false)
    expect(reflectDue({ ...base, lastReflectionMs: base.nowMs - 2 * HOUR })).toBe(true)
  })
  it('never while asleep', () => {
    expect(reflectDue({ ...base, asleep: true })).toBe(false)
  })
})
