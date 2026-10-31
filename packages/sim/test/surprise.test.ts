import { describe, expect, it } from 'vitest'
import { Forkling, Goals, MindState, WorldObject, type VisitorEvent } from '@forkling/schema'
import { scoreSurprise, type SurpriseInput } from '../src/surprise.ts'
import { sleepWindow } from '../src/sleep.ts'

const now = Date.parse('2026-11-03T10:00:00Z')

const forkling = Forkling.parse({
  name: 'Merge',
  species: 'cat',
  seed: 5,
  needs: { hunger: 70, energy: 80, curiosity: 60, affection: 30 },
  position: [0, 0, 0],
  mood: 'content',
  intention: { type: 'lounge', startedAt: '2026-11-03T09:50:00Z', seed: 1, reason: 'Resting.' },
  lastTickAt: '2026-11-03T09:50:00Z',
  timezone: 'Europe/Stockholm',
})

const rock = WorldObject.parse({
  id: 'sunny-rock',
  kind: 'rock',
  name: 'The sunny rock',
  position: [5, 0, 22],
  model: { asset: 'nature/rock_largeA' },
  affordances: ['perch'],
  reason: 'Warm.',
})

const planned = Goals.parse({
  long: { text: 'Own the sunny rock.', reason: 'It is warm.', setAt: '2026-11-02T06:00:00Z', reviewedAt: '2026-11-02T06:00:00Z' },
  today: { date: '2026-11-03', steps: [{ verb: 'perch', targetId: 'sunny-rock', reason: 'The view.', minutes: 30 }], reason: 'Start high.' },
  now: { index: 0, startedAt: '2026-11-03T09:40:00Z', until: '2026-11-03T10:10:00Z' },
})

/** A calm mid-morning: plan made, nothing new, step still running. */
const calm: SurpriseInput = {
  forkling,
  goals: planned,
  mindState: MindState.parse({ knownObjects: ['sunny-rock'], lastPlanDate: '2026-11-03' }),
  objects: [rock],
  events: [],
  nowMs: now,
  asleep: false,
  spotKinds: new Set(['sunny-rock', 'perch', 'food']),
}

const kinds = (input: SurpriseInput) => scoreSurprise(input).map((t) => t.kind)

