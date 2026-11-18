import { describe, expect, it } from 'vitest'
import { BudgetLedger, MindState } from '@forkling/schema'
import { PRICES } from '@forkling/sim'
import { pricesStep } from '../src/tick/prices.ts'
import type { Tick } from '../src/tick/context.ts'

const SUNDAY = '2026-11-22T19:30:00Z' // 20:30 in Stockholm, after the weekly review
const call = (kind: string, usd: number, at = '2026-11-21T10:00:00Z') => ({ at, kind, model: 'claude-sonnet-5-5', input: 1, cacheRead: 0, cacheWrite: 0, output: 1, usd })
const calls = (kind: string, usd: number, n: number) => Array.from({ length: n }, () => call(kind, usd))

function tick(over: { nowIso?: string; today?: string; asleep?: boolean; mind?: Record<string, unknown>; extra?: ReturnType<typeof call>[]; capUsd?: number } = {}) {
  const nowIso = over.nowIso ?? SUNDAY
  return {
    nowIso,
    nowMs: Date.parse(nowIso),
    today: over.today ?? '2026-11-22',
    tz: 'Europe/Stockholm',
    asleep: over.asleep ?? false,
    notes: [] as string[],
    mind: MindState.parse(over.mind ?? {}),
    budget: BudgetLedger.parse({ month: '2026-11', capUsd: over.capUsd ?? 12.6, calls: [...calls('sketch', 0.023, 5), ...calls('tend', 0.0031, 5), ...(over.extra ?? [])] }),
  } as unknown as Tick
}

describe('the Sunday reset of prices and daily points (spec v4 5.2)', () => {
  it('sets the prices from the ledger on a Sunday evening, says what changed in the tick log, and does it once that day', () => {
    const t = tick()
    pricesStep(t)
    // A sketch is wanted at 0.6 of 23 points but a price moves at most 25% a week: 30 to 23. A tend wanted 4, from 2 to 3.
    expect(t.mind.prices).toMatchObject({ sketch: 23, tend: 3, expand: PRICES.expand, caption: 1, page: 10 })
    expect(t.mind.pricesSetOn).toBe('2026-11-22')
    expect(t.notes.join(' ')).toMatch(/prices reset/)
    expect(t.notes.join(' ')).toMatch(/sketch 30 to 23/)
    expect(t.notes.join(' ')).toMatch(/tend 2 to 3/)
    const again = tick({ mind: { prices: t.mind.prices, pricesSetOn: '2026-11-22' } })
    pricesStep(again)
    expect(again.notes).toEqual([])
  })

  it('does nothing on another day of the week, asleep, or on Sunday before the review hour', () => {
    for (const t of [tick({ nowIso: '2026-11-23T19:30:00Z', today: '2026-11-23' }), tick({ asleep: true }), tick({ nowIso: '2026-11-22T10:00:00Z' })]) {
      pricesStep(t)
      expect(t.mind.prices).toBeUndefined()
      expect(t.mind.pricesSetOn).toBeUndefined()
    }
  })

  it('starts from the prices in force, so a kind with too few calls keeps last week\'s price', () => {
    const t = tick({ mind: { prices: { ...PRICES, expand: 61 }, pricesSetOn: '2026-11-15' } })
    pricesStep(t)
    expect(t.mind.prices!.expand).toBe(61)
  })

  it('keeps the daily points at 300 until 7 full days of overhead are on record, and says so', () => {
    const t = tick()
    pricesStep(t)
    expect(t.mind.dailyPoints).toEqual({ value: 300, setOn: '2026-11-22' })
    expect(t.notes.join(' ')).toMatch(/daily points stay at 300/)
  })

  it('reads each past day of overhead from the ledger, once, and sets the daily points from 7 of them', () => {
    const days = ['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21']
    const t = tick({ extra: days.map((d) => call('thought', 0.085, `${d}T10:00:00Z`)) })
    pricesStep(t)
    expect(t.mind.overheadDays).toHaveLength(7)
    expect(t.mind.dailyPoints).toEqual({ value: 300, setOn: '2026-11-22' })
    const raised = tick({ capUsd: 15, extra: days.map((d) => call('thought', 0.085, `${d}T10:00:00Z`)) })
    pricesStep(raised)
    expect(raised.mind.dailyPoints!.value).toBe(370)
    expect(raised.notes.join(' ')).toMatch(/daily points 300 to 370/)
  })

  it('records overhead days on every day of the week, not only Sunday', () => {
    const t = tick({ nowIso: '2026-11-18T09:00:00Z', today: '2026-11-18', extra: [call('thought', 0.05, '2026-11-17T10:00:00Z')] })
    pricesStep(t)
    expect(t.mind.overheadDays).toEqual([{ date: '2026-11-17', usd: 0.05 }])
  })
})
