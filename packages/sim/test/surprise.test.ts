import { describe, expect, it } from 'vitest'
import { Forkling, Goals, MindState, WorldObject, type VisitorEvent } from '@forkling/schema'
import { scoreSurprise, type SurpriseInput } from '../src/surprise.ts'
import { sleepWindow } from '../src/sleep.ts'

const now = Date.parse('2026-11-03T10:00:00Z')

const forkling = Forkling.parse({
  name: 'Merge',
  species: 'cat',
  seed: 5,
  needs: { hunger: 70, energy: 80, curiosity: 60 },
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

  it('does not wake for a new object or a new kind of visitor event any more', () => {
    const fresh = { ...rock, id: 'red-ball', name: 'A red ball' }
    const bell: VisitorEvent = { type: 'bell', payload: {}, visitorId: 'v_abc', createdAt: '2026-11-03T09:59:00Z' }
    expect(kinds({ ...calm, objects: [rock, fresh], events: [bell] })).toEqual([])
  })

  it('wakes for a trip that raised an interest by 15 or more, twice a day at most (spec 2.3)', () => {
    const spark = (count: number, date = '2026-11-03') => MindState.parse({ ...calm.mindState, sparked: { date, count, pending: { topic: 'moss', gain: 24 } } })
    const t = scoreSurprise({ ...calm, mindState: spark(0) })
    expect(t.map((x) => x.kind)).toEqual(['sparked'])
    expect(t[0]!.detail).toBe('a trip raised "moss" by 24')
    expect(kinds({ ...calm, mindState: spark(1) })).toEqual(['sparked'])
    expect(kinds({ ...calm, mindState: spark(2) })).toEqual([])
    expect(kinds({ ...calm, mindState: spark(2, '2026-11-02') })).toEqual(['sparked'])
    expect(kinds({ ...calm, mindState: MindState.parse({ ...calm.mindState, sparked: { date: '2026-11-03', count: 0, pending: null } }) })).toEqual([])
  })

  it('notices the end of a step', () => {
    expect(kinds({ ...calm, nowMs: Date.parse('2026-11-03T10:11:00Z') })).toContain('stepDone')
  })

  it('asks for a morning plan once awake on a day with no plan', () => {
    const t = kinds({ ...calm, goals: { long: planned.long }, mindState: MindState.parse({ knownObjects: ['sunny-rock'], lastPlanDate: '2026-11-02' }) })
    expect(t).toEqual(['newDay'])
  })

  it('does not ask for a morning plan again after the plan is made, even if it was rejected into nothing', () => {
    expect(kinds({ ...calm, goals: {} })).not.toContain('newDay')
  })

  it('uses the forkling local date, not UTC, for a new day', () => {
    // 08:00Z on the 4th is 09:00 in Stockholm: awake, and a new local day.
    expect(kinds({ ...calm, nowMs: Date.parse('2026-11-04T08:00:00Z'), goals: {} })).toEqual(['newDay'])
  })

  it('waits for the morning: still up after midnight is not a new day yet', () => {
    // 23:30Z on the 3rd is 00:30 on the 4th in Stockholm, after a late night.
    expect(kinds({ ...calm, nowMs: Date.parse('2026-11-03T23:30:00Z'), goals: {} })).toEqual([])
  })

  describe('replan', () => {
    const noStep = { ...calm, goals: { long: planned.long } }

    it('asks for a new plan when the day is planned and there is nothing to do', () => {
      const t = scoreSurprise(noStep)
      expect(t.map((x) => x.kind)).toEqual(['replan'])
      expect(t[0]!.detail).toMatch(/no step/)
    })

    it('asks when the last step has run its time, alongside the step ending', () => {
      expect(kinds({ ...calm, nowMs: Date.parse('2026-11-03T10:11:00Z') })).toEqual(['replan', 'stepDone'])
    })

    it('does not ask when another step is waiting', () => {
      const two = Goals.parse({
        ...planned,
        today: { ...planned.today, steps: [...planned.today!.steps, { verb: 'sit', reason: 'Rest.', minutes: 10 }] },
      })
      expect(kinds({ ...calm, goals: two, nowMs: Date.parse('2026-11-03T10:11:00Z') })).toEqual(['stepDone'])
    })

    it('does not ask while a step is running', () => {
      expect(kinds(calm)).toEqual([])
    })

    it('waits until replanAfter, then asks again', () => {
      const later = (iso: string) => MindState.parse({ ...calm.mindState, replanAfter: iso })
      expect(kinds({ ...noStep, mindState: later('2026-11-03T10:30:00Z') })).toEqual([])
      expect(kinds({ ...noStep, mindState: later('2026-11-03T09:59:00Z') })).toEqual(['replan'])
    })

    it('leaves the first plan of a day to newDay', () => {
      expect(kinds({ ...noStep, mindState: MindState.parse({ ...calm.mindState, lastPlanDate: '2026-11-02' }) })).toEqual(['newDay'])
    })

    it('does not ask in the 45 minutes before bed, which are for winding down', () => {
      const bedMs = sleepWindow('2026-11-03', 5, 'Europe/Stockholm').bedMs
      expect(kinds({ ...noStep, nowMs: bedMs - 50 * 60_000 })).toEqual(['replan'])
      expect(kinds({ ...noStep, nowMs: bedMs - 40 * 60_000 })).toEqual([])
    })

    it('is not asked in bed', () => {
      expect(kinds({ ...noStep, asleep: true })).toEqual([])
    })
  })

  it('asks for a weekly review of the long goal', () => {
    const old = Goals.parse({ ...planned, long: { ...planned.long, reviewedAt: '2026-10-26T06:00:00Z' } })
    expect(kinds({ ...calm, goals: old })).toEqual(['weekly'])
  })

  it('ranks the most pressing first', () => {
    const t = scoreSurprise({
      ...calm,
      mindState: MindState.parse({ ...calm.mindState, sparked: { date: '2026-11-03', count: 0, pending: { topic: 'moss', gain: 20 } } }),
      nowMs: Date.parse('2026-11-03T10:11:00Z'),
    })
    expect(t.map((x) => x.kind)).toEqual(expect.arrayContaining(['sparked', 'stepDone']))
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
      expect(kinds({ ...evening, nowMs: bedMs - 60 * 60_000 })).not.toContain('bedtime')
    })

    it('happens once a day', () => {
      expect(kinds({ ...evening, mindState: MindState.parse({ ...calm.mindState, lastReflectDate: '2026-11-03' }) })).toEqual([])
    })

    it('follows a late night: the reflection moves with bedtime', () => {
      const late = { ...evening, forkling: { ...forkling, lateNight: '2026-11-03' } }
      expect(kinds(late)).not.toContain('bedtime')
      const lateBed = sleepWindow('2026-11-03', 5, 'Europe/Stockholm', true).bedMs
      expect(kinds({ ...late, nowMs: lateBed - 10 * 60_000 })).toEqual(['bedtime'])
    })

    it('is not asked in bed', () => {
      expect(kinds({ ...evening, asleep: true })).toEqual([])
    })
  })
})

