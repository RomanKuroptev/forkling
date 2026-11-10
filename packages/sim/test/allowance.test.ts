import { describe, expect, it } from 'vitest'
import {
  DAILY_POINTS,
  DEEP_COST,
  MAX_POINTS_IN_HAND,
  PRICES,
  planCost,
  pointsAtWake,
  stepCost,
  type PricedStep,
} from '../src/allowance.ts'

const step = (over: Partial<PricedStep> = {}): PricedStep => ({ verb: 'rest', ...over })

describe('the daily allowance (spec 9.8)', () => {
  it('gives 150 points at each wake, saves what is left, and holds at most 450', () => {
    expect(DAILY_POINTS).toBe(150)
    expect(MAX_POINTS_IN_HAND).toBe(450)
    expect(pointsAtWake(0)).toBe(150)
    expect(pointsAtWake(40)).toBe(190)
    expect(pointsAtWake(400)).toBe(450)
    expect(pointsAtWake(450)).toBe(450)
  })

  it('takes a day of saving to afford a full work', () => {
    // A full work is 240: two days of the allowance, so a day of only trips and tending costs almost nothing.
    expect(pointsAtWake(pointsAtWake(0))).toBe(300)
    expect(pointsAtWake(pointsAtWake(0))).toBeGreaterThanOrEqual(PRICES.fullWork)
  })

  it('starts with the prices in the spec', () => {
    expect(PRICES).toEqual({ fullWork: 240, expand: 50, trip: 3, tend: 2, sketch: 2, foundRequest: 2, revisit: 1, write: 1, reply: 0, rest: 0 })
  })
})

describe('stepCost', () => {
  it('prices each verb', () => {
    expect(stepCost(step({ verb: 'wander' }))).toBe(3)
    expect(stepCost(step({ verb: 'tend' }))).toBe(2)
    expect(stepCost(step({ verb: 'revisit' }))).toBe(1)
    expect(stepCost(step({ verb: 'expand' }))).toBe(50)
    expect(stepCost(step({ verb: 'found' }))).toBe(2)
    expect(stepCost(step({ verb: 'write' }))).toBe(1)
    expect(stepCost(step({ verb: 'reply' }))).toBe(0)
    expect(stepCost(step({ verb: 'rest' }))).toBe(0)
  })

  it('prices a tinker as a full work or a sketch', () => {
    expect(stepCost(step({ verb: 'tinker', size: 'full' }))).toBe(240)
    expect(stepCost(step({ verb: 'tinker', size: 'sketch' }))).toBe(2)
    // A tinker that does not say is a full work: the dear reading, so a plan cannot hide its price.
    expect(stepCost(step({ verb: 'tinker' }))).toBe(240)
  })

  it('costs 30 for a deep step, which thinks harder on Sonnet', () => {
    expect(DEEP_COST).toBe(30)
    for (const verb of ['tend', 'write', 'found'] as const) expect(stepCost(step({ verb, deep: true }))).toBe(30)
    expect(stepCost(step({ verb: 'tinker', size: 'sketch', deep: true }))).toBe(30)
  })

  it('ignores deep on a verb that cannot be deep', () => {
    expect(stepCost(step({ verb: 'rest', deep: true }))).toBe(0)
    expect(stepCost(step({ verb: 'wander', deep: true }))).toBe(3)
    expect(stepCost(step({ verb: 'reply', deep: true }))).toBe(0)
    expect(stepCost(step({ verb: 'expand', deep: true }))).toBe(50)
    expect(stepCost(step({ verb: 'tinker', size: 'full', deep: true }))).toBe(240)
  })

  it('takes prices set from the ledger instead of the starting ones', () => {
    expect(stepCost(step({ verb: 'tend' }), { ...PRICES, tend: 5 })).toBe(5)
    expect(stepCost(step({ verb: 'tend', deep: true }), { ...PRICES, tend: 5 })).toBe(30)
  })
})

describe('planCost', () => {
  it('adds the steps up', () => {
    expect(planCost([step({ verb: 'wander' }), step({ verb: 'tend' }), step({ verb: 'write' }), step()])).toBe(6)
    expect(planCost([])).toBe(0)
  })
})
