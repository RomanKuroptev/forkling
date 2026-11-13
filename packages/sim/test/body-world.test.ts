import { describe, expect, it } from 'vitest'
import { SpeciesPack } from '@forkling/schema'
import { makeFixtureWorld } from '../src/fixture-world.ts'
import { bodyWorldFromStarter, buildBodyWorld } from '../src/body-world.ts'
import { chunkCentre, createLand, placeCentre, toLandPlace } from '../src/land.ts'
import { findPath, isWalkable } from '../src/nav.ts'
import { advancePlayback, startPlayback } from '../src/playback.ts'
import { collectSpots } from '../src/world.ts'
import { starterWorld } from '../src/starter.ts'
import blobJson from './fixtures/blob.species.json'

const blob = SpeciesPack.parse(blobJson)
const fixture = makeFixtureWorld(1, 10)
const world = buildBodyWorld(1, fixture.places)
const sun: [number, number, number] = [0.3, 0.8, 0.3]
const place = (id: string) => fixture.places.find((p) => p.id === id)!
const centre = (id: string) => placeCentre(toLandPlace(place(id)))

describe('the body\'s world on the new land (spec 2.7, 4)', () => {
  it('lets the body walk on owned and edge chunks, and not in the fog', () => {
    const land = createLand(1, fixture.places.map(toLandPlace))
    // The middle of an empty edge chunk, and of one that is fog, found on the land itself.
    const edge = [-1, 0, 1, 2].flatMap((cx) => [-2, -1, 0, 1, 2].map((cz) => [cx, cz] as const)).find(([cx, cz]) => land.classify([cx, cz]) === 'edge')!
    const fog = [-6, 6].flatMap((cx) => [-6, 6].map((cz) => [cx, cz] as const)).find(([cx, cz]) => land.classify([cx, cz]) === 'fog')!
    const [ex, ez] = chunkCentre(edge)
    expect(isWalkable(world.grid, ex, ez)).toBe(true)
    const [fx, fz] = chunkCentre(fog)
    expect(isWalkable(world.grid, fx, fz)).toBe(false)
  })

  it('stops the body at a building\'s walls and lets it through the door and inside', () => {
    const [hx, hz] = centre('home')
    const [fw, fd] = place('home').exterior.footprint
    expect(isWalkable(world.grid, hx, hz)).toBe(true) // inside
    expect(isWalkable(world.grid, hx - fw / 2 + 0.4, hz)).toBe(false) // west wall
    expect(isWalkable(world.grid, hx, hz - fd / 2 + 0.4)).toBe(false) // back wall
    expect(isWalkable(world.grid, hx + 3, hz + fd / 2 - 0.4)).toBe(false) // front wall, off to the side of the door
    expect(isWalkable(world.grid, hx, hz + fd / 2 - 0.4)).toBe(true) // the door in the front wall
    expect(isWalkable(world.grid, hx, hz + fd / 2 + 2)).toBe(true) // outside the door
  })

  it('has a path from the open ground outside to a seat inside, and it goes through the door', () => {
    const [hx, hz] = centre('home')
    const [, fd] = place('home').exterior.footprint
    const desk = world.spots(sun).desk![0]!
    const path = findPath(world.grid, { x: hx + 8, z: hz + fd / 2 + 6 }, desk)
    expect(path).not.toBeNull()
    for (const p of path!) expect(isWalkable(world.grid, p.x, p.z)).toBe(true)
    // It crosses the front wall, and where it does it is in the door gap.
    const wallZ = hz + fd / 2
    let crossed = false
    for (let i = 1; i < path!.length; i++) {
      const a = path![i - 1]!
      const b = path![i]!
      for (let k = 0; k <= 40; k++) {
        const t = k / 40
        const x = a.x + (b.x - a.x) * t
        const z = a.z + (b.z - a.z) * t
        if (Math.abs(z - wallZ) <= 0.6) {
          crossed = true
          expect(Math.abs(x - hx), `at (${x.toFixed(1)}, ${z.toFixed(1)})`).toBeLessThanOrEqual(1.3)
        }
      }
    }
    expect(crossed).toBe(true)
  })

  it('names the places the body can go: each place, and each kind of furniture where it stands (spec 2.7: Home\'s desk, the Workshop\'s bench)', () => {
    const spots = world.spots(sun)
    for (const p of fixture.places) {
      expect(spots[p.id], p.id).toHaveLength(1)
      const [cx, cz] = centre(p.id)
      expect(Math.abs(spots[p.id]![0]!.x - cx)).toBeLessThanOrEqual(p.exterior.footprint[0] / 2)
      expect(Math.abs(spots[p.id]![0]!.z - cz)).toBeLessThanOrEqual(p.exterior.footprint[1] / 2)
    }
    const [hx, hz] = centre('home')
    const [wx, wz] = centre('workshop')
    expect(spots.desk).toHaveLength(1)
    expect(Math.abs(spots.desk![0]!.x - hx)).toBeLessThan(6)
    expect(Math.abs(spots.desk![0]!.z - hz)).toBeLessThan(5)
    expect(spots.workbench).toHaveLength(1)
    expect(Math.abs(spots.workbench![0]!.x - wx)).toBeLessThan(6)
    expect(Math.abs(spots.workbench![0]!.z - wz)).toBeLessThan(5)
    for (const list of Object.values(spots) as { x: number; z: number }[][]) for (const s of list) expect(isWalkable(world.grid, s.x, s.z), JSON.stringify(s)).toBe(true)
  })

  it('starts the body inside Home, on the ground', () => {
    const [hx, hz] = centre('home')
    expect(world.spawn.x).toBeCloseTo(hx, 0)
    expect(world.spawn.z).toBeCloseTo(hz, 0)
    expect(isWalkable(world.grid, world.spawn.x, world.spawn.z)).toBe(true)
    expect(world.spawn.y).toBeCloseTo(world.heightAt(world.spawn.x, world.spawn.z), 9)
  })

  it("puts the visitor on the open ground outside Home's door, facing it", () => {
    const [hx, hz] = centre('home')
    const [, fd] = place('home').exterior.footprint
    const v = world.visitorSpawn
    expect(v.x).toBeCloseTo(hx, 0)
    expect(v.z).toBeGreaterThan(hz + fd / 2 + 2)
    expect(isWalkable(world.grid, v.x, v.z)).toBe(true)
    // Facing -z, towards the door (forward is [sin yaw, cos yaw]).
    expect(Math.sin(v.yaw)).toBeCloseTo(0, 6)
    expect(Math.cos(v.yaw)).toBeCloseTo(-1, 6)
    expect(v.y).toBeCloseTo(world.heightAt(v.x, v.z), 9)
  })

  it('gives the ground height of the land, flat under a building', () => {
    const [hx, hz] = centre('home')
    expect(world.heightAt(hx - 4, hz)).toBeCloseTo(world.heightAt(hx + 4, hz), 6)
  })

  it('is the same every time for the same places and seed, and a world with no places still has somewhere to stand', () => {
    const again = buildBodyWorld(1, fixture.places)
    expect(Array.from(again.grid.walkable)).toEqual(Array.from(world.grid.walkable))
    expect(again.spots(sun)).toEqual(world.spots(sun))
    const empty = buildBodyWorld(1, [])
    expect(isWalkable(empty.grid, empty.spawn.x, empty.spawn.z)).toBe(true)
  })
})

