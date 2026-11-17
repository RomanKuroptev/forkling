import { describe, expect, it } from 'vitest'
import { MAX_OPEN_WISHES, Place } from '@forkling/schema'
import {
  EXPAND_MIN_WEIGHT,
  FALLBACK_DAYS,
  addWishes,
  expandAllowed,
  expandEarned,
  fallbackDue,
  foundCheck,
  foundsInWeek,
  lastSizeChange,
  openPlaceRequests,
  openWishes,
  wishId,
} from '../src/build-rules.ts'
import { base } from './helpers/place-fixture.ts'

const place = (over: Record<string, unknown> = {}) => Place.parse({ ...base(), ...over })
const since = (iso: string, n: number, topics: string[] = ['lighthouses']) => Array.from({ length: n }, (_, i) => ({ topics, source: { fetchedAt: new Date(Date.parse(iso) + (i + 1) * 3_600_000).toISOString() } }))

describe('lastSizeChange (spec 2.5: since the place last changed size)', () => {
  it('is the newest found or expand line, not a tend', () => {
    const p = place({
      history: [
        { at: '2026-11-20T18:10:00+01:00', verb: 'found', summary: 'built' },
        { at: '2026-11-22T10:00:00Z', verb: 'expand', summary: 'a loft' },
        { at: '2026-11-25T10:00:00Z', verb: 'tend', summary: 'shelves' },
      ],
    })
    expect(lastSizeChange(p)).toBe(Date.parse('2026-11-22T10:00:00Z'))
  })

  it('is the founding day when the history has neither', () => {
    expect(lastSizeChange(place({ founded: '2026-11-11', history: [] }))).toBe(Date.parse('2026-11-11T00:00:00Z'))
  })
})

describe('expandAllowed (spec v4 2.2, the rails)', () => {
  it('allows an ordinary place, with no interest gate', () => {
    expect(expandAllowed(place(), null)).toEqual({ ok: true, reasons: [] })
  })
  it('refuses a closed place, a place under construction and the place expanded last', () => {
    const closed = place({ state: { ...base().state, closed: { at: '2026-11-21T10:00:00Z', reason: 'Quiet.' } } })
    expect(expandAllowed(closed, null).reasons.join(' ')).toMatch(/closed/)
    const building = place({ state: { construction: { kind: 'expand', finishesAt: '2026-12-01T10:00:00Z' }, lastCareAt: null, neglect: 0 } })
    expect(expandAllowed(building, null).reasons.join(' ')).toMatch(/construction/)
    expect(expandAllowed(place(), 'house-of-lights').reasons.join(' ')).toMatch(/last place/)
    expect(expandAllowed(place(), 'workshop').ok).toBe(true)
  })
})

