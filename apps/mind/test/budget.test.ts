import { describe, expect, it } from 'vitest'
import { BudgetLedger } from '@forkling/schema'
import { canSpend, costUsd, estimateCallUsd, estimateTokens, monthOf, paceAhead, paceUsd, recordCall, rollLedger } from '../src/budget.ts'

const usage = { input: 1000, cacheRead: 3000, cacheWrite: 0, output: 200 }

describe('costUsd', () => {
  it('prices Haiku 5.5 per million tokens, with cheap cache reads', () => {
    // 1000 * 0.10 + 3000 * 0.01 + 200 * 0.50 = 100 + 30 + 100 = 230 millionths of a dollar x 1... per MTok
    expect(costUsd('claude-haiku-5-5', usage)).toBeCloseTo((1000 * 0.1 + 3000 * 0.01 + 200 * 0.5) / 1e6, 10)
  })

  it('charges cache writes at 1.25x input', () => {
    expect(costUsd('claude-haiku-5-5', { input: 0, cacheRead: 0, cacheWrite: 4000, output: 0 })).toBeCloseTo((4000 * 0.125) / 1e6, 10)
  })

  it('prices Sonnet 5.5 higher', () => {
    expect(costUsd('claude-sonnet-5-5', usage)).toBeGreaterThan(costUsd('claude-haiku-5-5', usage) * 10)
    expect(costUsd('claude-sonnet-5-5', usage)).toBeCloseTo((1000 * 2 + 3000 * 0.2 + 200 * 10) / 1e6, 10)
  })
})

describe('costUsd for the Batch API', () => {
  it('charges half', () => {
    expect(costUsd('claude-haiku-5-5', usage, { batch: true })).toBeCloseTo(costUsd('claude-haiku-5-5', usage) / 2, 12)
  })
})

describe('estimates', () => {
  it('counts about four characters per token, rounding up', () => {
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('abcde')).toBe(2)
    expect(estimateTokens('')).toBe(0)
  })

  it('bounds a call by treating all input as uncached', () => {
    expect(estimateCallUsd('claude-haiku-5-5', 10_000, 2_000)).toBeCloseTo((10_000 * 0.1 + 2_000 * 0.5) / 1e6, 10)
  })
})

describe('ledger', () => {
  const ledger = BudgetLedger.parse({ month: '2026-11' })
  const call = { at: '2026-11-03T10:00:00Z', kind: 'morning', model: 'claude-haiku-5-5', input: 1000, cacheRead: 0, cacheWrite: 3000, output: 200, usd: 0.0006 }

  it('names the month in the forkling time zone', () => {
    expect(monthOf('Europe/Stockholm', Date.parse('2026-11-30T23:30:00Z'))).toBe('2026-12')
    expect(monthOf('UTC', Date.parse('2026-11-30T23:30:00Z'))).toBe('2026-11')
  })

  it('records a call and adds to the total', () => {
    const next = recordCall(recordCall(ledger, call), call)
    expect(next.calls).toHaveLength(2)
    expect(next.spentUsd).toBeCloseTo(0.0012, 8)
    expect(ledger.calls).toHaveLength(0)
  })

  it('keeps only the latest calls but never loses the total', () => {
    let l = ledger
    for (let i = 0; i < 520; i++) l = recordCall(l, call)
    expect(l.calls).toHaveLength(500)
    expect(l.spentUsd).toBeCloseTo(520 * 0.0006, 6)
  })

  it('stops at the cap, estimate included', () => {
    const nearly = BudgetLedger.parse({ month: '2026-11', capUsd: 10, spentUsd: 9.999 })
    expect(canSpend(nearly, 0.0005)).toBe(true)
    expect(canSpend(nearly, 0.002)).toBe(false)
    expect(canSpend(BudgetLedger.parse({ month: '2026-11', capUsd: 10, spentUsd: 10 }), 0)).toBe(true)
    expect(canSpend(BudgetLedger.parse({ month: '2026-11', capUsd: 10, spentUsd: 10 }), 0.0001)).toBe(false)
  })

  it('does not keep an empty month in the history', () => {
    expect(rollLedger(ledger, '2026-12').history).toEqual([])
  })

  it('never rolls back to an earlier month, so a clock or a time zone running behind cannot rewrite the ledger', () => {
    const used = recordCall(ledger, call)
    expect(rollLedger(used, '2026-10')).toBe(used)
    expect(rollLedger(used, '2025-12')).toBe(used)
  })

  it('starts a fresh month and keeps a total of the old one', () => {
    const used = recordCall(ledger, call)
    const rolled = rollLedger(used, '2026-12')
    expect(rolled.month).toBe('2026-12')
    expect(rolled.spentUsd).toBe(0)
    expect(rolled.calls).toEqual([])
    expect(rolled.history).toEqual([{ month: '2026-11', spentUsd: used.spentUsd, calls: 1 }])
    expect(rollLedger(used, '2026-11')).toBe(used)
  })
})

