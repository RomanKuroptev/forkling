import { describe, expect, it } from 'vitest'
import { applyMoodEvent, inSpiral, INITIAL_MOOD, moodWords, tiredLimits, wakeMood, type MoodEvent } from '../src/mood.ts'

const at = (mood: number, energy: number) => ({ mood, energy })

describe('applyMoodEvent (spec 3.2 table)', () => {
  const table: [MoodEvent, number, number][] = [
    ['souvenirKept', 0.1, 0],
    ['buildAccepted', 0.2, 0.1],
    ['buildFailed', -0.2, -0.1],
    ['noteFound', 0.05, 0],
    ['nothingMadeToday', -0.1, 0],
    ['stepCompleted', 0, -0.05],
  ]

  it.each(table)('%s changes mood by %d and energy by %d', (event, dMood, dEnergy) => {
    const next = applyMoodEvent(at(0, 0), event)
    expect(next.mood).toBeCloseTo(dMood)
    expect(next.energy).toBeCloseTo(dEnergy)
  })

  it('applies an event several times with a count', () => {
    const next = applyMoodEvent(at(0, 0.5), 'stepCompleted', 4)
    expect(next.energy).toBeCloseTo(0.3)
  })

  it('clamps both numbers to -1..1', () => {
    expect(applyMoodEvent(at(0.95, 0.95), 'buildAccepted')).toEqual(at(1, 1))
    expect(applyMoodEvent(at(-0.95, -0.95), 'buildFailed')).toEqual(at(-1, -1))
  })

  it('does not drift from floating point after many events', () => {
    let s = at(0, 0)
    for (let i = 0; i < 10; i++) s = applyMoodEvent(s, 'souvenirKept')
    expect(s.mood).toBe(1)
    let t = at(0, 0.5)
    for (let i = 0; i < 4; i++) t = applyMoodEvent(t, 'stepCompleted')
    expect(t.energy).toBe(0.3)
  })

  it('does not change the state it was given', () => {
    const s = at(0, 0)
    applyMoodEvent(s, 'souvenirKept')
    expect(s).toEqual(at(0, 0))
  })
})

describe('wakeMood', () => {
  it('moves mood 20% toward 0 and sets energy to +0.5', () => {
    expect(wakeMood(at(-0.5, -0.9))).toEqual(at(-0.4, 0.5))
    expect(wakeMood(at(0.5, 0.1))).toEqual(at(0.4, 0.5))
  })

  it('starts a new forkling steady and rested', () => {
    expect(INITIAL_MOOD).toEqual(at(0, 0.5))
  })
})

describe('tiredLimits', () => {
  it('has no limits at or above -0.5', () => {
    expect(tiredLimits(at(0, -0.5))).toEqual({ maxSteps: null, allowBuilds: true })
    expect(tiredLimits(at(0, 0.5))).toEqual({ maxSteps: null, allowBuilds: true })
  })

  it('under -0.5 holds the plan to 4 steps and no expand, found or tinker', () => {
    expect(tiredLimits(at(0, -0.51))).toEqual({ maxSteps: 4, allowBuilds: false })
  })
})

describe('moodWords (shown to the model as words, never as instructions)', () => {
  it('names mood and energy', () => {
    expect(moodWords(at(-0.3, -0.3))).toBe('low, tired')
    expect(moodWords(at(0, 0.5))).toBe('steady, rested')
    expect(moodWords(at(0.7, 0.2))).toBe('very good, steady')
    expect(moodWords(at(-0.8, -0.8))).toBe('very low, exhausted')
  })
})

describe('inSpiral (mood under -0.6 at wake, 3 days in a row)', () => {
  it('needs 3 days, all under -0.6', () => {
    expect(inSpiral([-0.7, -0.8])).toBe(false)
    expect(inSpiral([-0.7, -0.8, -0.65])).toBe(true)
    expect(inSpiral([-0.7, -0.5, -0.65])).toBe(false)
  })

  it('looks only at the latest 3', () => {
    expect(inSpiral([0.2, -0.7, -0.8, -0.65])).toBe(true)
    expect(inSpiral([-0.7, -0.8, -0.65, 0.1])).toBe(false)
  })
})