describe('expandEarned (spec v4 2.2)', () => {
  const p = place()
  const fresh = since('2026-11-20T17:10:00Z', 3)
  // Each topic is its own family: the same answers as the old weight check.
  const fam = (weights: Record<string, number>) => Object.entries(weights).map(([name, weight]) => ({ name, weight, members: [name] }))
  const work = (added: string, ref = 'works/a') => ({ kind: 'work' as const, ref, added })
  const none = [] as ReturnType<typeof work>[]

  it('is earned by making when 3 works were added since the place last changed size, not with 2', () => {
    const three = [work('2026-11-21', 'works/a'), work('2026-11-22', 'works/b'), work('2026-11-23', 'works/c')]
    expect(expandEarned(p, fam({}), [], three)).toEqual({ earned: true, by: 'made', family: null, works: ['works/a', 'works/b', 'works/c'] })
    expect(expandEarned(p, fam({}), [], three.slice(0, 2)).earned).toBe(false)
  })
  it('does not count works added before the last size change, or souvenirs', () => {
    const old = [work('2026-11-01'), work('2026-11-02'), work('2026-11-03'), { kind: 'souvenir' as const, ref: 'souvenirs/a', added: '2026-11-22' }]
    expect(expandEarned(p, fam({}), [], old).earned).toBe(false)
  })

  it('is earned by reading when a family of 30 or more holds a tag and 3 souvenirs were kept (Roman, 14 November)', () => {
    expect(EXPAND_MIN_WEIGHT).toBe(30)
    expect(expandEarned(p, fam({ lighthouses: 30 }), fresh, none)).toEqual({ earned: true, by: 'read', family: 'lighthouses', works: [] })
  })
  it('refuses a family under 30, with only 2 souvenirs, or with souvenirs kept before the last size change', () => {
    expect(expandEarned(p, fam({ lighthouses: 29.9 }), fresh, none).earned).toBe(false)
    expect(expandEarned(p, fam({ lighthouses: 90 }), since('2026-11-20T17:10:00Z', 2), none).earned).toBe(false)
    expect(expandEarned(p, fam({ lighthouses: 90 }), [...since('2026-11-19T10:00:00Z', 3), ...since('2026-11-20T17:10:00Z', 2)], none).earned).toBe(false)
  })
  it('wants the same family to have both the weight and the souvenirs, and ignores case', () => {
    expect(expandEarned(p, fam({ lighthouses: 80, signals: 10 }), since('2026-11-20T17:10:00Z', 3, ['signals']), none).earned).toBe(false)
    expect(expandEarned(place({ tags: ['signals'] }), fam({ Signals: 70 }), since('2026-11-20T17:10:00Z', 3, ['SIGNALS']), none)).toMatchObject({ earned: true, family: 'Signals' })
  })
  it('counts the souvenirs of any member of a family, so related topics count together', () => {
    const family = [{ name: 'lidar', weight: 45, members: ['lidar', 'digital elevation model', 'forest canopy'] }]
    const kept = [...since('2026-11-20T17:10:00Z', 1, ['lidar']), ...since('2026-11-20T17:10:00Z', 1, ['forest canopy']), ...since('2026-11-20T17:10:00Z', 1, ['digital elevation model'])]
    expect(expandEarned(place({ tags: ['lidar'] }), family, kept, none)).toMatchObject({ earned: true, by: 'read', family: 'lidar' })
  })
  it('takes the heaviest qualifying family, the first by name on a tie', () => {
    const two = [...since('2026-11-20T17:10:00Z', 3, ['lighthouses']), ...since('2026-11-20T17:10:00Z', 3, ['signals'])]
    expect(expandEarned(p, fam({ lighthouses: 60, signals: 75 }), two, none).family).toBe('signals')
    expect(expandEarned(p, fam({ lighthouses: 60, signals: 60 }), two, none).family).toBe('lighthouses')
  })

  describe('the topics of what a place shows count as its tags (Roman, 14 November)', () => {
    const home = place({ tags: ['home'] })
    const shown = (topics: string[], placedIn: string | null = 'house-of-lights') => ({ topics, placedIn, source: { fetchedAt: '2026-11-19T10:00:00Z' } })
    const piled = (n: number, topic: string) => since('2026-11-20T17:10:00Z', n, [topic])
    it('lets a place be earned on a topic of something shown in it', () => {
      const f = { ...shown(['lidar']), source: { fetchedAt: '2026-11-21T10:00:00Z' } }
      expect(expandEarned(home, fam({ home: 0, lidar: 40 }), [f, ...piled(2, 'lidar')], none)).toMatchObject({ earned: true, family: 'lidar' })
    })
    it('does not count a topic of a souvenir that is in the pile or in another place', () => {
      expect(expandEarned(home, fam({ lidar: 90 }), [shown(['lidar'], null), shown(['lidar'], 'workshop'), ...piled(3, 'lidar')], none).earned).toBe(false)
    })
  })
})

