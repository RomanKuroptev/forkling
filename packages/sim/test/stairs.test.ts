import { describe, expect, it } from 'vitest'
import { kit } from '@forkling/schema/kit'
import type { Place } from '@forkling/schema'
import { rectMinus, stairFlights, storeyHeight, upperRoomWithoutStairs, type Rect } from '../src/stairs.ts'

/** A two-floor house, 12 by 10, a ground room and an upper room the same size, with stairs along the left wall climbing to the front. */
const house = (stairs: { at: [number, number, number]; rot: number } | null = { at: [-4.55, 0, -0.8], rot: 0 }, upperAt: [number, number] = [0, 0]): Place =>
  ({
    id: 'tall-house',
    name: 'Tall House',
    purpose: 'Two floors.',
    tags: ['places'],
    founded: '2026-11-20',
    chunk: [1, 0],
    offset: [0, 0],
    related: [],
    paths: [],
    exterior: { style: 'stone', footprint: [12, 10], floors: 2, palette: 'paper', sign: 'TALL HOUSE' },
    rooms: [
      { id: 'ground', name: 'Ground', size: [11, 9, 3], at: [0, 0], floor: 0, parts: stairs ? [{ part: 'desk', at: [3, 0, -3], rot: 0 }, { part: 'stairs', ...stairs }] : [{ part: 'desk', at: [3, 0, -3], rot: 0 }] },
      { id: 'upper', name: 'Upper', size: [5, 4, 3], at: upperAt, floor: 1, parts: [] },
    ],
    exhibits: [],
    state: { construction: null, lastCareAt: '2026-11-21T19:40:00+01:00', neglect: 0, lamps: true, closed: null },
    away: [],
    history: [],
  }) as unknown as Place

describe('the stairs between floors (issue 333)', () => {
  it('a storey is as tall as the tallest room, at least 2.4 m', () => {
    expect(storeyHeight(house())).toBe(3)
    expect(storeyHeight({ rooms: [{ size: [2, 2, 2] }] } as never)).toBe(2.4)
  })

  it('a stairs part on a floor with a floor above is a flight: it climbs the way it faces (+z at rot 0) by one storey', () => {
    const [f] = stairFlights(house(), kit)
    expect(f).toMatchObject({ room: 'ground', part: 1, floor: 0, width: 1.2, run: 3, rise: 3 })
    expect(f!.foot[0]).toBeCloseTo(-4.55)
    expect(f!.foot[1]).toBeCloseTo(-2.3)
    expect(f!.top[0]).toBeCloseTo(-4.55)
    expect(f!.top[1]).toBeCloseTo(0.7)
    expect(f!.well).toEqual({ x0: expect.closeTo(-5.15), x1: expect.closeTo(-3.95), z0: expect.closeTo(-2.3), z1: expect.closeTo(0.7) })
  })

  it('turned a quarter, the flight climbs toward +x; turned a half, toward -z', () => {
    const quarter = stairFlights(house({ at: [0, 0, 0], rot: Math.PI / 2 }), kit)[0]!
    expect(quarter.top[0]).toBeCloseTo(1.5)
    expect(quarter.foot[0]).toBeCloseTo(-1.5)
    expect(quarter.well.z1 - quarter.well.z0).toBeCloseTo(1.2)
    const half = stairFlights(house({ at: [0, 0, 0], rot: Math.PI }), kit)[0]!
    expect(half.top[1]).toBeCloseTo(-1.5)
  })

  it('stairs on the top floor lead nowhere and are no flight', () => {
    const p = house()
    p.rooms[1]!.parts.push({ part: 'stairs', at: [0, 0, 0], rot: 0 })
    expect(stairFlights(p, kit).map((f) => f.room)).toEqual(['ground'])
  })

  it('a room on floor 1 or above with no stairs below it has a reason; one with the top of a flight under it has none', () => {
    const upper = (p: Place) => p.rooms[1]!
    expect(upperRoomWithoutStairs(house(null), upper(house(null)), kit)).toMatch(/upper is on floor 1 and nothing leads up to it: put a stairs part in a room on floor 0/)
    // The stairs top out at (-4.55, 0.7); the upper room at (-3, 0), 5 by 4, reaches from -5.5 to -0.5 across: it is over the top.
    expect(upperRoomWithoutStairs(house(undefined, [-3, 0]), upper(house(undefined, [-3, 0])), kit)).toBeNull()
    // The same room on the other side of the house is not reached by them.
    expect(upperRoomWithoutStairs(house(undefined, [3, 0]), upper(house(undefined, [3, 0])), kit)).toMatch(/nothing leads up/)
    // A ground room needs none.
    expect(upperRoomWithoutStairs(house(null), house(null).rooms[0]!, kit)).toBeNull()
  })

  it('a floor slab with a stairwell cut out of it is the rest of the slab, in pieces that do not overlap', () => {
    const slab: Rect = { x0: -5, x1: 5, z0: -4, z1: 4 }
    const well: Rect = { x0: -5, x1: -3.8, z0: -2, z1: 1 }
    const pieces = rectMinus(slab, [well])
    const area = (r: Rect) => (r.x1 - r.x0) * (r.z1 - r.z0)
    expect(pieces.reduce((n, r) => n + area(r), 0)).toBeCloseTo(area(slab) - area(well))
    for (const r of pieces) expect(Math.min(r.x1, well.x1) - Math.max(r.x0, well.x0) <= 1e-9 || Math.min(r.z1, well.z1) - Math.max(r.z0, well.z0) <= 1e-9).toBe(true)
    for (const [i, a] of pieces.entries()) for (const b of pieces.slice(i + 1)) expect(Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) <= 1e-9 || Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) <= 1e-9).toBe(true)
    expect(rectMinus(slab, [])).toEqual([slab])
    // A well partly outside the slab only cuts what it covers.
    expect(rectMinus(slab, [{ x0: -6, x1: -4, z0: -5, z1: 5 }])).toEqual([{ x0: -4, x1: 5, z0: -4, z1: 4 }])
  })
})