describe('the pet-era island as a body world, until it is retired', () => {
  it('offers the same grid, spawn and spots the island always did', () => {
    const starter = starterWorld()
    const adapted = bodyWorldFromStarter(starter, blob)
    expect(adapted.grid).toBe(starter.nav.grid)
    expect(adapted.spawn).toBe(starter.spawn)
    expect(adapted.visitorSpawn).toBe(starter.spawn)
    expect(adapted.spots(sun)).toEqual(collectSpots(blob, starter.cfg, starter.nav, starter.spawn, sun, starter.objects))
  })
})

describe('the body playing on the new land', () => {
  const input = () => {
    const [hx, hz] = centre('home')
    return {
      forkling: {
        name: 'Blobby',
        species: 'blob',
        position: [hx, 0, hz] as [number, number, number],
        mood: 0.2,
        energy: 0.3,
        intention: { type: 'roam', startedAt: '2026-12-20T11:00:00.000Z', seed: 99, reason: 'Blob felt like a stroll.' },
        lastTickAt: '2026-12-20T11:00:00.000Z',
        timezone: 'Europe/Stockholm',
        seed: 7,
        lateNight: null,
        asleep: false,
        schemaVersion: 1,
      },
      pack: blob,
      behaviors: [],
      world,
    }
  }

  it('walks only where it can: every position over an hour is on a walkable cell', () => {
    const start = Date.parse('2026-12-20T11:00:05.000Z')
    let pb = startPlayback(input() as never, start)
    let walked = 0
    for (let s = 1; s <= 600; s++) {
      pb = advancePlayback(pb, start + s * 6000, null)
      expect(isWalkable(world.grid, pb.state.pos.x, pb.state.pos.z), `at ${s * 6} s`).toBe(true)
      if (pb.state.phase === 'moving') walked++
    }
    expect(walked).toBeGreaterThan(0)
  })

  it('is the same for everyone: two playbacks at one moment agree', () => {
    const at = Date.parse('2026-12-20T11:20:00.000Z')
    const a = startPlayback(input() as never, at)
    const b = startPlayback(input() as never, at)
    expect(a.state.pos).toEqual(b.state.pos)
    expect(a.state.intention).toEqual(b.state.intention)
    expect(a.steps).toBe(b.steps)
  })
})

