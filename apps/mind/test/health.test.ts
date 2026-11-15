import { describe, expect, it } from 'vitest'
import { BudgetLedger, Goals, MindState, TickLine, WorkMeta, type Health } from '@forkling/schema'
import { buildHealth, w7SpendWarning, type HealthContext } from '../src/health.ts'

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
    expect(h.spend).toMatchObject({ monthUsd: 0, capUsd: 12.51 })
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

  it('counts refusals and answers cut off at the output limit apart from other failures', () => {
    const h = run([
      { min: 0, line: { calls: [{ ...failedCall('decide'), stop: 'refusal' }, { ...failedCall('read'), stop: 'cut_off' }, { ...failedCall('read'), stop: 'cut_off' }, failedCall('read')] } },
    ])
    expect(h.today.failures).toBe(4)
    expect(h.today.refusals).toBe(1)
    expect(h.today.cutOff).toBe(2)
  })

  it('warns when answers keep being cut off, since the output limit is then too low', () => {
    const h = run([{ min: 0, line: { calls: [{ ...failedCall('read'), stop: 'cut_off' }, { ...failedCall('read'), stop: 'cut_off' }, { ...failedCall('read'), stop: 'cut_off' }] } }])
    expect(h.warnings.some((w) => w.includes('output limit'))).toBe(true)
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

    it('warns when spend runs more than 15% ahead of the pace of the month (spec 13)', () => {
      const h = run([{ min: 0, ctx: { budget: BudgetLedger.parse({ month: '2026-11', spentUsd: 4 }) } }])
      expect(h.spend.paceUsd).toBeCloseTo(1.25, 2) // $12.51 cap, 3 of 30 days
      expect(h.warnings.join(' ')).toMatch(/spent \$4\.00 .* pace/)
    })

    it('does not warn within 15% of the pace', () => {
      const h = run([{ min: 0, ctx: { budget: BudgetLedger.parse({ month: '2026-11', spentUsd: 1.4 }) } }])
      expect(h.warnings.join(' ')).not.toMatch(/pace/)
    })

    it('warns about a build open for more than two days', () => {
      const open = { openBuild: { id: 'a-lamp', kind: 'object' as const, requestedAt: new Date(T0 - 50 * 3_600_000).toISOString() } }
      const h = run([{ min: 0, ctx: { mind: MindState.parse(open) } }])
      expect(h.openBuild).toMatchObject({ id: 'a-lamp', kind: 'object' })
      expect(h.warnings.join(' ')).toMatch(/a-lamp has been open for 50 hours/)
    })

    it('also watches a coded project waiting for a person, which is the one that can sit longest', () => {
      const open = { openCode: { id: 'gate-toy', kind: 'code' as const, requestedAt: new Date(T0 - 60 * 3_600_000).toISOString() } }
      const h = run([{ min: 0, ctx: { mind: MindState.parse(open) } }])
      expect(h.openBuild).toMatchObject({ id: 'gate-toy', kind: 'code' })
      expect(h.warnings.join(' ')).toMatch(/gate-toy has been open for 60 hours/)
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

  it('counts the day against the limits that remain, and shows the points in hand', () => {
    const mind = MindState.parse({ trips: { date: '2026-11-03', reads: 7, trips: 2, starts: [] }, allowance: { points: 120.4, day: '2026-11-03' } })
    const h = run([{ min: 0, ctx: { mind } }])
    expect(h.quotas.readings).toEqual({ used: 7, max: 40 })
    expect(h.quotas.creative).toBeUndefined()
    expect(h.allowance).toEqual({ points: 120, max: 450 })
  })

  it('keeps count of how long the mood has lasted', () => {
    const h = run([{ min: 0, line: { mood: 'upset' } }, { min: 10, line: { mood: 'upset' } }, { min: 20, line: { mood: 'upset' } }])
    expect(h.mood).toEqual({ label: 'upset', minutes: 20 })
    expect(run([{ min: 0, line: { mood: 'upset' } }, { min: 10, line: { mood: 'content' } }]).mood).toEqual({ label: 'content', minutes: 0 })
  })
})

describe('the work numbers in health (spec 12.6, 12.3: repeated work is measured, never enforced)', () => {
  const w = (id: string, title: string, kind: string, made: string) => WorkMeta.parse({ id, title, kind, about: `about ${title}`, interest: null, made, status: 'shelf', size: 'full' })

  it('gives the works made in the last 7 days, per kind, and how many would have tripped a nudge', () => {
    const works = [w('a', 'Alpha', 'art', '2026-10-01T10:00:00Z'), w('b', 'Bravo', 'art', '2026-11-02T10:00:00Z'), w('c', 'Charlie', 'art', '2026-11-03T08:00:00Z'), w('d', 'Delta', 'art', '2026-11-03T09:00:00Z')]
    const h = buildHealth(null, line(0), ctx(0, { works }))
    expect(h.novelty?.works).toEqual({ made: 3, wouldFire: 2, byKind: { art: 3 } }) // the third and the fourth art work in a row
  })

  it('has no novelty block for a world with no works yet', () => {
    expect(buildHealth(null, line(0), ctx(0)).novelty?.works).toEqual({ made: 0, wouldFire: 0, byKind: {} })
  })

  it('never turns a nudge into a warning', () => {
    const works = [w('a', 'Alpha', 'art', '2026-11-02T10:00:00Z'), w('b', 'Bravo', 'art', '2026-11-03T08:00:00Z'), w('c', 'Charlie', 'art', '2026-11-03T09:00:00Z')]
    expect(buildHealth(null, line(0), ctx(0, { works })).warnings.join(' ')).not.toMatch(/work|repeat/i)
  })
})

describe('the place numbers in health (spec 12.3, 12.6: repeated place, stuck in one place and weekend revisit are measured, never enforced)', () => {
  const p = (id: string, name: string, purpose: string, founded: string, lastCareAt: string | null) => ({ id, name, purpose, founded, lastCareAt })
  const home = p('home', 'Home', 'Where my days start and end: a desk to read and write at, a bed, a shelf.', '2026-10-01', '2026-11-02T10:00:00Z')
  const hall = p('lantern-hall', 'Lantern Hall', 'Where I keep the lidar finds, each under its own lamp', '2026-10-05', '2026-10-20T10:00:00Z')
  const copy = p('lantern-hall-2', 'Lantern Hall', 'A tower for the tide gauge readings', '2026-11-01', '2026-11-02T10:00:00Z')
  const steps = ['01', '02', '03', '04'].map((h) => ({ at: `2026-11-02T${h}:00:00Z`, verb: 'tend', targetId: 'lantern-hall' }))

  it('gives what each place nudge would have named in the last 7 days', () => {
    const h = buildHealth(null, line(0), ctx(0, { placeNudges: { places: [home, hall, copy], requests: [], steps } }))
    // Home was cared for yesterday, the hall 14 days ago (neglect), the copy repeats a name, the hall had 4 steps in a day.
    expect(h.novelty?.places).toEqual({ wouldFire: 3, repeatedPlace: 1, stuckInOnePlace: 1, weekendRevisit: 1 })
  })

  it('is all zeros for a world with no places', () => {
    expect(buildHealth(null, line(0), ctx(0)).novelty?.places).toEqual({ wouldFire: 0, repeatedPlace: 0, stuckInOnePlace: 0, weekendRevisit: 0 })
  })

  it('never turns a nudge into a warning', () => {
    const h = buildHealth(null, line(0), ctx(0, { placeNudges: { places: [home, hall, copy], requests: [], steps } }))
    expect(h.warnings.join(' ')).not.toMatch(/place|stuck|neglect|repeat/i)
  })

  it('leaves the work numbers where they were', () => {
    const h = buildHealth(null, line(0), ctx(0, { placeNudges: { places: [home], requests: [], steps: [] } }))
    expect(h.novelty?.works).toEqual({ made: 0, wouldFire: 0, byKind: {} })
  })
})

describe('the day\'s spend by kind (Roman: reflection and the sleep rewrite, batch and late booked apart)', () => {
  const priced = (kind: string, usd: number, ok = true) => ({ kind, model: 'claude-sonnet-5-5', usd, ok })
  it('adds up what each kind cost today, failed calls included (a refusal is billed)', () => {
    const h = run([
      { min: 0, line: { calls: [priced('reflection', 0.05), priced('sleep', 0.2)] } },
      { min: 5, line: { calls: [priced('reflection', 0.04), priced('sleeplate', 0.4), priced('reflection', 0.03, false)] } },
    ])
    expect(h.today.spendByKind.reflection).toBeCloseTo(0.12)
    expect(h.today.spendByKind.sleep).toBeCloseTo(0.2)
    expect(h.today.spendByKind.sleeplate).toBeCloseTo(0.4)
  })
  it('starts again on a new day', () => {
    const first = buildHealth(null, line(0, { calls: [priced('reflection', 0.05)] }), ctx(0))
    const next = buildHealth(first, line(24 * 60, { calls: [priced('reflection', 0.01)] }), ctx(24 * 60, { today: '2026-11-04' }))
    expect(next.today.spendByKind.reflection).toBeCloseTo(0.01)
  })
})

describe('the W7 spend warning (Roman: warn if W7 pushes the month over $20)', () => {
  const ledger = (over: Record<string, unknown>, byKind: Record<string, number> = {}) =>
    BudgetLedger.parse({ month: '2026-11', serverUsd: 7, capUsd: 13, ...over, byKind: Object.fromEntries(Object.entries(byKind).map(([k, usd]) => [k, { calls: 1, input: 1, cacheRead: 0, cacheWrite: 0, output: 1, usd }])) })

  it('warns when the month projects past $20 with the server, and W7 calls are part of it', () => {
    const w = w7SpendWarning(ledger({ spentUsd: 5 }, { reflection: 1, sleep: 0.8, weekly: 0.2 }), '2026-11-10')
    expect(w).toMatch(/W7 spend would pass \$20/)
    expect(w).toMatch(/\$22/)
  })
  it('says nothing when the projection stays under $20', () => {
    expect(w7SpendWarning(ledger({ spentUsd: 3 }, { reflection: 1 }), '2026-11-10')).toBeNull()
  })
  it('says nothing when W7 calls cost nothing: it is not W7 that pushes it (the pace warning is for that)', () => {
    expect(w7SpendWarning(ledger({ spentUsd: 5 }, { decide: 5 }), '2026-11-10')).toBeNull()
  })
  it('waits for the third day of the month, when a projection means something', () => {
    expect(w7SpendWarning(ledger({ spentUsd: 5 }, { reflection: 5 }), '2026-11-02')).toBeNull()
    expect(w7SpendWarning(ledger({ spentUsd: 5 }, { reflection: 5 }), '2026-11-03')).not.toBeNull()
  })
  it('counts the server price: the same spend is fine with a cheap server', () => {
    expect(w7SpendWarning(ledger({ spentUsd: 5, serverUsd: 2, capUsd: 18 }, { reflection: 1 }), '2026-11-10')).toBeNull()
  })
  it('shows in the health warnings', () => {
    const h = buildHealth(null, line(0), ctx(0, { today: '2026-11-10', budget: ledger({ spentUsd: 5 }, { reflection: 1 }) }))
    expect(h.warnings.some((w) => /W7 spend would pass \$20/.test(w))).toBe(true)
  })
})

describe('the weekly health check in health (spec 9.6)', () => {
  const day = 86_400_000
  const week = (rows: [string, number][]) => rows.map(([verb, ago]) => ({ verb, at: new Date(T0 - ago * day).toISOString() }))
  it('adds the weekly warnings from the week\'s steps, the wake moods and the builds', () => {
    const steps = week([['wander', 1], ['wander', 1], ['wander', 2], ['wander', 2], ['wander', 3], ['wander', 3], ['tend', 5], ['rest', 6]])
    const h = buildHealth(null, line(0), ctx(0, { week: { steps, builds: { total: 6, failed: 3 } }, mind: MindState.parse({ wakeMoods: [{ date: '2026-11-01', mood: -0.7 }, { date: '2026-11-02', mood: -0.8 }, { date: '2026-11-03', mood: -0.9 }] }) }))
    expect(h.warnings.some((w) => /"wander"/.test(w))).toBe(true)
    expect(h.warnings.some((w) => /no tend, expand/.test(w))).toBe(true)
    expect(h.warnings.some((w) => /mood/.test(w))).toBe(true)
    expect(h.warnings.some((w) => /3 of 6 builds/.test(w))).toBe(true)
  })
  it('adds nothing without the week\'s numbers, and only warns: nothing here changes Merge', () => {
    expect(buildHealth(null, line(0), ctx(0)).warnings).toEqual([])
  })
})


describe('the rest of the novelty block (spec 12.6): texts, doors, the one host, collisions and constraints', () => {
  const fog = 'the fog came in over the harbour and the lamps went out one by one'
  const texts = {
    writings: [{ id: 'a', at: '2026-10-30T10:00:00Z', text: fog }, { id: 'b', at: '2026-11-02T10:00:00Z', text: `${fog} tonight` }],
    diaries: [{ date: '2026-11-01', text: 'Today was quiet and grey. I read about moss.' }, { date: '2026-11-02', text: 'Today was quiet and grey. A lamp went out.' }],
  }

  it('gives the average highest similarity of the week\'s texts and how many tripped the writing and diary nudges', () => {
    const n = buildHealth(null, line(0), ctx(0, { texts })).novelty
    expect(n?.texts?.texts).toBe(4)
    expect(n?.texts?.meanMaxSimilarity).toBeGreaterThan(0.3)
    expect(n?.texts).toMatchObject({ repeatedWriting: 1, repeatedDiary: 1 })
  })

  it('gives the share of the week\'s trips through a stranger\'s door, and the days without one', () => {
    const doorDays = [{ date: '2026-11-01', trips: 2, strangers: 0 }, { date: '2026-11-02', trips: 2, strangers: 1 }, { date: '2026-11-03', trips: 1, strangers: 0 }]
    expect(buildHealth(null, line(0), ctx(0, { doorDays })).novelty?.doors).toEqual({ trips: 5, strangers: 1, share: 0.2, noDoorDays: 1 })
  })

  it('says whether one host gave more than 60% of the week\'s reads', () => {
    const sources = { weeks: { '2026-W45': { 'en.wikipedia.org': { reads: 7, souvenirs: 0, placed: 0, boring: 0, failures: 0 }, 'www.gutenberg.org': { reads: 3, souvenirs: 0, placed: 0, boring: 0, failures: 0 } } } }
    const h = buildHealth(null, line(0), ctx(0, { sources: sources as never }))
    expect(h.novelty?.oneHost).toMatchObject({ host: 'en.wikipedia.org', wouldFire: true })
    expect(buildHealth(null, line(0), ctx(0)).novelty?.oneHost).toBeNull()
  })

  it('counts the week\'s collisions used and constraints offered and refused', () => {
    const w = (id: string, over: Record<string, unknown>) => WorkMeta.parse({ id, title: id, kind: 'art', about: `about ${id}`, interest: null, made: '2026-11-02T10:00:00Z', status: 'shelf', size: 'full', ...over })
    const works = [w('a', { collision: ['x', 'y'], constraint: { text: 'two colours', refused: false, reason: null } }), w('b', { constraint: { text: 'tiny', refused: true, reason: 'no' } })]
    expect(buildHealth(null, line(0), ctx(0, { works })).novelty?.draws).toEqual({ collisionsUsed: 1, constraintsOffered: 2, constraintsRefused: 1 })
  })

  it('is all zeros for a world with none of it, and never a warning', () => {
    const n = buildHealth(null, line(0), ctx(0)).novelty
    expect(n?.texts).toEqual({ texts: 0, meanMaxSimilarity: 0, repeatedWriting: 0, repeatedDiary: 0 })
    expect(n?.doors).toEqual({ trips: 0, strangers: 0, share: 0, noDoorDays: 0 })
    expect(n?.draws).toEqual({ collisionsUsed: 0, constraintsOffered: 0, constraintsRefused: 0 })
    const busy = buildHealth(null, line(0), ctx(0, { texts, doorDays: [{ date: '2026-11-02', trips: 2, strangers: 0 }] }))
    expect(busy.warnings.join(' ')).not.toMatch(/repeat|door|similar|diary|writing/i)
  })
})
