import { describe, expect, it } from 'vitest'
import { afterThought, MAX_THOUGHT_REPLANS_PER_DAY, requestReplan, thoughtDue, thoughtIntervalMs } from '../src/thought.ts'

const TZ = 'Europe/Stockholm'
const MIN = 60_000
/** In November Stockholm is UTC+1, so 17:00Z is 18:00 local. */
const at = (iso: string) => Date.parse(iso)

describe('thoughtIntervalMs (spec 2.2)', () => {
  it('is 5 minutes through the day and 2 minutes from 18:00 local', () => {
    expect(thoughtIntervalMs({ timezone: TZ, nowMs: at('2026-11-12T11:00:00Z'), paceAhead: false })).toBe(5 * MIN)
    expect(thoughtIntervalMs({ timezone: TZ, nowMs: at('2026-11-12T16:59:00Z'), paceAhead: false })).toBe(5 * MIN)
    expect(thoughtIntervalMs({ timezone: TZ, nowMs: at('2026-11-12T17:00:00Z'), paceAhead: false })).toBe(2 * MIN)
    expect(thoughtIntervalMs({ timezone: TZ, nowMs: at('2026-11-12T21:30:00Z'), paceAhead: false })).toBe(2 * MIN)
  })

  it('is 10 minutes at any hour while spend is ahead of the pace (spec 13)', () => {
    expect(thoughtIntervalMs({ timezone: TZ, nowMs: at('2026-11-12T11:00:00Z'), paceAhead: true })).toBe(10 * MIN)
    expect(thoughtIntervalMs({ timezone: TZ, nowMs: at('2026-11-12T19:00:00Z'), paceAhead: true })).toBe(10 * MIN)
  })
})

describe('thoughtDue', () => {
  const base = { timezone: TZ, nowMs: at('2026-11-12T11:00:00Z'), asleep: false, paceAhead: false }

  it('is never due while asleep', () => {
    expect(thoughtDue({ ...base, asleep: true })).toBe(false)
  })

  it('is due at once when there has been no thought, and again when the interval has passed', () => {
    expect(thoughtDue(base)).toBe(true)
    expect(thoughtDue({ ...base, thought: { failures: 0, recent: [], lastAt: new Date(base.nowMs - 4 * MIN).toISOString() } })).toBe(false)
    expect(thoughtDue({ ...base, thought: { failures: 0, recent: [], lastAt: new Date(base.nowMs - 5 * MIN).toISOString() } })).toBe(true)
  })

  it('waits while the pause after repeated failures lasts', () => {
    const thought = { failures: 0, recent: [], lastAt: new Date(base.nowMs - 6 * MIN).toISOString(), pausedUntil: new Date(base.nowMs + MIN).toISOString() }
    expect(thoughtDue({ ...base, thought })).toBe(false)
    expect(thoughtDue({ ...base, nowMs: base.nowMs + 2 * MIN, thought })).toBe(true)
  })
})

describe('afterThought (spec 11.3: 5 failures in a row pause thought ticks for 15 minutes)', () => {
  const now = at('2026-11-12T11:00:00Z')
  const iso = (ms: number) => new Date(ms).toISOString()

  it('a good thought sets the time, keeps the last 5 lines and clears the failures', () => {
    let state = afterThought(undefined, { ok: false }, now)
    expect(state.failures).toBe(1)
    for (const line of ['a', 'b', 'c', 'd', 'e', 'f']) state = afterThought(state, { ok: true, line }, now)
    expect(state).toMatchObject({ failures: 0, lastAt: iso(now), recent: ['b', 'c', 'd', 'e', 'f'] })
  })

  it('four failures in a row do not pause; the fifth pauses for 15 minutes and starts the count again', () => {
    let state = afterThought(undefined, { ok: false }, now)
    for (let i = 0; i < 3; i++) state = afterThought(state, { ok: false }, now)
    expect(state.failures).toBe(4)
    expect(state.pausedUntil).toBeUndefined()
    state = afterThought(state, { ok: false }, now)
    expect(state.pausedUntil).toBe(iso(now + 15 * MIN))
    expect(state.failures).toBe(0)
  })

  it('a skipped tick (no call was made) moves the clock and counts as neither', () => {
    const state = afterThought({ failures: 2, recent: ['x'] }, { skipped: true }, now)
    expect(state).toMatchObject({ failures: 2, lastAt: iso(now), recent: ['x'] })
  })
})

describe('requestReplan (spec 2.3: at most 4 thought-tick replans a day)', () => {
  const at0 = '2026-11-12T11:00:00Z'

  it('records the request and counts it for the day', () => {
    const state = requestReplan(undefined, { today: '2026-11-12', reason: 'the plan no longer fits', at: at0 })
    expect(state).toMatchObject({ replanRequest: { reason: 'the plan no longer fits', at: at0 }, replans: { date: '2026-11-12', count: 1 } })
  })

  it('refuses the fifth in a day, and starts the count again the next day', () => {
    let state = requestReplan(undefined, { today: '2026-11-12', reason: 'r0', at: at0 })
    for (let i = 1; i < MAX_THOUGHT_REPLANS_PER_DAY; i++) state = requestReplan(state ?? undefined, { today: '2026-11-12', reason: `r${i}`, at: at0 })
    expect(state?.replans?.count).toBe(4)
    expect(requestReplan(state ?? undefined, { today: '2026-11-12', reason: 'one more', at: at0 })).toBeNull()
    expect(requestReplan(state ?? undefined, { today: '2026-11-13', reason: 'a new day', at: at0 })?.replans).toEqual({ date: '2026-11-13', count: 1 })
  })

  it('cuts the reason to 140 characters', () => {
    expect(requestReplan(undefined, { today: '2026-11-12', reason: 'x'.repeat(300), at: at0 })?.replanRequest?.reason).toHaveLength(140)
  })
})