describe('scoreSurprise', () => {
  it('finds nothing in a routine tick, so no LLM call', () => {
    expect(scoreSurprise(calm)).toEqual([])
  })

  it('never wakes the mind while asleep', () => {
    expect(kinds({ ...calm, asleep: true, goals: {}, objects: [rock, { ...rock, id: 'new' }] })).toEqual([])
  })

  it('notices an object it has not met', () => {
    const fresh = { ...rock, id: 'red-ball', name: 'A red ball' }
    const t = scoreSurprise({ ...calm, objects: [rock, fresh] })
    expect(t.map((x) => x.kind)).toEqual(['novelty'])
    expect(t[0]!.detail).toContain('red-ball')
  })

  it('notices a type of visitor event it has not met, but not a repeat', () => {
    const bell: VisitorEvent = { type: 'bell', payload: {}, visitorId: 'v_abc', createdAt: '2026-11-03T09:59:00Z' }
    expect(kinds({ ...calm, events: [bell] })).toEqual(['novelty'])
    expect(kinds({ ...calm, events: [bell], mindState: MindState.parse({ ...calm.mindState, seenEventTypes: ['bell'] }) })).toEqual([])
  })

  it('notices a step whose target is gone', () => {
    expect(kinds({ ...calm, spotKinds: new Set(['perch']) })).toEqual(['blocked'])
  })

  it('does not call a visitor target or a position blocked', () => {
    const visitorStep = Goals.parse({ ...planned, today: { ...planned.today, steps: [{ verb: 'approach_visitor', targetId: 'visitor', reason: 'Hello.', minutes: 10 }] } })
    expect(kinds({ ...calm, goals: visitorStep, spotKinds: new Set() })).toEqual([])
    const placeStep = Goals.parse({ ...planned, today: { ...planned.today, steps: [{ verb: 'explore', position: [3, 4], reason: 'Over there.', minutes: 10 }] } })
    expect(kinds({ ...calm, goals: placeStep, spotKinds: new Set() })).toEqual([])
  })

  it('notices a strong need, naming it', () => {
    const t = scoreSurprise({ ...calm, forkling: { ...forkling, needs: { ...forkling.needs, hunger: 8 } } })
    expect(t.map((x) => x.kind)).toEqual(['need'])
    expect(t[0]!.detail).toContain('hunger')
  })

  it('notices the end of a step', () => {
    expect(kinds({ ...calm, nowMs: Date.parse('2026-11-03T10:11:00Z') })).toEqual(['stepDone'])
  })

  it('asks for a morning plan once awake on a day with no plan', () => {
    const t = kinds({ ...calm, goals: { long: planned.long }, mindState: MindState.parse({ knownObjects: ['sunny-rock'], lastPlanDate: '2026-11-02' }) })
    expect(t).toEqual(['newDay'])
  })

  it('does not ask again after the plan is made, even if the plan was rejected into nothing', () => {
    expect(kinds({ ...calm, goals: {} })).toEqual([])
  })

  it('uses the forkling local date, not UTC, for a new day', () => {
    // 08:00Z on the 4th is 09:00 in Stockholm: awake, and a new local day.
    expect(kinds({ ...calm, nowMs: Date.parse('2026-11-04T08:00:00Z'), goals: {} })).toEqual(['newDay'])
  })

  it('waits for the morning: still up after midnight is not a new day yet', () => {
    // 23:30Z on the 3rd is 00:30 on the 4th in Stockholm, after a late night.
    expect(kinds({ ...calm, nowMs: Date.parse('2026-11-03T23:30:00Z'), goals: {} })).toEqual([])
  })

  it('asks for a weekly review of the long goal', () => {
    const old = Goals.parse({ ...planned, long: { ...planned.long, reviewedAt: '2026-10-26T06:00:00Z' } })
    expect(kinds({ ...calm, goals: old })).toEqual(['weekly'])
  })

  it('ranks the most pressing first', () => {
    const t = scoreSurprise({
      ...calm,
      forkling: { ...forkling, needs: { ...forkling.needs, hunger: 2 } },
      spotKinds: new Set(),
      nowMs: Date.parse('2026-11-03T10:11:00Z'),
    })
    expect(t.map((x) => x.kind)).toEqual(expect.arrayContaining(['blocked', 'need', 'stepDone']))
    const scores = t.map((x) => x.score)
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
  })
  describe('bedtime', () => {
    const bedMs = sleepWindow('2026-11-03', 5, 'Europe/Stockholm').bedMs
    const evening = { ...calm, goals: {}, nowMs: bedMs - 20 * 60_000 }

    it('asks for the day to be reflected on in the half hour before bed', () => {
      const t = scoreSurprise(evening)
      expect(t.map((x) => x.kind)).toEqual(['bedtime'])
      expect(t[0]!.detail).toContain('2026-11-03')
    })

    it('waits until that half hour', () => {
      expect(kinds({ ...evening, nowMs: bedMs - 60 * 60_000 })).toEqual([])
    })

    it('happens once a day', () => {
      expect(kinds({ ...evening, mindState: MindState.parse({ ...calm.mindState, lastReflectDate: '2026-11-03' }) })).toEqual([])
    })

    it('follows a late night: the reflection moves with bedtime', () => {
      const late = { ...evening, forkling: { ...forkling, lateNight: '2026-11-03' } }
      expect(kinds(late)).toEqual([])
      const lateBed = sleepWindow('2026-11-03', 5, 'Europe/Stockholm', true).bedMs
      expect(kinds({ ...late, nowMs: lateBed - 10 * 60_000 })).toEqual(['bedtime'])
    })

    it('is not asked in bed', () => {
      expect(kinds({ ...evening, asleep: true })).toEqual([])
    })
  })
})
