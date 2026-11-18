import { describe, expect, it } from 'vitest'
import {
  DAILY_POINTS,
  DEEP_COST,
  MAX_POINTS_IN_HAND,
  PRICES,
  DAILY_POINTS_FLOOR,
  MIN_CALLS_FOR_PRICE,
  OVERHEAD_DAYS_NEEDED,
  dailyPointsFor,
  livePrices,
  moveToward,
  recordOverheadDays,
  planCost,
  pricesDue,
  pricesFromLedger,
  pointsAtWake,
  stepCost,
  type PricedStep,
} from '../src/allowance.ts'

const step = (over: Partial<PricedStep> = {}): PricedStep => ({ verb: 'rest', ...over })

describe('the daily allowance (spec v4 5.2)', () => {
  it('gives 300 points at each wake, saves what is left, and holds at most 1500', () => {
    expect(DAILY_POINTS).toBe(300)
    expect(MAX_POINTS_IN_HAND).toBe(1500)
    expect(pointsAtWake(0)).toBe(300)
    expect(pointsAtWake(40)).toBe(340)
    expect(pointsAtWake(1400)).toBe(1500)
    expect(pointsAtWake(1500)).toBe(1500)
  })

  it('takes a figure the Sunday formula set instead of 300', () => {
    expect(pointsAtWake(10, 370)).toBe(380)
    expect(pointsAtWake(1400, 370)).toBe(1500)
  })

  it('affords a full work on the first morning', () => {
    expect(pointsAtWake(0)).toBeGreaterThanOrEqual(PRICES.fullWork)
  })

  it('starts with the prices of spec v4 5.1', () => {
    expect(PRICES).toEqual({ fullWork: 150, expand: 50, expandEarned: 20, trip: 3, tend: 2, sketch: 30, found: 80, revisit: 1, caption: 1, page: 10, reply: 0, rest: 0 })
  })
})

describe('stepCost', () => {
  it('prices each verb', () => {
    expect(stepCost(step({ verb: 'wander' }))).toBe(3)
    expect(stepCost(step({ verb: 'tend' }))).toBe(2)
    expect(stepCost(step({ verb: 'revisit' }))).toBe(1)
    expect(stepCost(step({ verb: 'expand' }))).toBe(50)
    expect(stepCost(step({ verb: 'found' }))).toBe(80)
    expect(stepCost(step({ verb: 'write' }))).toBe(10)
    expect(stepCost(step({ verb: 'write', caption: true }))).toBe(1)
    expect(stepCost(step({ verb: 'reply' }))).toBe(0)
    expect(stepCost(step({ verb: 'rest' }))).toBe(0)
  })

  it('prices a tinker as a full work or a sketch', () => {
    expect(stepCost(step({ verb: 'tinker', size: 'full' }))).toBe(150)
    // A sketch is priced at 30 points (spec v4 5.1: visible things are priced under their cost): Merge chooses how many, there is no daily cap.
    expect(stepCost(step({ verb: 'tinker', size: 'sketch' }))).toBe(30)
    // A tinker that does not say is a full work: the dear reading, so a plan cannot hide its price.
    expect(stepCost(step({ verb: 'tinker' }))).toBe(150)
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
    expect(stepCost(step({ verb: 'tinker', size: 'full', deep: true }))).toBe(150)
    // A sketch is always made by Sonnet now, so there is nothing deeper to buy.
    expect(stepCost(step({ verb: 'tinker', size: 'sketch', deep: true }))).toBe(30)
  })

  it('takes prices set from the ledger instead of the starting ones', () => {
    expect(stepCost(step({ verb: 'tend' }), { ...PRICES, tend: 5 })).toBe(5)
    expect(stepCost(step({ verb: 'tend', deep: true }), { ...PRICES, tend: 5 })).toBe(30)
  })
})

describe('planCost', () => {
  it('adds the steps up', () => {
    expect(planCost([step({ verb: 'wander' }), step({ verb: 'tend' }), step({ verb: 'write' }), step({ verb: 'write', caption: true }), step()])).toBe(16)
    expect(planCost([])).toBe(0)
  })
})

