import { describe, expect, it } from 'vitest'
import { addDays, addWakingMs, isAsleepAt, localDate, sleepWindow } from '../src/sleep.ts'

const TZ = 'Europe/Stockholm'
const HOUR = 3_600_000
const MIN = 60_000
const opts = (extra: { lateNight?: string } = {}) => ({ seed: 7, timezone: TZ, ...extra })

/** Minutes the forkling is awake in [from, to), counted a minute at a time. */
function awakeMinutes(from: number, to: number, o = opts()) {
  let n = 0
  for (let ms = from; ms < to; ms += MIN) if (!isAsleepAt(ms, o)) n++
  return n
}

describe('addDays', () => {
  it('moves a local date by whole days across month and year ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2026-11-13', 0)).toBe('2026-11-13')
  })
})

describe('addWakingMs (construction time does not run while Merge sleeps, spec 4.5)', () => {
  it('is plain addition inside one waking day', () => {
    const start = Date.parse('2026-11-04T11:00:00Z') // 12:00 in Stockholm
    expect(addWakingMs(start, 3 * HOUR, opts())).toBe(start + 3 * HOUR)
    expect(addWakingMs(start, 0, opts())).toBe(start)
  })

  it('skips the night: what is left at bedtime is spent after the next wake', () => {
    const start = Date.parse('2026-11-04T20:00:00Z') // 21:00 in Stockholm
    const bed = sleepWindow('2026-11-04', 7, TZ).bedMs
    const nextWake = sleepWindow('2026-11-05', 7, TZ).wakeMs
    const left = 3 * HOUR - (bed - start)
    expect(left).toBeGreaterThan(0)
    expect(addWakingMs(start, 3 * HOUR, opts())).toBe(nextWake + left)
  })

  it('starts counting at wake when it starts in bed', () => {
    const start = Date.parse('2026-11-05T02:00:00Z') // 03:00, asleep
    const wake = sleepWindow('2026-11-05', 7, TZ).wakeMs
    expect(addWakingMs(start, 6 * HOUR, opts())).toBe(wake + 6 * HOUR)
    expect(addWakingMs(start, 0, opts())).toBe(wake)
  })

  it('counts exactly the waking time in between, whatever the start, length and night', () => {
    const starts = ['2026-11-03T05:30:00Z', '2026-11-03T21:50:00Z', '2026-11-04T23:10:00Z', '2026-11-07T08:00:00Z', '2026-11-08T20:30:00Z']
    for (const s of starts) {
      for (const hours of [3, 6, 11, 30]) {
        const start = Date.parse(s)
        const end = addWakingMs(start, hours * HOUR, opts())
        expect(isAsleepAt(end - 1, opts()), `${s} +${hours}h ends asleep`).toBe(false)
        const first = isAsleepAt(start, opts()) ? 0 : start
        // The waking minutes from the first awake moment to the end are the length asked for, to a minute.
        const from = first === 0 ? sleepWindow(localDate(TZ, start), 7, TZ).wakeMs : start
        expect(Math.abs(awakeMinutes(Math.min(from, end), end) - hours * 60), `${s} +${hours}h`).toBeLessThanOrEqual(1)
      }
    }
  })

  it('is right across the clock change of 25 October 2026', () => {
    const start = Date.parse('2026-10-24T20:00:00Z')
    const end = addWakingMs(start, 8 * HOUR, opts())
    expect(Math.abs(awakeMinutes(start, end) - 8 * 60)).toBeLessThanOrEqual(1)
  })

  it('follows a late night: the evening it stays up is longer', () => {
    const start = Date.parse('2026-11-04T20:00:00Z')
    const normal = addWakingMs(start, 5 * HOUR, opts())
    const late = addWakingMs(start, 5 * HOUR, opts({ lateNight: '2026-11-04' }))
    expect(late).toBeLessThan(normal)
    expect(isAsleepAt(late - 1, opts({ lateNight: '2026-11-04' }))).toBe(false)
  })

  it('is deterministic, and a start in bed ends when that seed wakes (every night is 8 hours, so a start before bed is the same for any seed)', () => {
    const start = Date.parse('2026-11-05T02:00:00Z')
    expect(addWakingMs(start, 6 * HOUR, opts())).toBe(addWakingMs(start, 6 * HOUR, opts()))
    expect(addWakingMs(start, 6 * HOUR, { seed: 8, timezone: TZ })).not.toBe(addWakingMs(start, 6 * HOUR, opts()))
  })
})
