import { describe, expect, it } from 'vitest'
import { MAX_OPEN_WISHES, Place } from '@forkling/schema'
import {
  FOUND_STREAK_DAYS,
  WAKE_TOP_MIN,
  addWishes,
  expandCheck,
  foundCheck,
  foundsInWeek,
  lastSizeChange,
  openPlaceRequests,
  openWishes,
  recordWake,
  wishId,
  type WakeSnapshot,
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

describe('expandCheck (spec 2.5)', () => {
  const p = place()
  const fresh = since('2026-11-20T17:10:00Z', 3)

  it('allows an expand when a tag has weight 50 and 3 souvenirs on it were kept since', () => {
    expect(expandCheck(p, { lighthouses: 50 }, fresh)).toEqual({ ok: true, tag: 'lighthouses', reasons: [] })
  })

  it('refuses a tag under 50', () => {
    const r = expandCheck(p, { lighthouses: 49, signals: 10 }, fresh)
    expect(r.ok).toBe(false)
    expect(r.reasons.join(' ')).toMatch(/weight 50/)
  })

  it('refuses with only 2 souvenirs, and ignores souvenirs kept before the last change in size', () => {
    expect(expandCheck(p, { lighthouses: 90 }, since('2026-11-20T17:10:00Z', 2)).ok).toBe(false)
    const old = since('2026-11-19T10:00:00Z', 3)
    const r = expandCheck(p, { lighthouses: 90 }, [...old, ...since('2026-11-20T17:10:00Z', 2)])
    expect(r.ok).toBe(false)
    expect(r.reasons.join(' ')).toMatch(/3 souvenirs/)
  })

  it('wants the same tag to have both the weight and the souvenirs', () => {
    const r = expandCheck(p, { lighthouses: 80, signals: 10 }, since('2026-11-20T17:10:00Z', 3, ['signals']))
    expect(r.ok).toBe(false)
  })

  it('takes the other tag when the first does not qualify, and matches tags without caring about case', () => {
    const r = expandCheck(p, { lighthouses: 20, signals: 70 }, since('2026-11-20T17:10:00Z', 3, ['Signals']))
    expect(r).toMatchObject({ ok: true, tag: 'signals' })
  })

  it('counts a souvenir with two topics once for each tag it carries', () => {
    const r = expandCheck(p, { signals: 60 }, since('2026-11-20T17:10:00Z', 3, ['lighthouses', 'signals']))
    expect(r.ok).toBe(true)
  })

  it('picks the heaviest qualifying tag, and the first by name on a tie, so the same world gives the same answer', () => {
    const two = [...since('2026-11-20T17:10:00Z', 3, ['lighthouses']), ...since('2026-11-20T17:10:00Z', 3, ['signals'])]
    expect(expandCheck(p, { lighthouses: 60, signals: 75 }, two).tag).toBe('signals')
    expect(expandCheck(p, { lighthouses: 60, signals: 60 }, two).tag).toBe('lighthouses')
  })

  it('refuses a place under construction, with that reason', () => {
    const r = expandCheck(place({ state: { construction: { kind: 'expand', finishesAt: '2026-12-01T10:00:00Z' }, lastCareAt: null, neglect: 0 } }), { lighthouses: 90 }, fresh)
    expect(r.ok).toBe(false)
    expect(r.reasons.join(' ')).toMatch(/construction/)
  })

  it('says every reason at once', () => {
    const r = expandCheck(place({ state: { construction: { kind: 'found', finishesAt: '2026-12-01T10:00:00Z' }, lastCareAt: null, neglect: 0 } }), {}, [])
    expect(r.reasons.length).toBeGreaterThanOrEqual(2)
  })
})

describe('recordWake (the weights at wake that the 3-day rule reads)', () => {
  it('keeps only the interests at 70 or more', () => {
    expect(WAKE_TOP_MIN).toBe(70)
    expect(recordWake([], '2026-11-13', { 'maya lidar': 82, tides: 69, knots: 70 })).toEqual([{ date: '2026-11-13', topics: { 'maya lidar': 82, knots: 70 } }])
  })

  it('replaces the same date, so a second morning tick changes nothing new', () => {
    const once = recordWake([], '2026-11-13', { a: 80 })
    expect(recordWake(once, '2026-11-13', { a: 85 })).toEqual([{ date: '2026-11-13', topics: { a: 85 } }])
  })

  it('keeps the last 3 dates, oldest dropped, in date order', () => {
    let w: WakeSnapshot[] = []
    for (const d of ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']) w = recordWake(w, d, { a: 80 })
    expect(w.map((s) => s.date)).toEqual(['2026-11-11', '2026-11-12', '2026-11-13'])
  })

  it('records a day with nothing at 70 (it breaks a streak)', () => {
    expect(recordWake([], '2026-11-13', { a: 10 })).toEqual([{ date: '2026-11-13', topics: {} }])
  })
})

describe('foundCheck (spec 2.5, 10.3)', () => {
  const days = (topic: string, weights: [number, number, number]): WakeSnapshot[] =>
    [['2026-11-11', weights[0]], ['2026-11-12', weights[1]], ['2026-11-13', weights[2]]].map(([date, w]) => ({ date: date as string, topics: (w as number) >= 70 ? { [topic]: w as number } : {} }))
  const input = (over: Record<string, unknown> = {}) => ({
    today: '2026-11-13',
    wakeTop: days('maya lidar', [75, 80, 82]),
    places: [{ tags: ['lighthouses'] }],
    requests: [] as { kind: 'place' | 'gift'; status: 'open' | 'building' | 'built' | 'declined' | 'self-built' | 'withdrawn'; tags: string[] }[],
    ...over,
  })

  it('allows a found for an interest at 70 or more on 3 days in a row that no place carries', () => {
    expect(FOUND_STREAK_DAYS).toBe(3)
    expect(foundCheck(input())).toEqual({ ok: true, interest: 'maya lidar', reasons: [] })
  })

  it('wants every one of the 3 days: a dip, a gap or only 2 days refuses', () => {
    expect(foundCheck(input({ wakeTop: days('maya lidar', [75, 60, 82]) })).ok).toBe(false)
    expect(foundCheck(input({ wakeTop: days('maya lidar', [75, 80, 82]).slice(1) })).ok).toBe(false)
    const gap = [{ date: '2026-11-10', topics: { 'maya lidar': 80 } }, ...days('maya lidar', [75, 80, 82]).slice(1)]
    expect(foundCheck(input({ wakeTop: gap })).ok).toBe(false)
  })

  it('refuses an interest a place already carries as a tag, and one an open request already asks for', () => {
    expect(foundCheck(input({ places: [{ tags: ['Maya Lidar'] }] })).ok).toBe(false)
    expect(foundCheck(input({ requests: [{ kind: 'place', status: 'open', tags: ['maya lidar'] }] })).ok).toBe(false)
    expect(foundCheck(input({ requests: [{ kind: 'place', status: 'built', tags: ['maya lidar'] }] })).ok).toBe(true)
  })

  it('refuses with 2 place requests open, and counts building as open', () => {
    const open = { kind: 'place' as const, status: 'open' as const, tags: ['x'] }
    expect(foundCheck(input({ requests: [open, { ...open, status: 'building' as const, tags: ['y'] }] })).ok).toBe(false)
    expect(foundCheck(input({ requests: [open] })).ok).toBe(true)
  })

  it('refuses when the world is full (64 places, open requests included)', () => {
    const many = Array.from({ length: 64 }, () => ({ tags: ['z'] }))
    expect(foundCheck(input({ places: many })).ok).toBe(false)
    const near = Array.from({ length: 63 }, () => ({ tags: ['z'] }))
    expect(foundCheck(input({ places: near, requests: [{ kind: 'place', status: 'open', tags: ['q'] }] })).ok).toBe(false)
  })

  it('chooses the heaviest interest today, the first by name on a tie', () => {
    const wakeTop = [11, 12, 13].map((d) => ({ date: `2026-11-${d}`, topics: { 'maya lidar': 80, knots: d === 13 ? 90 : 75 } }))
    expect(foundCheck(input({ wakeTop })).interest).toBe('knots')
    const tie = [11, 12, 13].map((d) => ({ date: `2026-11-${d}`, topics: { b: 80, a: 80 } }))
    expect(foundCheck(input({ wakeTop: tie })).interest).toBe('a')
  })

  it('says why, in plain words', () => {
    expect(foundCheck(input({ wakeTop: [] })).reasons.join(' ')).toMatch(/70 or more on 3 days in a row/)
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