describe('foundCheck (spec v4 2.3: the rails only)', () => {
  const standing = { tags: ['lighthouses'], state: { construction: null } }
  const input = (over: Record<string, unknown> = {}) => ({
    places: [standing],
    requests: [] as { kind: 'place' | 'gift'; status: 'open' | 'building' | 'built' | 'declined' | 'self-built' | 'withdrawn' }[],
    ...over,
  })

  it('allows a found with no strong interest at all, when the rails hold', () => {
    expect(foundCheck(input())).toEqual({ ok: true, reasons: [] })
  })

  it('refuses while a place from an earlier found is still being built, but not for an expand under way', () => {
    const founding = { tags: ['x'], state: { construction: { kind: 'found' } } }
    expect(foundCheck(input({ places: [standing, founding] })).reasons.join(' ')).toMatch(/still being built/)
    expect(foundCheck(input({ places: [standing, { tags: ['x'], state: { construction: { kind: 'expand' } } }] })).ok).toBe(true)
  })

  it('has no limit on open requests any more, and no interest, tag or streak condition', () => {
    const open = { kind: 'place' as const, status: 'open' as const }
    expect(foundCheck(input({ requests: [open, open, open] })).ok).toBe(true)
    expect(foundCheck(input({ places: [{ tags: ['Maya Lidar'], state: { construction: null } }] })).ok).toBe(true)
  })

  it('refuses when the world is full (64 places, open foundings included)', () => {
    const many = Array.from({ length: 64 }, () => standing)
    expect(foundCheck(input({ places: many })).ok).toBe(false)
    const near = Array.from({ length: 63 }, () => standing)
    expect(foundCheck(input({ places: near, requests: [{ kind: 'place', status: 'open' }] })).ok).toBe(false)
    expect(foundCheck(input({ places: near })).ok).toBe(true)
  })
})

describe('what is open, and the founds of the week', () => {
  it('open place requests are place requests that are open or building', () => {
    const r = [
      { kind: 'place', status: 'open' },
      { kind: 'place', status: 'building' },
      { kind: 'place', status: 'built' },
      { kind: 'gift', status: 'built' },
    ] as const
    expect(openPlaceRequests(r)).toHaveLength(2)
  })

  it('open wishes are open or building', () => {
    expect(openWishes([{ status: 'open' }, { status: 'building' }, { status: 'unanswered' }, { status: 'withdrawn' }])).toHaveLength(2)
  })

  it('counts the founds in the last 7 days', () => {
    const now = Date.parse('2026-11-13T12:00:00Z')
    expect(foundsInWeek(['2026-11-05T12:00:00Z', '2026-11-07T12:00:01Z', '2026-11-12T08:00:00Z'], now)).toBe(2)
    expect(foundsInWeek([], now)).toBe(0)
  })
})