describe('a plan step takes the body where the engine says (spec 2.7)', () => {
  // The made-up blob pack has no idea what Home or a desk is. It only says which of its own actions shows a verb.
  const pack = SpeciesPack.parse({
    ...blobJson,
    actions: [...blobJson.actions, { id: 'visit', durationSec: [30, 60], target: { type: 'spot', kind: 'home' }, slot: 'walk', reason: 'Went there.' }],
    mindPoses: { wander: 'visit', tend: 'visit' },
  })
  const START = Date.parse('2026-12-20T11:00:00.000Z')
  const stepGoals = (verb: string, targetId: string | undefined) => ({
    today: { date: '2026-12-20', steps: [{ verb, ...(targetId ? { targetId } : {}), reason: 'Went to it.', minutes: 30 }], reason: 'A plan.' },
    now: { index: 0, startedAt: new Date(START).toISOString(), until: new Date(START + 1800_000).toISOString() },
  })
  const play = (verb: string, targetId: string | undefined, from: string) => {
    const [x, z] = centre(from)
    const forkling = { name: 'Blobby', species: 'blob', position: [x, 0, z], mood: 0.2, energy: 0.3, intention: { type: 'visit', startedAt: new Date(START).toISOString(), seed: 5, reason: 'x' }, lastTickAt: new Date(START).toISOString(), timezone: 'Europe/Stockholm', seed: 7, asleep: false, schemaVersion: 1 }
    return startPlayback({ forkling, pack, behaviors: [], world, goals: stepGoals(verb, targetId) } as never, START + 150_000)
  }
  const near = (pb: ReturnType<typeof play>, spot: { x: number; z: number }) => Math.hypot(pb.state.pos.x - spot.x, pb.state.pos.z - spot.z)

  it('walks to the desk at Home for a wander step, from the other side of the village', () => {
    const desk = world.spots(sun).desk![0]!
    expect(near(play('wander', 'lidar finds of lost Maya sites', 'place-04'), desk)).toBeLessThan(3)
  })

  it('walks to the place a tend names', () => {
    const target = world.spots(sun)['place-02']![0]!
    expect(near(play('tend', 'place-02', 'workshop'), target)).toBeLessThan(3)
  })

  it('keeps the focus on the step: the body is not doing something else when its time is not up', () => {
    const pb = play('tend', 'place-02', 'workshop')
    expect(pb.state.focus).toMatchObject({ action: 'visit', targetId: 'place-02' })
  })
})
