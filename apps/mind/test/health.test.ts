import { describe, expect, it } from 'vitest'
import { BudgetLedger, Goals, MindState, TickLine, type Health } from '@forkling/schema'
import { buildHealth, type HealthContext } from '../src/health.ts'

const T0 = Date.parse('2026-11-03T09:00:00Z')
const iso = (min: number) => new Date(T0 + min * 60_000).toISOString()

const step = (min: number, over: Partial<NonNullable<TickLine['stepAfter']>> = {}) => ({
  index: 0,
  verb: 'watch',
  targetId: 'sunny-rock',
  startedAt: iso(min),
  until: iso(min + 30),
  ...over,
})

function line(min: number, over: Partial<TickLine> = {}): TickLine {
  return TickLine.parse({
    at: iso(min),
    engine: 'v0.7.3',
    asleep: false,
    triggers: [],
    think: null,
    calls: [],
    notes: [],
    stepBefore: null,
    stepAfter: step(0),
    planId: '2026-11-03:aaaa',
    needs: { hunger: 70, energy: 80, curiosity: 60 },
    mood: 'content',
    wrote: [],
    summary: '',
    ...over,
  })
}

const planned = Goals.parse({
  today: { date: '2026-11-03', steps: [{ verb: 'watch', reason: 'View.', minutes: 30 }, { verb: 'sit', reason: 'Rest.', minutes: 10 }], reason: 'A day.' },
  now: { index: 0, startedAt: iso(0), until: iso(30) },
})

const ctx = (min: number, over: Partial<HealthContext> = {}): HealthContext => ({
  today: '2026-11-03',
  nowMs: T0 + min * 60_000,
  goals: planned,
  mind: MindState.parse({}),
  budget: BudgetLedger.parse({ month: '2026-11' }),
  ...over,
})

const okCall = (kind: string) => ({ kind, model: 'claude-haiku-5-5', usd: 0.001, ok: true })
const failedCall = (kind: string) => ({ kind, model: 'claude-haiku-5-5', usd: 0, ok: false, error: 'overloaded' })

/** Feeds a list of ticks through, as the mind does one tick at a time. */
function run(ticks: { min: number; line?: Partial<TickLine>; ctx?: Partial<HealthContext> }[]): Health {
  let health: Health | null = null
  for (const t of ticks) health = buildHealth(health, line(t.min, t.line), ctx(t.min, t.ctx))
  return health!
}

