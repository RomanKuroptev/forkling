import { describe, expect, it } from 'vitest'
import { recordWakeMood } from '../src/mood.ts'
import { FAILING_BUILD_SHARE, MAKING_VERBS, MIN_BUILDS, MIN_STEPS_FOR_SHARE, NO_MAKING_DAYS, VERB_SHARE_WARN, weeklyHealthWarnings } from '../src/weekly-health.ts'

const NOW = Date.parse('2026-11-15T19:00:00Z')
const DAY = 86_400_000
const at = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString()
const steps = (rows: [string, number][]) => rows.map(([verb, daysAgo]) => ({ verb, at: at(daysAgo) }))
const base = { steps: [] as { verb: string; at: string }[], nowMs: NOW, wakeMoods: [] as number[], builds: { total: 0, failed: 0 } }

describe('the weekly health check (spec 9.6): warnings for Roman, never a change in Merge', () => {
  it('has the numbers of the spec', () => {
    expect([VERB_SHARE_WARN, NO_MAKING_DAYS, FAILING_BUILD_SHARE]).toEqual([0.5, 3, 0.3])
    expect([...MAKING_VERBS].sort()).toEqual(['expand', 'found', 'tend', 'tinker', 'write'])
    expect(MIN_STEPS_FOR_SHARE).toBeGreaterThan(2)
    expect(MIN_BUILDS).toBeGreaterThan(1)
  })

  it('says nothing about a quiet, varied week', () => {
    const week = steps([['wander', 1], ['tend', 1], ['write', 2], ['wander', 3], ['rest', 3], ['tinker', 4], ['wander', 5], ['tend', 6], ['rest', 6]])
    expect(weeklyHealthWarnings({ ...base, steps: week })).toEqual([])
  })

  describe('one verb for more than half of the week\'s steps', () => {
    it('warns, naming the verb and its share', () => {
      const week = steps([['wander', 1], ['wander', 1], ['wander', 2], ['wander', 2], ['wander', 3], ['wander', 3], ['tend', 4], ['write', 5]])
      const w = weeklyHealthWarnings({ ...base, steps: week })
      expect(w.some((x) => /"wander".*75%.*8 steps/.test(x))).toBe(true)
    })
    it('exactly half is not more than half', () => {
      const week = steps([['wander', 1], ['wander', 1], ['wander', 2], ['wander', 2], ['tend', 3], ['write', 3], ['rest', 4], ['tinker', 4]])
      expect(weeklyHealthWarnings({ ...base, steps: week }).some((x) => /% of the week/.test(x))).toBe(false)
    })
    it('waits for enough steps to mean something', () => {
      expect(weeklyHealthWarnings({ ...base, steps: steps([['wander', 1], ['wander', 1], ['wander', 1]]) }).some((x) => /% of the week/.test(x))).toBe(false)
    })
    it('counts only the last 7 days', () => {
      const week = steps([['wander', 8], ['wander', 9], ['wander', 10], ['wander', 11], ['wander', 12], ['wander', 13], ['wander', 14], ['tend', 1], ['write', 1], ['rest', 2], ['tinker', 2]])
      expect(weeklyHealthWarnings({ ...base, steps: week }).some((x) => /% of the week/.test(x))).toBe(false)
    })
  })

  describe('no tend, expand, found, tinker or write for 3 days', () => {
    it('warns when the last of them is older than 3 days and the world is not new', () => {
      const week = steps([['tend', 5], ['wander', 1], ['wander', 2], ['rest', 3]])
      expect(weeklyHealthWarnings({ ...base, steps: week }).some((x) => /no tend, expand, found, tinker or write/.test(x))).toBe(true)
    })
    it('does not warn when one was started within 3 days', () => {
      const week = steps([['tend', 2], ['wander', 1], ['wander', 5]])
      expect(weeklyHealthWarnings({ ...base, steps: week }).some((x) => /no tend/.test(x))).toBe(false)
    })
    it('does not warn about a world with nothing older than 3 days to judge by', () => {
      expect(weeklyHealthWarnings({ ...base, steps: steps([['wander', 1], ['rest', 2]]) }).some((x) => /no tend/.test(x))).toBe(false)
      expect(weeklyHealthWarnings(base)).toEqual([])
    })
    it('warns when there were steps all week but none of them made a file', () => {
      const week = steps([['wander', 1], ['wander', 4], ['rest', 6]])
      expect(weeklyHealthWarnings({ ...base, steps: week }).some((x) => /no tend/.test(x))).toBe(true)
    })
  })

  describe('the spiral mood warning', () => {
    it('warns when mood at wake was very low on 3 days in a row', () => {
      expect(weeklyHealthWarnings({ ...base, wakeMoods: [-0.7, -0.8, -0.9] }).some((x) => /mood/.test(x))).toBe(true)
    })
    it('not for 2 days, or when one of the 3 was better', () => {
      expect(weeklyHealthWarnings({ ...base, wakeMoods: [-0.7, -0.8] }).some((x) => /mood/.test(x))).toBe(false)
      expect(weeklyHealthWarnings({ ...base, wakeMoods: [-0.7, -0.2, -0.9] }).some((x) => /mood/.test(x))).toBe(false)
    })
  })

  describe('more than 30% of build attempts failing', () => {
    it('warns with the numbers', () => {
      const w = weeklyHealthWarnings({ ...base, builds: { total: 6, failed: 3 } })
      expect(w.some((x) => /3 of 6 builds/.test(x))).toBe(true)
    })
    it('exactly 30% is not more, and a handful of builds is too few to say', () => {
      expect(weeklyHealthWarnings({ ...base, builds: { total: 10, failed: 3 } }).some((x) => /builds/.test(x))).toBe(false)
      expect(weeklyHealthWarnings({ ...base, builds: { total: 1, failed: 1 } }).some((x) => /builds/.test(x))).toBe(false)
    })
  })
})

describe('recordWakeMood (the spiral needs the mood at wake, 3 mornings)', () => {
  it('keeps the last 3 mornings, one a day, oldest first', () => {
    let moods = recordWakeMood([], '2026-11-12', -0.7)
    moods = recordWakeMood(moods, '2026-11-13', -0.8)
    moods = recordWakeMood(moods, '2026-11-14', -0.9)
    moods = recordWakeMood(moods, '2026-11-15', -0.1)
    expect(moods).toEqual([{ date: '2026-11-13', mood: -0.8 }, { date: '2026-11-14', mood: -0.9 }, { date: '2026-11-15', mood: -0.1 }])
  })
  it('the same morning twice changes nothing but the number', () => {
    const moods = recordWakeMood(recordWakeMood([], '2026-11-12', -0.7), '2026-11-12', -0.5)
    expect(moods).toEqual([{ date: '2026-11-12', mood: -0.5 }])
  })
})
