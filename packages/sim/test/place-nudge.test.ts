import { describe, expect, it } from 'vitest'
import { neglectedPlaces, placeNovelty, repeatedPlaces, stuckInOnePlace, type PlaceNudgeStep } from '../src/place-nudge.ts'

const DAY = 86_400_000
const NOW = Date.parse('2026-11-20T12:00:00Z')
const SINCE = NOW - 7 * DAY

const place = (id: string, name: string, purpose: string, founded: string, lastCareAt: string | null = null) => ({ id, name, purpose, founded, lastCareAt })
const home = place('home', 'Home', 'Where my days start and end: a desk to read and write at, a bed, a shelf.', '2026-11-01', '2026-11-19T10:00:00Z')
const hall = place('lantern-hall', 'Lantern Hall', 'Where I keep the lidar finds, each under its own lamp', '2026-11-05', '2026-11-19T10:00:00Z')
const step = (at: string, verb: string, targetId?: string): PlaceNudgeStep => ({ at, verb, ...(targetId ? { targetId } : {}) })

describe('the repeated-place nudge (spec 12.3): a new place whose name is over 0.5, or purpose over 0.4, like an existing one', () => {
  it('fires for a new place with the name of an existing one', () => {
    const copy = place('lantern-hall-2', 'Lantern Hall', 'A tower for the tide gauge readings', '2026-11-18')
    expect(repeatedPlaces([home, hall, copy], [], { sinceMs: SINCE })).toEqual([{ id: 'lantern-hall-2', why: 'its name is like an existing place' }])
  })

  it('fires for a new place whose purpose is over 0.4 like an existing purpose', () => {
    const copy = place('lamp-hall', 'Lamp Hall', 'Where I keep the lidar finds, each under a small lamp', '2026-11-18')
    expect(repeatedPlaces([home, hall, copy], [], { sinceMs: SINCE }).map((n) => n.why)).toEqual(['its purpose is like an existing place'])
  })

  it('does not fire for a place that is unlike the others', () => {
    const tower = place('bell-tower', 'Bell Tower', 'A tower for the tide gauge readings', '2026-11-18')
    expect(repeatedPlaces([home, hall, tower], [], { sinceMs: SINCE })).toEqual([])
  })

  it('reports only places founded since the window, though it compares with every earlier one', () => {
    const old = place('lantern-hall-2', 'Lantern Hall', 'Another purpose entirely', '2026-10-01')
    const early = place('lantern-hall', 'Lantern Hall', 'Where I keep the lidar finds', '2026-09-01')
    expect(repeatedPlaces([early, old], [], { sinceMs: SINCE })).toEqual([])
    const fresh = place('lantern-hall-3', 'Lantern Hall', 'Yet another', '2026-11-19')
    expect(repeatedPlaces([early, old, fresh], [], { sinceMs: SINCE }).map((n) => n.id)).toEqual(['lantern-hall-3'])
  })

  it('never compares a place with one founded after it, and the first place cannot repeat anything', () => {
    const a = place('a-hall', 'Lantern Hall', 'Where I keep the lidar finds, each under its own lamp', '2026-11-18')
    const b = place('b-hall', 'Lantern Hall', 'Where I keep the lidar finds, each under its own lamp', '2026-11-19')
    // Both its name and its purpose repeat, so it is named twice, once for each reason.
    const named = repeatedPlaces([a, b], [], { sinceMs: SINCE })
    expect([...new Set(named.map((n) => n.id))]).toEqual(['b-hall'])
    expect(named.map((n) => n.why).sort()).toEqual(['its name is like an existing place', 'its purpose is like an existing place'])
  })

  it('also looks at a request written in the window, against the places that exist, and ignores an old one', () => {
    const fresh = { id: 'lantern-yard', kind: 'place' as const, name: 'Lantern Hall', purpose: 'Something else', written: '2026-11-19T10:00:00Z' }
    const old = { ...fresh, id: 'old-one', written: '2026-10-01T10:00:00Z' }
    expect(repeatedPlaces([home, hall], [fresh, old], { sinceMs: SINCE })).toEqual([{ id: 'request:lantern-yard', why: 'its name is like an existing place' }])
  })

  it('leaves a gift alone: Merge did not choose its name', () => {
    const gift = { id: 'sundial', kind: 'gift' as const, name: 'Lantern Hall', purpose: 'x', written: '2026-11-19T10:00:00Z' }
    expect(repeatedPlaces([home, hall], [gift], { sinceMs: SINCE })).toEqual([])
  })
})