describe('addWishes (spec 5.3, 10.3: wishing the same part again adds to its count; 5 open at most)', () => {
  const NOW = '2026-11-14T12:00:00Z'
  const draft = (name: string, forPlace: string | null = 'house-of-lights') => ({ name, description: `A ${name.toLowerCase()}.`, forPlace })
  const wish = (name: string, over: Record<string, unknown> = {}) => ({ id: wishId(name), name, description: `A ${name.toLowerCase()}.`, forPlace: null, count: 1, written: '2026-11-01T10:00:00Z', status: 'open' as const, statusAt: null, note: null, ...over })

  it('slugs a name into an id', () => {
    expect(wishId('Spiral staircase')).toBe('spiral-staircase')
    expect(wishId('  A Lamp -- for the HALL!  ')).toBe('a-lamp-for-the-hall')
    expect(wishId('!!!')).toBe('wish')
    expect(wishId('x'.repeat(60)).length).toBeLessThanOrEqual(40)
  })

  it('writes a new wish: count 1, open, dated, with the place it is for', () => {
    const r = addWishes([], [draft('Spiral staircase')], NOW)
    expect(r.wishes).toEqual([{ id: 'spiral-staircase', name: 'Spiral staircase', description: 'A spiral staircase.', forPlace: 'house-of-lights', count: 1, written: NOW, status: 'open', statusAt: null, note: null }])
    expect(r.dropped).toEqual([])
  })

  it('adds to the count when the same part is wished again, open or building, and keeps the rest of the wish', () => {
    const r = addWishes([wish('Spiral staircase', { count: 2, status: 'building', statusAt: '2026-11-05T10:00:00Z' })], [draft('spiral STAIRCASE')], NOW)
    expect(r.wishes).toHaveLength(1)
    expect(r.wishes[0]).toMatchObject({ id: 'spiral-staircase', count: 3, status: 'building', written: '2026-11-01T10:00:00Z', description: 'A spiral staircase.' })
  })

  it('counts a part wished twice in one call', () => {
    expect(addWishes([], [draft('Lamp'), draft('Lamp')], NOW).wishes).toEqual([expect.objectContaining({ id: 'lamp', count: 2 })])
  })

  it('files a new wish when the old one with that name is closed, under an id that is free', () => {
    const closed = [wish('Lamp', { status: 'built', statusAt: '2026-11-05T10:00:00Z' }), wish('Lamp', { id: 'lamp-2', status: 'unanswered', statusAt: '2026-11-06T10:00:00Z' })]
    const r = addWishes(closed, [draft('Lamp')], NOW)
    expect(r.wishes).toEqual([expect.objectContaining({ id: 'lamp-3', count: 1, status: 'open' })])
  })

  it('at 5 open, a new name is dropped but a wish that is already open still counts up', () => {
    expect(MAX_OPEN_WISHES).toBe(5)
    const five = ['A', 'B', 'C', 'D', 'E'].map((n) => wish(`Part ${n}`))
    const r = addWishes(five, [draft('Part C'), draft('Something new')], NOW)
    expect(r.wishes).toEqual([expect.objectContaining({ id: 'part-c', count: 2 })])
    expect(r.dropped).toEqual(['Something new'])
  })

  it('counts the wishes it adds in the same call against the 5', () => {
    const four = ['A', 'B', 'C', 'D'].map((n) => wish(`Part ${n}`))
    const r = addWishes(four, [draft('One'), draft('Two')], NOW)
    expect(r.wishes.map((w) => w.id)).toEqual(['one'])
    expect(r.dropped).toEqual(['Two'])
  })

  it('does not change what it was given', () => {
    const existing = [wish('Lamp')]
    const copy = JSON.stringify(existing)
    addWishes(existing, [draft('Lamp')], NOW)
    expect(JSON.stringify(existing)).toBe(copy)
  })
})

describe('fallbackDue (spec v4 2.3: the kit build is due as soon as the founding is written)', () => {
  const written = '2026-11-01T10:00:00Z'
  const at = (days: number, extra = 0) => Date.parse(written) + days * 86_400_000 + extra
  const req = (status: 'open' | 'building' | 'built' | 'declined' | 'self-built' | 'withdrawn', kind: 'place' | 'gift' = 'place') => ({ kind, status, written })

  it('is due the moment an open place request is written', () => {
    expect(FALLBACK_DAYS).toBe(0)
    expect(fallbackDue(req('open'), at(0))).toBe(true)
    expect(fallbackDue(req('open'), at(0, -1))).toBe(false)
    expect(fallbackDue(req('open'), at(30))).toBe(true)
  })

  it('is not held off by the old status building', () => {
    expect(fallbackDue(req('building'), at(0))).toBe(true)
  })

  it('is never due for an answered, declined, withdrawn or self-built request, or for a gift', () => {
    for (const s of ['built', 'declined', 'self-built', 'withdrawn'] as const) expect(fallbackDue(req(s), at(60)), s).toBe(false)
    expect(fallbackDue(req('open', 'gift'), at(60))).toBe(false)
  })
})