describe('pricesFromLedger (the Sunday reset, spec v4 5.2)', () => {
  const NOW = Date.parse('2026-11-22T10:00:00Z')
  const call = (kind: string, usd: number, daysAgo = 1) => ({ at: new Date(NOW - daysAgo * 86_400_000).toISOString(), kind, usd })
  const many = (kind: string, usd: number, n: number, daysAgo = 1) => Array.from({ length: n }, () => call(kind, usd, daysAgo))

  it('sets a price toward the average cost of its calls in points of $0.001, rounded up', () => {
    const p = pricesFromLedger([...many('tend', 0.0031, 5), ...many('expand', 0.04, 5)], NOW, PRICES)
    expect(p.tend).toBe(3) // 4 points wanted, but a price moves at most 25% a week: 2 x 1.25 rounds to 3
    expect(p.expand).toBe(40)
  })

  it('moves a price by at most 25% a week, up or down, and never under 1', () => {
    expect(moveToward(40, 100)).toBe(50)
    expect(moveToward(40, 1)).toBe(30)
    expect(moveToward(40, 42)).toBe(42)
    expect(moveToward(2, 1)).toBe(2)
    expect(moveToward(1, 0)).toBe(1)
    const up = pricesFromLedger(many('expand', 0.2, 5), NOW, PRICES)
    expect(up.expand).toBe(63) // 50 x 1.25 rounded, not the 200 the calls cost
    const down = pricesFromLedger(many('expand', 0.001, 5), NOW, PRICES)
    expect(down.expand).toBe(38) // 50 x 0.75 rounded
  })

  it('keeps the old price of a kind with fewer than 5 calls in the window', () => {
    expect(MIN_CALLS_FOR_PRICE).toBe(5)
    const p = pricesFromLedger(many('tend', 0.1, 4), NOW, { ...PRICES, tend: 7 })
    expect(p.tend).toBe(7)
  })

  it('looks only at the last 14 days', () => {
    const p = pricesFromLedger([...many('expand', 0.01, 5, 16), ...many('expand', 0.05, 5, 2)], NOW, PRICES)
    expect(p.expand).toBe(50)
  })

  it('prices a sketch at 0.6 of its cost, and a full work at 0.6 of its build plus its share of repairs', () => {
    const p = pricesFromLedger([...many('sketch', 0.05, 3), ...many('rework', 0.05, 2), ...many('tinker', 0.2, 5), ...many('repair', 0.1, 5)], NOW, PRICES)
    expect(p.sketch).toBe(30) // 0.6 x 50 = 30, within 25% of 30
    expect(p.fullWork).toBe(180) // 0.6 x (200 + 100) wanted; 150 x 1.25 = 188 allowed
  })

  it('prices a trip as up to 6 reads at the average read cost, and a found as the found call plus the kit build call', () => {
    expect(pricesFromLedger(many('read', 0.0007, 5), NOW, { ...PRICES, trip: 5 }).trip).toBe(5)
    const p = pricesFromLedger([...many('found', 0.01, 5), ...many('foundbuild', 0.07, 5)], NOW, PRICES)
    expect(p.found).toBe(80)
    expect(pricesFromLedger(many('found', 0.01, 5), NOW, PRICES).found).toBe(80)
  })

  it('leaves captions, pages, an earned expand, replies and rest fixed, whatever the ledger says', () => {
    const p = pricesFromLedger([...many('art', 0.05, 8), ...many('tend', 0.005, 5)], NOW, PRICES)
    expect(p.caption).toBe(1)
    expect(p.page).toBe(10)
    expect(p.expandEarned).toBe(20)
    expect(p.reply).toBe(0)
    expect(p.rest).toBe(0)
    expect(pricesFromLedger([], NOW, PRICES)).toEqual(PRICES)
  })
})

