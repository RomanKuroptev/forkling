import { describe, expect, it } from 'vitest'
import {
  DAILY_POINTS,
  DEEP_COST,
  MAX_POINTS_IN_HAND,
  PRICES,
  SKETCH_PRICE_FLOOR,
  MIN_CALLS_FOR_PRICE,
  livePrices,
  planCost,
  pricesDue,
  pricesFromLedger,
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
    expect(PRICES).toEqual({ fullWork: 240, expand: 50, expandEarned: 20, trip: 3, tend: 2, sketch: 50, foundRequest: 2, revisit: 1, write: 1, reply: 0, rest: 0 })
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
    // A sketch is made by Sonnet and costs about $0.05, so it is priced at 50 points of a day's 150: Merge chooses, there is no daily cap.
    expect(stepCost(step({ verb: 'tinker', size: 'sketch' }))).toBe(50)
    // A tinker that does not say is a full work: the dear reading, so a plan cannot hide its price.
    expect(stepCost(step({ verb: 'tinker' }))).toBe(240)
  })

  it('costs 30 for a deep step, which thinks harder on Sonnet', () => {
    expect(DEEP_COST).toBe(30)
    for (const verb of ['tend', 'write', 'found'] as const) expect(stepCost(step({ verb, deep: true }))).toBe(30)
  })

  it('ignores deep on a verb that cannot be deep', () => {
    expect(stepCost(step({ verb: 'rest', deep: true }))).toBe(0)
    expect(stepCost(step({ verb: 'wander', deep: true }))).toBe(3)
    expect(stepCost(step({ verb: 'reply', deep: true }))).toBe(0)
    expect(stepCost(step({ verb: 'expand', deep: true }))).toBe(50)
    expect(stepCost(step({ verb: 'tinker', size: 'full', deep: true }))).toBe(240)
    // A sketch is always made by Sonnet now, so there is nothing deeper to buy.
    expect(stepCost(step({ verb: 'tinker', size: 'sketch', deep: true }))).toBe(50)
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

describe('pricesFromLedger (the weekly reset from what calls really cost, audit 17 Nov)', () => {
  const NOW = Date.parse('2026-11-22T10:00:00Z')
  const call = (kind: string, usd: number, daysAgo = 1) => ({ at: new Date(NOW - daysAgo * 86_400_000).toISOString(), kind, usd })
  const many = (kind: string, usd: number, n: number, daysAgo = 1) => Array.from({ length: n }, () => call(kind, usd, daysAgo))

  it('sets a price to the average cost of its calls in points of $0.001, rounded up', () => {
    const p = pricesFromLedger([...many('tend', 0.0031, 4), ...many('expand', 0.04, 3)], NOW, PRICES)
    expect(p.tend).toBe(4)
    expect(p.expand).toBe(40)
  })

  it('does not round a whole number of points up because of floating point (0.023 is 23, not 24)', () => {
    expect(pricesFromLedger(many('sketch', 0.023, 4), NOW, PRICES).sketch).toBe(23)
  })

  it('never goes below 1, and a sketch never below 20', () => {
    const p = pricesFromLedger([...many('tend', 0.00001, 5), ...many('sketch', 0.009, 5)], NOW, PRICES)
    expect(p.tend).toBe(1)
    expect(p.sketch).toBe(SKETCH_PRICE_FLOOR)
    expect(SKETCH_PRICE_FLOOR).toBe(20)
  })

  it('keeps the old price of a kind with fewer than 3 calls in the window', () => {
    expect(MIN_CALLS_FOR_PRICE).toBe(3)
    const p = pricesFromLedger(many('tend', 0.1, 2), NOW, { ...PRICES, tend: 7 })
    expect(p.tend).toBe(7)
  })

  it('looks only at the last 7 days', () => {
    const p = pricesFromLedger([...many('tend', 0.01, 5, 9), ...many('tend', 0.003, 3, 2)], NOW, PRICES)
    expect(p.tend).toBe(3)
  })

  it('reads the work that makes a sketch from sketch and rework calls, the write step from art calls, and a full work as its build plus its share of repairs', () => {
    const p = pricesFromLedger([...many('sketch', 0.03, 2), ...many('rework', 0.03, 2), ...many('art', 0.0004, 3), ...many('tinker', 0.1, 4), ...many('repair', 0.05, 4)], NOW, PRICES)
    expect(p.sketch).toBe(30)
    expect(p.write).toBe(1)
    expect(p.fullWork).toBe(150)
  })

  it('prices a trip as up to 6 reads at the average read cost', () => {
    expect(pricesFromLedger(many('read', 0.0007, 5), NOW, PRICES).trip).toBe(5)
  })

  it('leaves replies and rest free, and the rest of the table as it was when there is nothing in the ledger', () => {
    expect(pricesFromLedger([], NOW, PRICES)).toEqual(PRICES)
    const p = pricesFromLedger(many('tend', 0.005, 3), NOW, { ...PRICES, reply: 0, rest: 0 })
    expect(p.reply).toBe(0)
    expect(p.rest).toBe(0)
  })
})

describe('pricesDue and livePrices', () => {
  const SUNDAY = Date.parse('2026-11-22T10:00:00Z')
  it('is due on a Sunday awake, once that Sunday, and never on another day or asleep', () => {
    const base = { timezone: 'Europe/Stockholm', nowMs: SUNDAY, asleep: false, pricesSetOn: undefined as string | undefined, today: '2026-11-22' }
    expect(pricesDue(base)).toBe(true)
    expect(pricesDue({ ...base, pricesSetOn: '2026-11-22' })).toBe(false)
    expect(pricesDue({ ...base, pricesSetOn: '2026-11-15' })).toBe(true)
    expect(pricesDue({ ...base, asleep: true })).toBe(false)
    expect(pricesDue({ ...base, nowMs: SUNDAY + 86_400_000, today: '2026-11-23' })).toBe(false)
  })
  it('gives the starting prices until a reset has set others, and the set ones after, filling anything missing from the start', () => {
    expect(livePrices(undefined)).toEqual(PRICES)
    expect(livePrices({ ...PRICES, sketch: 23 }).sketch).toBe(23)
  })
})

describe('prices in a plan', () => {
  it('uses the prices it is given for the cost of a step and of a plan', () => {
    expect(stepCost(step({ verb: 'tinker', size: 'sketch' }), { ...PRICES, sketch: 23 })).toBe(23)
    expect(planCost([step({ verb: 'tinker', size: 'sketch' }), step({ verb: 'tinker', size: 'sketch' })], { ...PRICES, sketch: 23 })).toBe(46)
  })
})