describe('buildHealth', () => {
  it('summarises a calm tick with no warnings', () => {
    const h = run([{ min: 0 }, { min: 10 }])
    expect(h.warnings).toEqual([])
    expect(h.lastTick).toMatchObject({ at: iso(10), asleep: false })
    expect(h.plan.current).toMatchObject({ index: 0, verb: 'watch', overdueMinutes: 0 })
    expect(h.plan.stepsLeft).toBe(1)
    expect(h.today.ticks).toBe(2)
    expect(h.spend).toMatchObject({ monthUsd: 0, capUsd: 10 })
  })

  it('counts triggers and calls by kind, and the decide calls, for the day', () => {
    const h = run([
      { min: 0, line: { triggers: [{ kind: 'newDay', score: 1 }], think: 'morning', calls: [okCall('morning')] } },
      { min: 10, line: { triggers: [{ kind: 'need', score: 0.6 }], think: 'decide', calls: [okCall('decide'), failedCall('art')] } },
    ])
    expect(h.today.triggersByKind).toEqual({ newDay: 1, need: 1 })
    expect(h.today.callsByKind).toEqual({ morning: 1, decide: 1 })
    expect(h.today.decideCalls).toBe(2)
    expect(h.today.failures).toBe(1)
  })

  it('starts the day over when the date changes', () => {
    const first = run([{ min: 0, line: { calls: [okCall('decide')] } }])
    const next = buildHealth(first, line(24 * 60), ctx(24 * 60, { today: '2026-11-04' }))
    expect(next.date).toBe('2026-11-04')
    expect(next.today.decideCalls).toBe(0)
    expect(next.today.ticks).toBe(1)
  })

  it('notes when the plan was replaced', () => {
    const h = run([{ min: 0 }, { min: 10, line: { planId: '2026-11-03:bbbb' } }])
    expect(h.plan.planId).toBe('2026-11-03:bbbb')
    expect(h.plan.lastReplanAt).toBe(iso(10))
  })

  it('counts a step once when it starts', () => {
    const h = run([
      { min: 0, line: { stepBefore: null, stepAfter: step(0) } },
      { min: 10, line: { stepBefore: step(0), stepAfter: step(0) } },
      { min: 31, line: { stepBefore: step(0), stepAfter: { index: 1, verb: 'sit', startedAt: iso(31), until: iso(41) } } },
    ])
    expect(h.today.stepsStarted).toEqual({ 'watch sunny-rock': 1, sit: 1 })
  })

  it('says how late a step is', () => {
    const h = run([{ min: 0 }, { min: 50 }])
    expect(h.plan.current!.overdueMinutes).toBe(20)
  })

  describe('warnings', () => {
    it('names a need that has been under 15 for over an hour while awake', () => {
      const low = { needs: { hunger: 5, energy: 80, curiosity: 60 } }
      const h = run(Array.from({ length: 8 }, (_, i) => ({ min: i * 10, line: low })))
      expect(h.needsCritical.hunger).toBe(70)
      expect(h.warnings.join(' ')).toMatch(/hunger has been under 15 for 70 minutes/)
    })

    it('forgives a need that recovers, and does not count sleep', () => {
      const h = run([
        { min: 0, line: { needs: { hunger: 5 } } },
        { min: 10, line: { needs: { hunger: 5 } } },
        { min: 20, line: { needs: { hunger: 50 } } },
      ])
      expect(h.needsCritical.hunger).toBe(0)
      const asleep = run([
        { min: 0, line: { needs: { hunger: 5 }, asleep: true } },
        { min: 60, line: { needs: { hunger: 5 }, asleep: true } },
      ])
      expect(asleep.needsCritical.hunger).toBe(0)
      expect(asleep.warnings).toEqual([])
    })

    it('warns when nothing has been planned for over an hour while awake', () => {
      const none = { goals: Goals.parse({}) }
      const h = run(Array.from({ length: 8 }, (_, i) => ({ min: i * 10, line: { stepAfter: null, planId: null }, ctx: none })))
      expect(h.plan.idleMinutes).toBe(70)
      expect(h.warnings.join(' ')).toMatch(/no step in progress for 70 minutes/)
    })

    it('warns when the same step starts three times in a day', () => {
      const starts = [0, 20, 40].map((m) => ({ min: m, line: { stepBefore: null, stepAfter: step(m) } }))
      expect(run(starts).warnings.join(' ')).toMatch(/"watch sunny-rock" 3 times/)
      expect(run(starts.slice(0, 2)).warnings).toEqual([])
    })

    it('warns about more than 15 decide calls in a day', () => {
      const h = run(Array.from({ length: 16 }, (_, i) => ({ min: i * 10, line: { calls: [okCall('decide')] } })))
      expect(h.warnings.join(' ')).toMatch(/16 decide calls today/)
    })

    it('warns when spend runs ahead of the month', () => {
      const h = run([{ min: 0, ctx: { budget: BudgetLedger.parse({ month: '2026-11', spentUsd: 4 }) } }])
      expect(h.spend.paceUsd).toBeCloseTo(1, 1)
      expect(h.warnings.join(' ')).toMatch(/spent \$4\.00 .* pace/)
    })

    it('warns about a build open for more than two days', () => {
      const open = { openBuild: { id: 'a-lamp', kind: 'object' as const, requestedAt: new Date(T0 - 50 * 3_600_000).toISOString() } }
      const h = run([{ min: 0, ctx: { mind: MindState.parse(open) } }])
      expect(h.openBuild).toMatchObject({ id: 'a-lamp', kind: 'object' })
      expect(h.warnings.join(' ')).toMatch(/a-lamp has been open for 50 hours/)
    })

    it('warns about a long wait between awake ticks, for the rest of the day', () => {
      const h = run([{ min: 0 }, { min: 50 }, { min: 60 }])
      expect(h.today.longestGapMinutes).toBe(50)
      expect(h.warnings.join(' ')).toMatch(/longest wait between ticks today was 50 minutes/)
      // Hourly ticks in bed are normal.
      const night = run([{ min: 0, line: { asleep: true } }, { min: 60, line: { asleep: true } }])
      expect(night.warnings).toEqual([])
    })

    it('warns about failed calls and turned down plans piling up', () => {
      const h = run([0, 10, 20].map((m) => ({ min: m, line: { calls: [failedCall('decide')], notes: ['plan rejected: x'] } })))
      expect(h.warnings.join(' ')).toMatch(/3 failed calls today/)
      expect(h.warnings.join(' ')).toMatch(/3 plans turned down today/)
    })
  })

  it('counts the day against each quota', () => {
    const mind = MindState.parse({ readings: { date: '2026-11-03', count: 2, skimmed: true }, arts: { date: '2026-11-03', count: 3 }, builds: { date: '2026-11-02', count: 1 }, codeWeek: { week: '2026-W45', count: 1 } })
    const h = run([{ min: 0, ctx: { mind } }])
    expect(h.quotas.readings).toEqual({ used: 2, max: 5 })
    expect(h.quotas.creative).toEqual({ used: 3, max: 4 })
    expect(h.quotas.builds).toEqual({ used: 0, max: 1 })
    expect(h.quotas.codeThisWeek).toEqual({ used: 1, max: 2 })
  })

  it('keeps count of how long the mood has lasted', () => {
    const h = run([{ min: 0, line: { mood: 'upset' } }, { min: 10, line: { mood: 'upset' } }, { min: 20, line: { mood: 'upset' } }])
    expect(h.mood).toEqual({ label: 'upset', minutes: 20 })
    expect(run([{ min: 0, line: { mood: 'upset' } }, { min: 10, line: { mood: 'content' } }]).mood).toEqual({ label: 'content', minutes: 0 })
  })
})
