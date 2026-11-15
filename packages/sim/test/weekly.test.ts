import { describe, expect, it } from 'vitest'
import { MAX_REVIEW_RENAMES, WEEKLY_RETRY_MS, localWeekday, weeklyDue } from '../src/weekly.ts'

const TZ = 'Europe/Stockholm'
// 2026-11-15 is a Sunday; Stockholm is UTC+1 in November, so 19:00Z is 20:00 there.
const SUNDAY_2000 = Date.parse('2026-11-15T19:00:00Z')
const base = { nowMs: SUNDAY_2000, timezone: TZ, asleep: false, lastWeeklyDate: null, lastTriedMs: null }

describe('localWeekday', () => {
  it('is the weekday in Merge\'s own time zone, 0 for Sunday', () => {
    expect(localWeekday(TZ, Date.parse('2026-11-15T12:00:00Z'))).toBe(0)
    expect(localWeekday(TZ, Date.parse('2026-11-16T12:00:00Z'))).toBe(1)
    // 23:30Z on Saturday is already Sunday 00:30 in Stockholm.
    expect(localWeekday(TZ, Date.parse('2026-11-14T23:30:00Z'))).toBe(0)
  })
})

describe('weeklyDue (spec 9.5: Sunday at 20:00)', () => {
  it('is due from 20:00 on a Sunday', () => {
    expect(weeklyDue(base)).toBe(true)
    expect(weeklyDue({ ...base, nowMs: SUNDAY_2000 - 60_000 })).toBe(false)
    expect(weeklyDue({ ...base, nowMs: SUNDAY_2000 + 2 * 3_600_000 })).toBe(true)
  })
  it('is not due on any other day', () => {
    for (const day of ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21']) {
      expect(weeklyDue({ ...base, nowMs: Date.parse(`${day}T19:30:00Z`) }), day).toBe(false)
    }
  })
  it('is not due while asleep', () => {
    expect(weeklyDue({ ...base, asleep: true })).toBe(false)
  })
  it('is done once a Sunday', () => {
    expect(weeklyDue({ ...base, lastWeeklyDate: '2026-11-15' })).toBe(false)
    expect(weeklyDue({ ...base, lastWeeklyDate: '2026-11-08' })).toBe(true)
  })
  it('waits 30 minutes after a try that gave nothing', () => {
    expect(WEEKLY_RETRY_MS).toBe(30 * 60_000)
    expect(weeklyDue({ ...base, lastTriedMs: SUNDAY_2000 - WEEKLY_RETRY_MS + 1 })).toBe(false)
    expect(weeklyDue({ ...base, lastTriedMs: SUNDAY_2000 - WEEKLY_RETRY_MS })).toBe(true)
  })
  it('follows the time zone: 20:00 in Sweden is not 20:00 elsewhere', () => {
    expect(weeklyDue({ ...base, timezone: 'America/New_York' })).toBe(false)
  })
})

describe('the review\'s limits', () => {
  it('allows up to 2 renames', () => expect(MAX_REVIEW_RENAMES).toBe(2))
})
