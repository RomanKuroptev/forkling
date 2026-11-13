import { describe, expect, it } from 'vitest'
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
    expect(world.paths).toHaveLength(8)
    const from = new Set(world.paths.map((p) => p.from))
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