describe('paceUsd and paceAhead (spec 13)', () => {
  const ledger = (spentUsd: number) => BudgetLedger.parse({ month: '2026-11', capUsd: 12, serverUsd: 7.49, spentUsd })

  it('is the cap spread evenly over the month, counting the whole of today', () => {
    expect(paceUsd(ledger(0), '2026-11-15')).toBeCloseTo(6, 10)
    expect(paceUsd(ledger(0), '2026-11-30')).toBeCloseTo(12, 10)
    expect(paceUsd(ledger(0), '2026-02-14')).toBeCloseTo(6, 10) // 14 of 28 days
  })

  it('is ahead only when spend is more than 15% over the pace', () => {
    expect(paceAhead(ledger(6.9), '2026-11-15')).toBe(false) // exactly 15%
    expect(paceAhead(ledger(6.91), '2026-11-15')).toBe(true)
    expect(paceAhead(ledger(0), '2026-11-15')).toBe(false)
  })
})

describe('rollLedger keeps the server price', () => {
  it('carries serverUsd into the new month along with the cap', () => {
    const next = rollLedger(BudgetLedger.parse({ month: '2026-11', capUsd: 12, serverUsd: 8, spentUsd: 3 }), '2026-12')
    expect(next).toMatchObject({ month: '2026-12', capUsd: 12, serverUsd: 8, spentUsd: 0 })
  })
})

describe('byKind: the month so far for each kind of call (spec 13: compare the table with what was spent)', () => {
  const call = (kind: string, model: 'claude-haiku-5-5' | 'claude-sonnet-5-5', input: number, output: number, usd: number) => ({ at: '2026-11-12T10:00:00Z', kind, model, input, cacheRead: 100, cacheWrite: 10, output, usd })

  it('adds up calls, tokens and dollars per kind, however many calls the list has dropped', () => {
    let ledger = BudgetLedger.parse({ month: '2026-11' })
    ledger = recordCall(ledger, call('thought', 'claude-haiku-5-5', 500, 80, 0.001))
    ledger = recordCall(ledger, call('thought', 'claude-haiku-5-5', 700, 120, 0.002))
    ledger = recordCall(ledger, call('decide', 'claude-haiku-5-5', 2000, 300, 0.01))
    expect(ledger.byKind.thought).toEqual({ calls: 2, input: 1200, cacheRead: 200, cacheWrite: 20, output: 200, usd: 0.003 })
    expect(ledger.byKind.decide).toMatchObject({ calls: 1, usd: 0.01 })
  })

  it('is empty in an older file, and starts over with the month', () => {
    expect(BudgetLedger.parse({ month: '2026-11' }).byKind).toEqual({})
    const used = recordCall(BudgetLedger.parse({ month: '2026-11' }), call('read', 'claude-haiku-5-5', 100, 10, 0.0005))
    expect(rollLedger(used, '2026-12').byKind).toEqual({})
  })

  it('keeps counting after the list of calls has been cut to its last 500', () => {
    let ledger = BudgetLedger.parse({ month: '2026-11' })
    for (let i = 0; i < 520; i++) ledger = recordCall(ledger, call('thought', 'claude-haiku-5-5', 10, 1, 0.0001))
    expect(ledger.calls).toHaveLength(500)
    expect(ledger.byKind.thought?.calls).toBe(520)
  })
})
