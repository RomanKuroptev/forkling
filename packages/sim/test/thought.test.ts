import { describe, expect, it } from 'vitest'
import { afterThought, isRepeatedThought, MAX_THOUGHT_REPLANS_PER_DAY, requestReplan, thoughtDue, thoughtFingerprint, thoughtIntervalMs } from '../src/thought.ts'
import { repetitionShare } from '../src/behaviour-measures.ts'

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

describe('thoughtFingerprint (the step and the notes a thought was last made for)', () => {
  const base = { step: { verb: 'wander', target: 'tide pools', until: '12:15' }, noteIds: ['n1'] }
  it('is the same for the same step and notes, and different when either changes', () => {
    expect(thoughtFingerprint(base)).toBe(thoughtFingerprint({ ...base }))
    expect(thoughtFingerprint({ ...base, step: { ...base.step, target: 'moss' } })).not.toBe(thoughtFingerprint(base))
    expect(thoughtFingerprint({ ...base, step: { ...base.step, until: '12:45' } })).not.toBe(thoughtFingerprint(base))
    expect(thoughtFingerprint({ ...base, noteIds: [] })).not.toBe(thoughtFingerprint(base))
    expect(thoughtFingerprint({ ...base, step: null })).not.toBe(thoughtFingerprint(base))
  })
  it('does not depend on the order of the notes', () => {
    expect(thoughtFingerprint({ ...base, noteIds: ['a', 'b'] })).toBe(thoughtFingerprint({ ...base, noteIds: ['b', 'a'] }))
  })
})

describe('isRepeatedThought (over 0.6 similar to one of the last 5)', () => {
  const recent = ['Three lights, one hill. The sketch is done and the lamp still waits.', 'The tide pools keep pulling me back to the same quiet corner.']
  it('drops a line that nearly repeats a recent one', () => {
    expect(isRepeatedThought('Three lights, one hill. The sketch is done and the lamp still waits!', recent)).toBe(true)
  })
  it('keeps a line about something else, and any line when there are no recent ones', () => {
    expect(isRepeatedThought('A door that opens only when I stop walking: I should try that next.', recent)).toBe(false)
    expect(isRepeatedThought('Anything at all goes here.', [])).toBe(false)
  })

  // Real lines from Merge's stream before v0.16 (issue #325): the engine then kept every line, and 58% of a week's thoughts
  // repeated one of the 5 before. Passed through the drop the way the thought tick does, no kept line is a repeat by the
  // harness's own measure (the same 5 lines, the same 0.6).
  const keptBy = (lines: readonly string[]): string[] => {
    let state: ReturnType<typeof afterThought> | undefined
    const kept: string[] = []
    for (const line of lines) {
      if (isRepeatedThought(line, state?.recent ?? [])) continue
      kept.push(line)
      state = afterThought(state, { ok: true, line }, 0)
    }
    return kept
  }
  const lidar = "Still drifting. The lidar reading lingers, but I'll let it go and head for bed."
  const realRun = [
    'Shelving the sand sketch at Home; the lidar notes can wait until the step ends.',
    'Shelving the sand sketch at Home now; lidar notes after this step ends.',
    'Shelving the sand sketch at Home now; lidar notes after this step ends.',
    'Shelving the sand sketch at Home; lidar notes come after this step ends.',
    'Shelving the sand sketch at Home now; lidar notes after this step ends.',
    ...Array.from({ length: 19 }, () => lidar),
    "Still drifting. The lidar reading lingers, but I'll let it go and tidy the workshop before bed.",
    "Still drifting. The lidar reading lingers, but I'll tidy the workshop and head for bed.",
    'Still drifting. Tidying the workshop is a small thing to finish before bed.',
    'Writing up leaf area index now; I want to see if the canopy lidar notes actually hold up.',
    'Writing up leaf area index now; checking whether the canopy lidar notes hold up before the step ends at 15:48.',
    'Writing up leaf area index; checking whether the canopy lidar notes hold up before 15:48.',
    'Writing up leaf area index now; the canopy lidar notes need checking before 15:48.',
  ]
  it('keeps the lidar line once out of its 19 copies (#325)', () => {
    expect(repetitionShare(realRun).share).toBeGreaterThan(0.5)
    expect(keptBy(realRun).filter((l) => l === lidar)).toHaveLength(1)
  })
  it('leaves no line the repetition score would count (#325)', () => {
    expect(repetitionShare(keptBy(realRun)).repeated).toBe(0)
  })
})
