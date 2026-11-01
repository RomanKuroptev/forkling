import { describe, expect, it } from 'vitest'
import { SpeciesPack } from '@forkling/schema'
import blobJson from './fixtures/blob.species.json'
import { simReport, type ReportOptions } from '../src/report.ts'

const blob = SpeciesPack.parse(blobJson)
const base: ReportOptions = { pack: blob, seed: 7, days: 1, steps: [{ verb: 'roam', minutes: 25 }, { verb: 'dash', minutes: 25 }] }

/** One simulated day takes a few seconds, so the checks share it. */
const day = simReport(base)

describe('simReport', () => {
  it('accounts for every second of the run, by verb', () => {
    const total = Object.values(day.timePerVerb).reduce((a, b) => a + b, 0)
    expect(total).toBeGreaterThan(86_400 - 5)
    expect(total).toBeLessThan(86_400 + 5)
    expect(Object.keys(day.timePerVerb).length).toBeGreaterThan(1)
  })

  it('is deterministic for a seed, and differs between seeds', () => {
    expect(simReport(base)).toEqual(day)
    expect(simReport({ ...base, seed: 8 })).not.toEqual(day)
  })

  it('splits the day by the sleep schedule', () => {
    expect(day.awakeHours).toBeGreaterThan(13)
    expect(day.awakeHours).toBeLessThan(18)
  })

  it('says how much of the plan window the body spent on the plan verb, and what broke it off', () => {
    expect(day.focus.seconds).toBeGreaterThan(10 * 3600)
    expect(day.focus.onPlanSeconds).toBeLessThanOrEqual(day.focus.seconds)
    expect(day.focus.share).toBeCloseTo(day.focus.onPlanSeconds / day.focus.seconds, 5)
    // The blob's needs fall fast, so something breaks the plan off, and the report says it was a need running low.
    expect(day.focus.interruptions).toBeGreaterThan(0)
    expect(day.focus.interruptionsByCause.critical + day.focus.interruptionsByCause.other).toBe(day.focus.interruptions)
  })

  it('reports each need: its lowest, its average, and how long it was critical awake and asleep', () => {
    expect(Object.keys(day.needs).sort()).toEqual(['energy', 'fun', 'hunger'])
    for (const need of Object.values(day.needs)) {
      expect(need.min).toBeGreaterThanOrEqual(0)
      expect(need.min).toBeLessThanOrEqual(need.mean)
      expect(need.mean).toBeLessThanOrEqual(100)
      expect(need.longestAwakeCriticalMinutes).toBeLessThanOrEqual(need.awakeCriticalMinutes)
    }
    expect(day.needs.hunger!.hoursToEmpty).toBeCloseTo(100 / 240, 5)
  })

  it('says how the night was spent: how much of it asleep, and what else the body did in bed hours', () => {
    expect(day.asleep.seconds).toBeGreaterThan(6 * 3600)
    expect(day.asleep.seconds).toBeLessThan(10 * 3600)
    expect(day.asleep.onSleepSeconds).toBeLessThanOrEqual(day.asleep.seconds)
    const other = Object.values(day.asleep.otherByVerb).reduce((a, b) => a + b, 0)
    expect(other).toBeCloseTo(day.asleep.seconds - day.asleep.onSleepSeconds, 0)
  })

  it('has no plan window with no steps', () => {
    const free = simReport({ ...base, steps: [] })
    expect(free.focus.seconds).toBe(0)
    expect(free.focus.share).toBe(0)
  })
})
