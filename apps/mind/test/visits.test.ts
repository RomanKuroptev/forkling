import { describe, expect, it } from 'vitest'
import { addVisits, createVisitCounter, MAX_HITS_BETWEEN_DRAINS, visitFromQuery, visitsForPrompt } from '../src/visits.ts'

/** Issue #422: a visitor who leaves no note was invisible to Merge. The viewer's poll of now.json says when a visit starts and where it walks; nothing else. */
describe('visitFromQuery: what a poll of now.json says', () => {
  it('reads a new visit and a place id, and nothing else', () => {
    expect(visitFromQuery(new URLSearchParams('visit=1&in=home'))).toEqual({ visit: true, place: 'home' })
    expect(visitFromQuery(new URLSearchParams('in=workshop'))).toEqual({ visit: false, place: 'workshop' })
    expect(visitFromQuery(new URLSearchParams(''))).toBeNull()
  })
  it('drops a place that is not a place id', () => {
    expect(visitFromQuery(new URLSearchParams('in=<script>'))).toBeNull()
    expect(visitFromQuery(new URLSearchParams(`in=${'a'.repeat(100)}`))).toBeNull()
    expect(visitFromQuery(new URLSearchParams('visit=1&in=Home Sweet'))).toEqual({ visit: true, place: null })
  })
})

describe('createVisitCounter: counts between two ticks, no address and no id kept', () => {
  it('counts visits and places, and a drain empties it', () => {
    const c = createVisitCounter()
    c.record({ visit: true, place: 'home' })
    c.record({ visit: true, place: null })
    c.record({ visit: false, place: 'home' })
    c.record({ visit: false, place: 'workshop' })
    expect(c.drain()).toEqual({ visitors: 2, places: { home: 2, workshop: 1 } })
    expect(c.drain()).toEqual({ visitors: 0, places: {} })
  })
  it('stops counting past its bound, so a flood cannot grow it', () => {
    const c = createVisitCounter()
    for (let n = 0; n < MAX_HITS_BETWEEN_DRAINS + 50; n++) c.record({ visit: true, place: `p-${n}` })
    const out = c.drain()
    expect(out.visitors).toBe(MAX_HITS_BETWEEN_DRAINS)
    expect(Object.keys(out.places).length).toBeLessThanOrEqual(64)
  })
})

describe('addVisits: the day so far, in the mind state', () => {
  it('adds to today, starts again on a new day, and keeps only places that exist', () => {
    const one = addVisits(undefined, { visitors: 2, places: { home: 2, gone: 1 } }, '2026-11-20', ['home', 'workshop'])
    expect(one).toEqual({ date: '2026-11-20', visitors: 2, places: { home: 2 } })
    const two = addVisits(one, { visitors: 1, places: { workshop: 1, home: 1 } }, '2026-11-20', ['home', 'workshop'])
    expect(two).toEqual({ date: '2026-11-20', visitors: 3, places: { home: 3, workshop: 1 } })
    expect(addVisits(two, { visitors: 0, places: {} }, '2026-11-21', ['home'])).toEqual({ date: '2026-11-21', visitors: 0, places: {} })
  })
  it('leaves the state as it is when nothing came and the day is the same', () => {
    const state = { date: '2026-11-20', visitors: 1, places: { home: 1 } }
    expect(addVisits(state, { visitors: 0, places: {} }, '2026-11-20', ['home'])).toBe(state)
  })
})

describe('visitsForPrompt: what the plan is shown', () => {
  it('is today, most visited place first; yesterday counts as nobody today', () => {
    expect(visitsForPrompt({ date: '2026-11-20', visitors: 3, places: { workshop: 1, home: 3 } }, '2026-11-20')).toEqual({ visitors: 3, places: [{ id: 'home', count: 3 }, { id: 'workshop', count: 1 }] })
    expect(visitsForPrompt({ date: '2026-11-19', visitors: 3, places: { home: 3 } }, '2026-11-20')).toEqual({ visitors: 0, places: [] })
    expect(visitsForPrompt(undefined, '2026-11-20')).toEqual({ visitors: 0, places: [] })
  })
})
