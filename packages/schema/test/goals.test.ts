import { describe, expect, it } from 'vitest'
import { BudgetLedger, Forkling, Goals, Intention, MindState, PlanStep } from '../src/index.ts'

const step = { verb: 'perch', targetId: 'sunny-rock', reason: 'I want the best view of the beach.', minutes: 30 }

describe('PlanStep', () => {
  it('parses a verb with a target and a reason', () => {
    expect(PlanStep.parse(step)).toEqual(step)
  })

  it('accepts a position target instead of an object id', () => {
    expect(PlanStep.safeParse({ verb: 'explore', position: [4, -10], reason: 'Unseen ground.', minutes: 20 }).success).toBe(true)
  })

  it('rejects a step with both a targetId and a position', () => {
    expect(PlanStep.safeParse({ ...step, position: [1, 2] }).success).toBe(false)
  })

  it('needs a reason and a sane duration', () => {
    expect(PlanStep.safeParse({ ...step, reason: '' }).success).toBe(false)
    expect(PlanStep.safeParse({ ...step, minutes: 0 }).success).toBe(false)
    expect(PlanStep.safeParse({ ...step, minutes: 241 }).success).toBe(false)
  })
})

describe('Goals', () => {
  it('parses an empty file, so a new world needs no goals', () => {
    expect(Goals.parse({})).toEqual({})
  })

  it('parses all three time scales', () => {
    const goals = {
      long: { text: 'Own the sunny rock.', reason: 'It is the warmest spot.', setAt: '2026-11-01T07:10:00Z', reviewedAt: '2026-11-01T07:10:00Z' },
      today: { date: '2026-11-01', steps: [step], reason: 'Start with the view.' },
      now: { index: 0, startedAt: '2026-11-01T07:10:00Z', until: '2026-11-01T07:40:00Z' },
    }
    expect(Goals.parse(goals)).toEqual(goals)
  })

  it('limits the plan to a reasonable number of steps', () => {
    const steps = Array.from({ length: 13 }, () => step)
    expect(Goals.safeParse({ today: { date: '2026-11-01', steps, reason: 'Busy day.' } }).success).toBe(false)
  })
})

describe('Intention (M4 additions)', () => {
  const base = { type: 'perch', startedAt: '2026-11-01T07:10:00Z', seed: 1, reason: 'Best view.' }

  it('stays valid without the new fields', () => {
    expect(Intention.safeParse(base).success).toBe(true)
  })

  it('accepts a goal reference', () => {
    expect(Intention.parse({ ...base, goalRef: 'today:2' }).goalRef).toBe('today:2')
    expect(Intention.parse({ ...base, goalRef: 'long' }).goalRef).toBe('long')
  })

  it('rejects a malformed goal reference', () => {
    expect(Intention.safeParse({ ...base, goalRef: 'tomorrow' }).success).toBe(false)
  })
})

describe('Forkling (M4 additions)', () => {
  const forkling = {
    name: 'Merge',
    species: 'cat',
    needs: { hunger: 70 },
    position: [0, 0, 22],
    mood: 'curious',
    intention: { type: 'lounge', startedAt: '2026-10-30T12:00:00Z', seed: 7, reason: 'Warm.' },
    lastTickAt: '2026-10-30T12:00:00Z',
  }

  it('defaults asleep to false', () => {
    expect(Forkling.parse(forkling).asleep).toBe(false)
  })

  it('accepts a late night as a local date', () => {
    expect(Forkling.parse({ ...forkling, lateNight: '2026-11-01' }).lateNight).toBe('2026-11-01')
    expect(Forkling.safeParse({ ...forkling, lateNight: 'tonight' }).success).toBe(false)
  })
})

describe('MindState', () => {
  it('parses an empty file with defaults', () => {
    const state = MindState.parse({})
    expect(state.knownObjects).toEqual([])
    expect(state.seenEventTypes).toEqual([])
    expect(state.recent).toEqual([])
    expect(state.rejections).toEqual([])
    expect(state.lastThinkAt).toBeUndefined()
  })

  it('remembers when it last thought and why it stayed up late', () => {
    const state = MindState.parse({ lastThinkAt: '2026-11-01T07:10:00Z', lateNightReason: 'The moon is on the water.' })
    expect(state.lateNightReason).toBe('The moon is on the water.')
  })

  it('keeps the recent steps and rejections as short lists', () => {
    const recent = Array.from({ length: 21 }, () => ({ verb: 'explore', at: '2026-11-01T07:10:00Z' }))
    expect(MindState.safeParse({ recent }).success).toBe(false)
  })
})

describe('BudgetLedger', () => {
  const call = {
    at: '2026-11-01T07:10:00Z',
    kind: 'morning',
    model: 'claude-haiku-5-5',
    input: 4000,
    cacheRead: 0,
    cacheWrite: 3000,
    output: 300,
    usd: 0.012,
  }

  it('starts empty with the $10 cap', () => {
    const ledger = BudgetLedger.parse({ month: '2026-11' })
    expect(ledger.capUsd).toBe(10)
    expect(ledger.spentUsd).toBe(0)
    expect(ledger.calls).toEqual([])
  })

  it('parses recorded calls', () => {
    expect(BudgetLedger.parse({ month: '2026-11', spentUsd: 0.012, calls: [call] }).calls).toHaveLength(1)
  })

  it('refuses a cap above $10 and a malformed month', () => {
    expect(BudgetLedger.safeParse({ month: '2026-11', capUsd: 11 }).success).toBe(false)
    expect(BudgetLedger.safeParse({ month: 'November' }).success).toBe(false)
  })
})

describe('Forkling seed', () => {
  const forkling = {
    name: 'Merge',
    species: 'cat',
    needs: { hunger: 70 },
    position: [0, 0, 22],
    mood: 'curious',
    intention: { type: 'lounge', startedAt: '2026-10-30T12:00:00Z', seed: 7, reason: 'Warm.' },
    lastTickAt: '2026-10-30T12:00:00Z',
  }

  it('defaults to 0 and must be a non-negative integer', () => {
    expect(Forkling.parse(forkling).seed).toBe(0)
    expect(Forkling.parse({ ...forkling, seed: 20260101 }).seed).toBe(20260101)
    expect(Forkling.safeParse({ ...forkling, seed: -1 }).success).toBe(false)
    expect(Forkling.safeParse({ ...forkling, seed: 1.5 }).success).toBe(false)
  })
})