describe('the daily points formula (spec v4 5.2)', () => {
  const days = (usd: number, n = 7) => Array.from({ length: n }, (_, i) => ({ date: `2026-11-${10 + i}`, usd }))

  it('stays at 300 until 7 full days of overhead are on record', () => {
    expect(OVERHEAD_DAYS_NEEDED).toBe(7)
    expect(dailyPointsFor({ capUsd: 12.6, daysInMonth: 30, overheadDays: days(0.085, 6) })).toBe(300)
  })

  it('gives 300 at the stored cap of 12.6 and 370 at a cap of 15, with an overhead of $0.085 a day', () => {
    expect(dailyPointsFor({ capUsd: 12.6, daysInMonth: 30, overheadDays: days(0.085) })).toBe(300)
    expect(dailyPointsFor({ capUsd: 15, daysInMonth: 30, overheadDays: days(0.085) })).toBe(370)
  })

  it('is lower for a heavy ledger and higher for a quiet one, rounded to 10', () => {
    const quiet = dailyPointsFor({ capUsd: 12.6, daysInMonth: 30, overheadDays: days(0.02) })
    const normal = dailyPointsFor({ capUsd: 12.6, daysInMonth: 30, overheadDays: days(0.15) })
    const heavy = dailyPointsFor({ capUsd: 12.6, daysInMonth: 30, overheadDays: days(0.35) })
    expect(quiet).toBe(360)
    expect(normal).toBe(240)
    expect(heavy).toBe(100)
    for (const v of [quiet, normal, heavy]) expect(v % 10).toBe(0)
  })

  it('never goes under 100, and uses only the last 7 days', () => {
    expect(DAILY_POINTS_FLOOR).toBe(100)
    expect(dailyPointsFor({ capUsd: 3, daysInMonth: 30, overheadDays: days(0.2) })).toBe(100)
    const older = [{ date: '2026-11-01', usd: 5 }, ...days(0.085)]
    expect(dailyPointsFor({ capUsd: 12.6, daysInMonth: 30, overheadDays: older })).toBe(300)
  })
})

describe('recordOverheadDays (each past day is read from the ledger the day after)', () => {
  const dateOf = (iso: string) => iso.slice(0, 10)
  const c = (at: string, kind: string, usd: number) => ({ at, kind, usd })
  it('sums only the overhead kinds of each date before today, once', () => {
    const calls = [c('2026-11-16T10:00:00Z', 'thought', 0.01), c('2026-11-16T11:00:00Z', 'decide', 0.02), c('2026-11-16T12:00:00Z', 'sketch', 0.5), c('2026-11-17T10:00:00Z', 'thought', 0.04)]
    const first = recordOverheadDays([], calls, '2026-11-17', dateOf)
    expect(first).toEqual([{ date: '2026-11-16', usd: 0.03 }])
    expect(recordOverheadDays(first, calls, '2026-11-17', dateOf)).toEqual(first)
    expect(recordOverheadDays(first, calls, '2026-11-18', dateOf).map((d) => d.date)).toEqual(['2026-11-16', '2026-11-17'])
  })
  it('keeps the last 14 days', () => {
    const known = Array.from({ length: 14 }, (_, i) => ({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, usd: 0.1 }))
    const out = recordOverheadDays(known, [c('2026-11-15T10:00:00Z', 'thought', 0.1)], '2026-11-16', dateOf)
    expect(out).toHaveLength(14)
    expect(out[0]!.date).toBe('2026-11-02')
  })
})

describe('pricesDue and livePrices', () => {
  const SUNDAY = Date.parse('2026-11-22T19:30:00Z') // 20:30 in Stockholm: after the weekly review
  it('is due on a Sunday awake, once that Sunday, and never on another day or asleep', () => {
    const base = { timezone: 'Europe/Stockholm', nowMs: SUNDAY, asleep: false, pricesSetOn: undefined as string | undefined, today: '2026-11-22' }
    expect(pricesDue(base)).toBe(true)
    expect(pricesDue({ ...base, nowMs: Date.parse('2026-11-22T18:00:00Z') - 3 * 3_600_000 })).toBe(false) // 16:00 local: before the review hour
    expect(pricesDue({ ...base, pricesSetOn: '2026-11-22' })).toBe(false)
    expect(pricesDue({ ...base, pricesSetOn: '2026-11-15' })).toBe(true)
    expect(pricesDue({ ...base, asleep: true })).toBe(false)
    expect(pricesDue({ ...base, nowMs: SUNDAY + 86_400_000, today: '2026-11-23' })).toBe(false)
  })
  it('gives the starting prices until a reset has set others, and the set ones after, filling anything missing from the start', () => {
    expect(livePrices(undefined)).toEqual(PRICES)
    expect(livePrices({ ...PRICES, sketch: 23 }).sketch).toBe(23)
    // A table stored before v4 carries the old one-price write and the old found request price: both are ignored.
    expect(livePrices({ write: 1, foundRequest: 2 } as never)).toEqual(PRICES)
  })
})

describe('prices in a plan', () => {
  it('uses the prices it is given for the cost of a step and of a plan', () => {
    expect(stepCost(step({ verb: 'tinker', size: 'sketch' }), { ...PRICES, sketch: 23 })).toBe(23)
    expect(planCost([step({ verb: 'tinker', size: 'sketch' }), step({ verb: 'tinker', size: 'sketch' })], { ...PRICES, sketch: 23 })).toBe(46)
  })
})