describe('the repeated-place nudge leaves out what Merge did not choose and what it just built (spec 12.3)', () => {
  const at = (p: ReturnType<typeof place>, chunk: [number, number]) => ({ ...p, chunk })
  const request = (over: Record<string, unknown> = {}) => ({ id: 'lantern-hall', kind: 'place' as const, name: 'Lantern Hall', purpose: 'Where I keep the lidar finds', written: '2026-11-18T10:00:00Z', chunk: [1, 0] as [number, number], ...over })

  it('does not count a request as a repeat of the place that was built from it', () => {
    // Roman built it on the staked chunk, taking the request's name: the place is the answer, not a copy.
    expect(repeatedPlaces([home, at(hall, [1, 0])], [request()], { sinceMs: SINCE })).toEqual([])
  })

  it('still counts a request whose name is like a place on another chunk', () => {
    expect([...new Set(repeatedPlaces([home, at(hall, [2, 0])], [request()], { sinceMs: SINCE }).map((n) => n.id))]).toEqual(['request:lantern-hall'])
  })

  it('does not report a place Roman gave: Merge did not choose it', () => {
    const gift = at(place('lantern-hall-2', 'Lantern Hall', 'Where I keep the lidar finds, each under its own lamp', '2026-11-19'), [3, 0])
    const filed = request({ id: 'lantern-hall-2', kind: 'gift', chunk: [3, 0], written: '2026-11-19T10:00:00Z' })
    expect(repeatedPlaces([home, hall, gift], [filed], { sinceMs: SINCE })).toEqual([])
    // The same place with no gift filed for its chunk is a repeat.
    expect(repeatedPlaces([home, hall, gift], [], { sinceMs: SINCE }).map((n) => n.id)).toContain('lantern-hall-2')
  })

  it('counts a place founded exactly 7 days ago, and not one founded the day before', () => {
    const edge = place('edge', 'Lantern Hall', 'x', '2026-11-13')
    const before = place('before', 'Lantern Hall', 'x', '2026-11-12')
    // The window opens at the start of a day (a place's founding date has no time of day).
    const since = Date.parse('2026-11-13T00:00:00Z')
    expect([...new Set(repeatedPlaces([home, hall, edge], [], { sinceMs: since }).map((n) => n.id))]).toEqual(['edge'])
    expect(repeatedPlaces([home, hall, before], [], { sinceMs: since })).toEqual([])
  })
})

describe('the stuck-in-one-place nudge: a place other than Home is the target of more than 3 steps in a day', () => {
  const ids = ['home', 'workshop', 'lantern-hall']
  const four = (target: string, day = '2026-11-19') => ['08:00', '09:00', '10:00', '11:00'].map((t) => step(`${day}T${t}:00Z`, 'tend', target))

  it('fires for 4 steps on one place in a day, and not for 3', () => {
    expect(stuckInOnePlace(four('lantern-hall'), ids, { sinceMs: SINCE })).toEqual([{ id: 'lantern-hall', day: '2026-11-19', count: 4 }])
    expect(stuckInOnePlace(four('lantern-hall').slice(0, 3), ids, { sinceMs: SINCE })).toEqual([])
  })

  it('does not fire for Home, which Merge lives in', () => {
    expect(stuckInOnePlace(four('home'), ids, { sinceMs: SINCE })).toEqual([])
  })

  it('counts a day at a time, and each place on its own', () => {
    const spread = [...four('lantern-hall').slice(0, 2), ...four('lantern-hall', '2026-11-18').slice(0, 2), ...four('workshop').slice(0, 2)]
    expect(stuckInOnePlace(spread, ids, { sinceMs: SINCE })).toEqual([])
  })

  it('counts a target that is not a place id as nothing, and ignores steps before the window', () => {
    expect(stuckInOnePlace(four('lidar'), ids, { sinceMs: SINCE })).toEqual([])
    expect(stuckInOnePlace(four('lantern-hall', '2026-11-01'), ids, { sinceMs: SINCE })).toEqual([])
  })

  it('reads a day in the forkling’s own time zone when it is given the way to', () => {
    const late = [22, 23].flatMap((h) => [step(`2026-11-19T${h}:00:00Z`, 'tend', 'lantern-hall'), step(`2026-11-19T${h}:30:00Z`, 'tend', 'lantern-hall')])
    const stockholm = (iso: string) => new Date(Date.parse(iso) + 3_600_000).toISOString().slice(0, 10)
    expect(stuckInOnePlace(late, ids, { sinceMs: SINCE })).toEqual([{ id: 'lantern-hall', day: '2026-11-19', count: 4 }])
    // The last two fall after midnight in Stockholm, so there are two days of two steps each.
    expect(stuckInOnePlace(late, ids, { sinceMs: SINCE, dayOf: stockholm })).toEqual([])
  })
})

describe('the weekend-revisit nudge: a place at neglect 1 or more has had no care all week', () => {
  it('lists the places left alone for 7 days or more, and not the ones cared for this week', () => {
    const quiet = { ...hall, lastCareAt: '2026-11-12T10:00:00Z' }
    expect(neglectedPlaces([home, quiet], NOW)).toEqual(['lantern-hall'])
    expect(neglectedPlaces([home, hall], NOW)).toEqual([])
  })

  it('counts Home too, which is capped at level 1 and still has no care that week', () => {
    expect(neglectedPlaces([{ ...home, lastCareAt: '2026-11-05T10:00:00Z' }], NOW)).toEqual(['home'])
  })

  it('counts a place never cared for from the day it was founded', () => {
    expect(neglectedPlaces([place('bare', 'Bare Hall', 'x', '2026-11-01')], NOW)).toEqual(['bare'])
  })
})

describe('placeNovelty (the week block in mind/health.json)', () => {
  it('adds up what would have fired, per nudge', () => {
    const copy = place('lantern-hall-2', 'Lantern Hall', 'A tower for the tide gauge readings', '2026-11-18')
    const quiet = { ...hall, lastCareAt: '2026-11-12T10:00:00Z' }
    const steps = ['08', '09', '10', '11'].map((h) => step(`2026-11-19T${h}:00:00Z`, 'tend', 'lantern-hall'))
    const out = placeNovelty({ places: [home, quiet, copy], requests: [], steps, nowMs: NOW, sinceMs: SINCE })
    expect(out).toEqual({ wouldFire: 3, repeatedPlace: 1, stuckInOnePlace: 1, weekendRevisit: 1 })
  })

  it('is all zeros for a quiet world', () => {
    expect(placeNovelty({ places: [home], requests: [], steps: [], nowMs: NOW, sinceMs: SINCE })).toEqual({ wouldFire: 0, repeatedPlace: 0, stuckInOnePlace: 0, weekendRevisit: 0 })
  })
})
