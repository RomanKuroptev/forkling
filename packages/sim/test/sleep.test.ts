import { describe, expect, it } from 'vitest'
import { hourInZone } from '../src/playback.ts'
import { isAsleepAt, localDate, sleepWindow } from '../src/sleep.ts'

const TZ = 'Europe/Stockholm'
const hourOf = (ms: number) => hourInZone(TZ, ms)

describe('localDate', () => {
  it('is the calendar date in the forkling zone, not in UTC', () => {
    expect(localDate(TZ, Date.parse('2026-11-01T23:30:00Z'))).toBe('2026-11-02')
    expect(localDate(TZ, Date.parse('2026-11-01T12:00:00Z'))).toBe('2026-11-01')
  })
})

describe('sleepWindow', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    expect(sleepWindow('2026-11-02', 7, TZ)).toEqual(sleepWindow('2026-11-02', 7, TZ))
    const days = ['2026-11-02', '2026-11-03', '2026-11-04']
    const a = days.map((d) => sleepWindow(d, 7, TZ).wakeMs)
    const b = days.map((d) => sleepWindow(d, 8, TZ).wakeMs)
    expect(a).not.toEqual(b)
  })

  it('wakes about 07:00 and goes to bed about 23:00 on weekdays, within 30 minutes', () => {
    for (let day = 2; day <= 6; day++) {
      for (const seed of [1, 2, 3, 20260101]) {
        const w = sleepWindow(`2026-11-0${day}`, seed, TZ)
        expect(hourOf(w.wakeMs)).toBeGreaterThanOrEqual(6.5 - 1e-6)
        expect(hourOf(w.wakeMs)).toBeLessThanOrEqual(7.5 + 1e-6)
        expect(hourOf(w.bedMs)).toBeGreaterThanOrEqual(22.5 - 1e-6)
        expect(hourOf(w.bedMs)).toBeLessThanOrEqual(23.5 + 1e-6)
      }
    }
  })

  it('lies in on weekends', () => {
    // 2026-11-07 is a Saturday, 2026-11-08 a Sunday.
    for (const date of ['2026-11-07', '2026-11-08']) {
      const w = sleepWindow(date, 5, TZ)
      expect(hourOf(w.wakeMs)).toBeGreaterThanOrEqual(7.5 - 1e-6)
      expect(hourOf(w.wakeMs)).toBeLessThanOrEqual(8.5 + 1e-6)
    }
  })

  it('stays up 90 minutes later on a late night', () => {
    const normal = sleepWindow('2026-11-03', 5, TZ)
    const late = sleepWindow('2026-11-03', 5, TZ, true)
    expect(late.bedMs - normal.bedMs).toBe(90 * 60_000)
    expect(late.wakeMs).toBe(normal.wakeMs)
  })

  it('keeps local times right across the end of summer time (2026-10-25)', () => {
    const w = sleepWindow('2026-10-25', 5, TZ)
    expect(hourOf(w.wakeMs)).toBeGreaterThanOrEqual(7.5 - 1e-6)
    expect(hourOf(w.wakeMs)).toBeLessThanOrEqual(8.5 + 1e-6)
    expect(localDate(TZ, w.wakeMs)).toBe('2026-10-25')
  })
})

describe('isAsleepAt', () => {
  const opts = { seed: 11, timezone: TZ }
  const at = (iso: string) => Date.parse(iso)

  it('is asleep in the small hours and awake in the afternoon', () => {
    expect(isAsleepAt(at('2026-11-03T02:00:00Z'), opts)).toBe(true)
    expect(isAsleepAt(at('2026-11-03T13:00:00Z'), opts)).toBe(false)
  })

  it('is awake at 22:00 local and asleep at 23:45 local', () => {
    expect(isAsleepAt(at('2026-11-03T21:00:00Z'), opts)).toBe(false)
    expect(isAsleepAt(at('2026-11-03T22:45:00Z'), opts)).toBe(true)
  })

  it('switches exactly at the window edges', () => {
    const w = sleepWindow('2026-11-03', 11, TZ)
    expect(isAsleepAt(w.wakeMs - 1, opts)).toBe(true)
    expect(isAsleepAt(w.wakeMs, opts)).toBe(false)
    expect(isAsleepAt(w.bedMs - 1, opts)).toBe(false)
    expect(isAsleepAt(w.bedMs, opts)).toBe(true)
  })

  it('stays awake past midnight after a late night', () => {
    const late = { ...opts, lateNight: '2026-11-03' }
    // 00:10 local on the 4th is 23:10Z on the 3rd. Normally asleep, awake after choosing a late night.
    expect(isAsleepAt(at('2026-11-03T23:10:00Z'), opts)).toBe(true)
    expect(isAsleepAt(at('2026-11-03T23:10:00Z'), late)).toBe(false)
    expect(isAsleepAt(at('2026-11-04T01:00:00Z'), late)).toBe(true)
  })
})
