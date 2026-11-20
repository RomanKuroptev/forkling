import { describe, expect, it } from 'vitest'
import { Place } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { placeCentre, toLandPlace } from '@forkling/sim'
import { reachedRoom, routePoints, stairRoute, stairsFindings } from '../../src/world/stairs.ts'
import { solidParts } from '../../src/world/bump.ts'
import type { SceneObject } from '../../src/world/open.ts'

/** Grown Place 10 of day-30, as the fixture now builds it: 12 by 10, two floors, stairs along the left wall of the ground room. */
const tall = (stairs = true): Place =>
  Place.parse({
    id: 'grown-place-10',
    name: 'Grown Place 10',
    purpose: 'Two floors.',
    tags: ['places'],
    founded: '2026-12-15',
    chunk: [1, -2],
    offset: [0, 0],
    related: [],
    paths: [],
    exterior: { style: 'stone', footprint: [12, 10], floors: 2, palette: 'paper', sign: 'GROWN PLACE 10' },
    rooms: [
      { id: 'main-room', name: 'Grown Room 10a', size: [11, 9, 3], at: [0, 0], floor: 0, parts: stairs ? [{ part: 'door-wood', at: [0, 0, 4.4], rot: 0 }, { part: 'stairs', at: [-4.55, 0, -1.7], rot: 0 }] : [{ part: 'door-wood', at: [0, 0, 4.4], rot: 0 }] },
      { id: 'upper-room', name: 'Grown Room 10b', size: [11, 9, 3], at: [0, 0], floor: 1, parts: [] },
    ],
    exhibits: [],
    state: { construction: null, lastCareAt: '2026-12-15T10:00:00Z', neglect: 0, lamps: true, closed: null },
    away: [],
    history: [],
  })

describe('every room upstairs has a way up, and a visitor gets there (issue 333; audit QW.2)', () => {
  it('finds nothing in a place whose upper room has stairs below it', () => {
    expect(stairsFindings('test', [tall()], kit)).toEqual([])
  })

  it('planted: an upper room with no stairs below it is a major finding on its place file', () => {
    const found = stairsFindings('day-30', [tall(false)], kit)
    expect(found.map((f) => f.fingerprint)).toEqual(['world.upper-room-no-stairs|day-30|grown-place-10/upper-room'])
    expect(found[0]).toMatchObject({ severity: 'major', fixKind: 'data', where: 'places/grown-place-10.json' })
    expect(found[0]!.what).toMatch(/nothing leads up to it/)
  })

  it('walks to an upper room by its stairs: in front of the foot, then past the top step', () => {
    const route = stairRoute(tall(), 'upper-room', kit)
    expect(route).toHaveLength(1)
    const [px, pz] = placeCentre(toLandPlace(tall()))
    const [leg] = routePoints(tall(), route!)
    expect(leg!.stand.x).toBeCloseTo(px - 4.55)
    expect(leg!.stand.z).toBeCloseTo(pz - 1.7 - 1.5 - 0.8)
    expect(leg!.top.z).toBeGreaterThan(pz - 1.7 + 1.5)
    expect(stairRoute(tall(), 'main-room', kit)).toEqual([])
    expect(stairRoute(tall(false), 'upper-room', kit)).toBeNull()
  })

  it('planted: a visitor under the upper room, on the ground floor, has not reached it; one on its floor has (walk-to measured only x and z)', () => {
    const room = { min: [42.5, 3, -52.5] as [number, number, number], max: [53.5, 6, -43.5] as [number, number, number] }
    // Ground floor: the capsule's middle about a metre over the ground.
    expect(reachedRoom({ x: 48, y: 1, z: -48 }, room)).toBe(false)
    expect(reachedRoom({ x: 48, y: 4, z: -48 }, room)).toBe(true)
    expect(reachedRoom({ x: 41, y: 4, z: -48 }, room)).toBe(false)
  })

  it('the stairs are walked up, not bumped into: the furniture walk leaves them out', () => {
    const room: SceneObject = { id: 'grown-place-10/main-room', kind: 'room', place: 'grown-place-10', box: { min: [42.5, 0, -52.5], max: [53.5, 3, -43.5] }, visible: true, material: 'solid' }
    const part = (k: number, name: string, min: [number, number, number], max: [number, number, number]): SceneObject => ({ id: `grown-place-10/main-room/${k}`, kind: 'part', place: 'grown-place-10', name, box: { min, max }, visible: true, material: 'solid' })
    expect(solidParts([room, part(1, 'stairs', [42.85, 0, -51.2], [44.05, 3, -48.2]), part(2, 'cabinet', [51, 0, -52], [52, 1.8, -51.5])]).map((p) => p.name)).toEqual(['cabinet'])
  })
})
