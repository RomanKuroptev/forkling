import { describe, expect, it } from 'vitest'
import { BudgetLedger, MindState } from '@forkling/schema'
import { PRICES } from '@forkling/sim'
import { pricesStep } from '../src/tick/prices.ts'
import type { Tick } from '../src/tick/context.ts'

const SUNDAY = '2026-11-22T10:00:00Z'
const calls = (kind: string, usd: number, n: number) => Array.from({ length: n }, () => ({ at: '2026-11-21T10:00:00Z', kind, model: 'claude-sonnet-5-5', input: 1, cacheRead: 0, cacheWrite: 0, output: 1, usd }))

function tick(over: { nowIso?: string; today?: string; asleep?: boolean; mind?: Record<string, unknown> } = {}) {
  const nowIso = over.nowIso ?? SUNDAY
  return {
    nowIso,
    nowMs: Date.parse(nowIso),
    today: over.today ?? '2026-11-22',
    tz: 'Europe/Stockholm',
    asleep: over.asleep ?? false,
    notes: [] as string[],
    mind: MindState.parse(over.mind ?? {}),
    budget: BudgetLedger.parse({ month: '2026-11', calls: [...calls('sketch', 0.023, 4), ...calls('tend', 0.0031, 3)] }),
  } as unknown as Tick
}

describe('the Sunday price reset (audit 17 Nov)', () => {
  it('sets the prices from the ledger on a Sunday, says what changed in the tick log, and does it once that day', () => {
    const t = tick()
    pricesStep(t)
    expect(t.mind.prices).toMatchObject({ sketch: 23, tend: 4, expand: PRICES.expand })
    expect(t.mind.pricesSetOn).toBe('2026-11-22')
    expect(t.notes.join(' ')).toMatch(/prices reset/)
    expect(t.notes.join(' ')).toMatch(/sketch 50 to 23/)
    expect(t.notes.join(' ')).toMatch(/tend 2 to 4/)
    const again = tick({ mind: { prices: t.mind.prices, pricesSetOn: '2026-11-22' } })
    pricesStep(again)
    expect(again.notes).toEqual([])
  })

  it('does nothing on another day of the week or asleep', () => {
    for (const t of [tick({ nowIso: '2026-11-23T10:00:00Z', today: '2026-11-23' }), tick({ asleep: true })]) {
      pricesStep(t)
      expect(t.mind.prices).toBeUndefined()
      expect(t.mind.pricesSetOn).toBeUndefined()
    }
  })

  it('starts from the prices in force, not from the starting table, so a kind with too few calls keeps last week\'s price', () => {
    const t = tick({ mind: { prices: { ...PRICES, expand: 61 }, pricesSetOn: '2026-11-15' } })
    pricesStep(t)
    expect(t.mind.prices!.expand).toBe(61)
    expect(t.mind.prices!.sketch).toBe(23)
  })
})
