import { describe, expect, it } from 'vitest'
import { PlaceRequest } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { createLand } from '../src/land.ts'
import { FIXTURE_NOW, makeFixtureWorld } from '../src/fixture-world.ts'
import { layoutProblems, MAX_PLACES, toLandPlace } from '../src/land.ts'
import { neglectFor } from '../src/neglect.ts'
import { validatePlace } from '../src/validate-place.ts'

const ctxOf = (world: ReturnType<typeof makeFixtureWorld>) => ({ kit, exists: (path: string) => path in world.souvenirs, souvenirKind: (path: string) => world.souvenirs[path] })

describe('the fixture world (10 places and their paths, for the viewer, the site and the render budget)', () => {
  const world = makeFixtureWorld(1, 10)

  it('has 10 places, Home and the Workshop first', () => {
    expect(world.places).toHaveLength(10)
    expect(world.places.slice(0, 2).map((p) => p.id)).toEqual(['home', 'workshop'])
    expect(new Set(world.places.map((p) => p.id)).size).toBe(10)
  })

  it('stands every place on the land by the rules (one per chunk, connected, inside its chunk)', () => {
    expect(layoutProblems(world.places.map(toLandPlace))).toEqual([])
  })

  it('has places that are all valid files, exhibits pointing at souvenirs the world has', () => {
    for (const place of world.places) expect(validatePlace(place, ctxOf(world)), place.id).toEqual([])
    expect(world.places.flatMap((p) => p.exhibits).length).toBeGreaterThan(10)
  })

  it('joins every place but the clearing\'s to the rest by a path', () => {
    const founding = world.paths.filter((p) => p.kind === 'founding')
    expect(founding).toHaveLength(8)
    const from = new Set(founding.map((p) => p.from))
    for (const place of world.places.slice(2)) expect(from.has(place.id), place.id).toBe(true)
  })

  it('shows every level of neglect, so the neglect visuals can be seen (Home and the Workshop at most level 1)', () => {
    const now = Date.parse(FIXTURE_NOW)
    const levels = new Set(world.places.map((p) => neglectFor({ id: p.id, lastCareAt: p.state.lastCareAt, founded: p.founded }, now)))
    expect([...levels].sort()).toEqual([0, 1, 2, 3])
    for (const p of world.places.slice(0, 2)) expect(neglectFor({ id: p.id, lastCareAt: p.state.lastCareAt, founded: p.founded }, now)).toBeLessThanOrEqual(1)
  })

  it('measures care from the "now" it is given, so a viewer on any date still sees every level of neglect', () => {
    const later = '2027-03-05T09:00:00Z'
    const w = makeFixtureWorld(1, 10, later)
    expect(w.now).toBe(later)
    const levels = new Set(w.places.map((p) => neglectFor({ id: p.id, lastCareAt: p.state.lastCareAt, founded: p.founded }, Date.parse(later))))
    expect([...levels].sort()).toEqual([0, 1, 2, 3])
  })

  it('differs by seed and is the same every time for one seed', () => {
    expect(JSON.stringify(makeFixtureWorld(1, 10))).toBe(JSON.stringify(world))
    const other = makeFixtureWorld(2, 10)
    expect(other.places.map((p) => p.chunk.join(','))).not.toEqual(world.places.map((p) => p.chunk.join(',')))
  })

  it('gives the land something to stand on: flat ground under every place', () => {
    const land = createLand(1, world.places.map(toLandPlace))
    expect(land.classify([0, 0])).toBe('owned')
    for (const p of world.places) expect(land.placesIn(p.chunk).map((x) => x.id)).toContain(p.id)
  })

  it('grows to the limit of 64 places and still follows every rule', () => {
    const full = makeFixtureWorld(3, MAX_PLACES)
    expect(full.places).toHaveLength(MAX_PLACES)
    expect(layoutProblems(full.places.map(toLandPlace))).toEqual([])
    for (const place of full.places) expect(validatePlace(place, ctxOf(full)), place.id).toEqual([])
  })
})

describe('the fixture world shows construction and a path an expand made (W6)', () => {
  const world = makeFixtureWorld(1, 10)
  const now = Date.parse(FIXTURE_NOW)

  it('has one place under construction, finishing in the future, so the scaffolding can be seen', () => {
    const building = world.places.filter((p) => p.state.construction !== null)
    expect(building).toHaveLength(1)
    expect(building[0]!.state.construction!.kind).toBe('expand')
    expect(Date.parse(building[0]!.state.construction!.finishesAt)).toBeGreaterThan(now)
    expect(['home', 'workshop']).not.toContain(building[0]!.id)
  })

  it('has a path an expand made, between two places founding did not join, and draws it among the paths', () => {
    const expand = world.paths.filter((p) => p.kind === 'expand')
    expect(expand).toHaveLength(1)
    expect(world.paths.filter((p) => p.kind === 'founding')).toHaveLength(8)
    const from = world.places.find((p) => p.id === expand[0]!.from)!
    expect(from.paths.map((e) => e.to)).toContain(expand[0]!.to)
  })

  it('keeps every place a valid file', () => {
    for (const place of world.places) expect(validatePlace(place, { kit, exists: (path: string) => path in world.souvenirs, souvenirKind: (path: string) => world.souvenirs[path] }), place.id).toEqual([])
  })

  it('measures the construction from the "now" it is given', () => {
    const later = '2027-03-05T09:00:00Z'
    const w = makeFixtureWorld(1, 10, later)
    const b = w.places.find((p) => p.state.construction)!
    expect(Date.parse(b.state.construction!.finishesAt)).toBeGreaterThan(Date.parse(later))
  })
})

describe('the fixture world has a place request staked on a chunk (W6, spec 10.3)', () => {
  const world = makeFixtureWorld(1, 10)

  it('has two place requests, one open and one Roman says he is building, valid request files', () => {
    expect(world.requests).toHaveLength(2)
    for (const r of world.requests) expect(PlaceRequest.safeParse(r).success).toBe(true)
    expect(world.requests.map((r) => r.status).sort()).toEqual(['building', 'open'])
    expect(world.requests.every((r) => r.kind === 'place')).toBe(true)
  })

  it('stakes chunks that no place has and no other request has, and that touch a place', () => {
    const taken = new Set(world.places.map((p) => p.chunk.join(',')))
    const staked = world.requests.map((r) => r.chunk.join(','))
    expect(new Set(staked).size).toBe(staked.length)
    for (const c of world.requests.map((r) => r.chunk)) {
      expect(taken.has(c.join(','))).toBe(false)
      const touches = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => taken.has(`${c[0]! + dx!},${c[1]! + dz!}`))
      expect(touches, c.join(',')).toBe(true)
    }
  })

  it('is the same every time, and does not change the places, the paths or the souvenirs', () => {
    expect(JSON.stringify(makeFixtureWorld(1, 10))).toBe(JSON.stringify(world))
    expect(world.places).toHaveLength(10)
  })
})
