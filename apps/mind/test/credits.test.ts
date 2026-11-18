import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BudgetLedger, Credits, MindState } from '@forkling/schema'
import { DAILY_POINTS, MAX_GRANTS_KEPT, MAX_POINTS_IN_HAND, PRICES, grantPoints, stepCost } from '@forkling/sim'
import { canSpend, creativeModel, CREATIVE_FALLBACK_USD, effectiveCapUsd, guardLedger, moneyInUsd, paceAhead, paceUsd } from '../src/budget.ts'
import { readCredits } from '../src/credits.ts'

const ledger = (over: Record<string, unknown> = {}) => BudgetLedger.parse({ month: '2026-11', capUsd: 12.6, serverUsd: 7.4, spentUsd: 0, ...over })
const credit = (at: string, usd: number) => ({ at, usd, source: 'roman', note: 'a donation' })
const five = [credit('2026-11-10T10:00:00Z', 5)]

describe('the effective cap (spec v4 5.3)', () => {
  it('is capUsd plus the credits of that month, and not next month', () => {
    expect(effectiveCapUsd(ledger(), [])).toBe(12.6)
    expect(effectiveCapUsd(ledger(), five)).toBe(17.6)
    expect(effectiveCapUsd(ledger({ month: '2026-12' }), five)).toBe(12.6)
    expect(effectiveCapUsd(ledger(), five, '2026-12')).toBe(12.6)
    expect(effectiveCapUsd(ledger(), [...five, credit('2026-11-20T10:00:00Z', 2.5), credit('2026-10-30T10:00:00Z', 9)])).toBe(20.1)
  })

  it('shows money in as its own number, zero with no credits', () => {
    expect(moneyInUsd(ledger(), [])).toBe(0)
    expect(moneyInUsd(ledger(), five)).toBe(5)
  })

  it('leaves the schema check on capUsd alone: credits never make capUsd plus the server pass $23', () => {
    expect(BudgetLedger.safeParse({ month: '2026-11', capUsd: 12.6, serverUsd: 7.4 }).success).toBe(true)
    expect(BudgetLedger.safeParse({ month: '2026-11', capUsd: 17.6, serverUsd: 7.4 }).success).toBe(false)
  })
})

describe('what reads the cap moves with a credit', () => {
  it('the guard lets a call through that the stored cap would stop', () => {
    const l = ledger({ spentUsd: 12.5 })
    expect(canSpend(l, 0.5)).toBe(false)
    expect(canSpend(l, 0.5, five)).toBe(true)
  })

  it('the pace rule is spread over the bigger cap', () => {
    expect(paceUsd(ledger({ spentUsd: 6 }), '2026-11-15', five)).toBeCloseTo((17.6 * 15) / 30, 8)
  })

  it('the pace rule: ahead on the stored cap, not ahead on the bigger one', () => {
    const l = ledger({ spentUsd: 8 }) // pace 6.3, limit 7.245: ahead
    expect(paceAhead(l, '2026-11-15')).toBe(true)
    expect(paceAhead(l, '2026-11-15', five)).toBe(false) // pace 8.8, limit 10.12
  })

  it('the Haiku fallback comes later with a bigger cap', () => {
    const l = ledger({ spentUsd: 12.6 - CREATIVE_FALLBACK_USD + 0.1 })
    expect(creativeModel(l)).toBe('claude-haiku-5-5')
    expect(creativeModel(l, five)).toBe('claude-sonnet-5-5')
  })

  it('guardLedger carries the effective cap for read-only guards and leaves a ledger with no credits as it was', () => {
    const l = ledger()
    expect(guardLedger(l, five).capUsd).toBe(17.6)
    expect(guardLedger(l, [])).toBe(l)
    expect(l.capUsd).toBe(12.6)
  })
})

describe('readCredits', () => {
  let dir = ''
  afterEach(() => rmSync(dir, { recursive: true, force: true }))
  const world = (content?: string) => {
    dir = mkdtempSync(join(tmpdir(), 'credits-'))
    if (content !== undefined) {
      mkdirSync(join(dir, 'brain'))
      writeFileSync(join(dir, 'brain/credits.json'), content)
    }
    return dir
  }
  it('is empty when the file is missing, empty or unreadable, never a stop', () => {
    expect(readCredits(world())).toEqual([])
    expect(readCredits(world('{ "credits": [] }'))).toEqual([])
    expect(readCredits(world('not json'))).toEqual([])
    expect(readCredits(world('{ "credits": [{ "usd": -1 }] }'))).toEqual([])
  })
  it('reads what Roman added', () => {
    expect(readCredits(world(JSON.stringify({ credits: five })))).toEqual([{ ...five[0], note: 'a donation' }])
    expect(Credits.parse({}).credits).toEqual([])
  })
})

describe('points have a source (spec v4 5.3)', () => {
  it('records each grant with its source, keeps the last 30, and caps what is held', () => {
    let points = 0
    let grants: ReturnType<typeof grantPoints>['grants'] = []
    for (let day = 0; day < 40; day++) {
      const g = grantPoints(points, { at: `2026-11-${String((day % 28) + 1).padStart(2, '0')}T08:00:00Z`, points: DAILY_POINTS, source: 'daily' }, grants)
      points = g.points
      grants = g.grants
    }
    expect(grants).toHaveLength(MAX_GRANTS_KEPT)
    expect(grants.every((g) => g.source === 'daily')).toBe(true)
    expect(points).toBe(MAX_POINTS_IN_HAND)
  })

  it('takes any source, not only the daily grant', () => {
    const g = grantPoints(10, { at: '2026-11-20T10:00:00Z', points: 100, source: 'donation' }, [])
    expect(g.points).toBe(110)
    expect(g.grants).toEqual([{ at: '2026-11-20T10:00:00Z', points: 100, source: 'donation' }])
  })

  it('is part of the mind state, so old files without it still parse', () => {
    expect(MindState.parse({}).grants).toBeUndefined()
    expect(MindState.parse({ grants: [{ at: '2026-11-20T10:00:00Z', points: 300, source: 'daily' }] }).grants).toHaveLength(1)
  })
})

describe('an earned expand never costs more than a normal one (spec v4 2.2)', () => {
  it('is min(20, expand): the expand price floats with the Sunday reset, the earned one is fixed', () => {
    expect(stepCost({ verb: 'expand', earned: true }, PRICES)).toBe(20)
    expect(stepCost({ verb: 'expand', earned: true }, { ...PRICES, expand: 12 })).toBe(12)
    expect(stepCost({ verb: 'expand', earned: true }, { ...PRICES, expand: 20 })).toBe(20)
    expect(stepCost({ verb: 'expand' }, { ...PRICES, expand: 12 })).toBe(12)
  })
})