describe('a replan asked for by a thought tick (spec 2.3)', () => {
  it('fires the replan trigger with the reason, though the plan has not run out', () => {
    const asked = { ...calm, mindState: MindState.parse({ knownObjects: ['sunny-rock'], lastPlanDate: '2026-11-03', thought: { replanRequest: { reason: 'the lamp is not where I thought', at: '2026-11-03T09:58:00Z' } } }) }
    const found = scoreSurprise(asked).find((t) => t.kind === 'replan')
    expect(found?.detail).toContain('the lamp is not where I thought')
    expect(kinds(calm)).not.toContain('replan')
  })
})

describe('a build that finished (spec 2.3: buildResult, each result once)', () => {
  it('fires with what happened, while the mind has not answered it', () => {
    const done = { ...calm, mindState: MindState.parse({ knownObjects: ['sunny-rock'], lastPlanDate: '2026-11-03', jobs: { seen: ['a'], pending: [{ id: 'a', text: 'the workshop finished "A lamp": it passed its check' }] } }) }
    const found = scoreSurprise(done).find((t) => t.kind === 'buildResult')
    expect(found?.detail).toContain('the workshop finished "A lamp"')
    expect(kinds(calm)).not.toContain('buildResult')
  })

  it('fires once for several results, and the detail lists each', () => {
    const two = { ...calm, mindState: MindState.parse({ knownObjects: ['sunny-rock'], lastPlanDate: '2026-11-03', jobs: { seen: ['a', 'b'], pending: [{ id: 'a', text: 'first thing' }, { id: 'b', text: 'second thing' }] } }) }
    const found = scoreSurprise(two).filter((t) => t.kind === 'buildResult')
    expect(found).toHaveLength(1)
    expect(found[0]!.detail).toMatch(/first thing[\s\S]*second thing/)
  })
})
