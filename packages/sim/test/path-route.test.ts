import { describe, expect, it } from 'vitest'
import { makeFixtureWorld } from '../src/fixture-world.ts'
import { createLand, placeCentre, toLandPlace, type LandPlace } from '../src/land.ts'
import { PATH_WIDTH, allPaths, doorOf, pathPolyline, routePath } from '../src/paths.ts'

type Pt = readonly [number, number]

const rectOf = (p: LandPlace) => {
  const [x, z] = placeCentre(p)
  const [w, d] = p.footprint
  return { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 }
}
/** How far a point is from a building's footprint (0 inside). */
const distToRect = (pt: Pt, p: LandPlace) => {
  const r = rectOf(p)
  return Math.hypot(Math.max(r.x0 - pt[0], 0, pt[0] - r.x1), Math.max(r.z0 - pt[1], 0, pt[1] - r.z1))
}
/** The closest a segment comes to a building, found by walking along it in 5 cm steps. */
const segmentClearance = (a: Pt, b: Pt, p: LandPlace) => {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1])
  const n = Math.max(1, Math.ceil(length / 0.05))
  let best = Infinity
  for (let k = 0; k <= n; k++) best = Math.min(best, distToRect([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n], p))
  return best
}

const worlds = [
  { seed: 1, count: 10 },
  { seed: 2, count: 10 },
  { seed: 3, count: 64 },
  { seed: 5, count: 40 },
]

describe.each(worlds)('a route from door to door (seed $seed, $count places)', ({ seed, count }) => {
  const world = makeFixtureWorld(seed, count)
  const places = world.places.map(toLandPlace)
  const byId = new Map(places.map((p) => [p.id, p]))
  const paths = allPaths(places)
  const land = createLand(seed, places)

  it('has paths to look at', () => {
    expect(paths.length).toBeGreaterThan(count / 2)
  })

  it('starts at the door of the place it comes from and ends at the door of the place it goes to', () => {
    for (const path of paths) {
      const route = routePath(path, places)
      const [start, end] = [doorOf(byId.get(path.from)!), doorOf(byId.get(path.to)!)]
      expect(route[0], `${path.from} start`).toEqual(start)
      expect(route.at(-1), `${path.to} end`).toEqual(end)
    }
  })

  it('leaves each door straight out along its axis, into the open', () => {
    for (const path of paths) {
      const route = routePath(path, places)
      for (const [door, next] of [[route[0]!, route[1]!], [route.at(-1)!, route.at(-2)!]] as [Pt, Pt][]) {
        expect(next[0], `${path.from}>${path.to}: straight out of the door`).toBeCloseTo(door[0], 6)
        expect(next[1], 'out in front (+z), not into the building').toBeGreaterThan(door[1] + 1)
      }
    }
  })

  it('never goes through a building, and keeps half a path width clear of every one except at its own door', () => {
    for (const path of paths) {
      const route = routePath(path, places)
      for (let s = 0; s + 1 < route.length; s++) {
        for (const p of places) {
          const door = (s === 0 && p.id === path.from) || (s === route.length - 2 && p.id === path.to)
          // The straight run from a door out to the edge of its clear zone only has to stay out of the walls.
          const needed = door ? 0 : PATH_WIDTH / 2 - 1e-6
          expect(segmentClearance(route[s]!, route[s + 1]!, p), `${path.from}>${path.to} segment ${s} past ${p.id}`).toBeGreaterThanOrEqual(needed)
        }
      }
    }
  })

  it('does not wander: no longer than twice the straight way between the doors plus 40 m', () => {
    for (const path of paths) {
      const route = routePath(path, places)
      let length = 0
      for (let s = 0; s + 1 < route.length; s++) length += Math.hypot(route[s + 1]![0] - route[s]![0], route[s + 1]![1] - route[s]![1])
      const [a, b] = [doorOf(byId.get(path.from)!), doorOf(byId.get(path.to)!)]
      expect(length, `${path.from}>${path.to}`).toBeLessThanOrEqual(2 * Math.hypot(a[0] - b[0], a[1] - b[1]) + 40)
    }
  })

  it('stays on land that is drawn: never out over the fog', () => {
    for (const path of paths) {
      for (const [x, z] of routePath(path, places)) {
        expect(land.classify([Math.floor(x / 32), Math.floor(z / 32)] as const), `${path.from}>${path.to} at ${x.toFixed(1)},${z.toFixed(1)}`).not.toBe('fog')
      }
    }
  })

  it('is the same every time', () => {
    for (const path of paths) expect(JSON.stringify(routePath(path, places))).toBe(JSON.stringify(routePath(path, places)))
  })
})

describe('the way a route falls back', () => {
  it('is the line through the chunk centres when a place of the path is not there', () => {
    const path = { from: 'gone', to: 'home', chunks: [[0, 1], [0, 0]] as [number, number][] }
    const places = makeFixtureWorld(1, 10).places.map(toLandPlace)
    expect(routePath(path, places)).toEqual(pathPolyline(path.chunks))
  })

  it('puts the door in the middle of the front (+z) wall', () => {
    const home = makeFixtureWorld(1, 10).places.map(toLandPlace).find((p) => p.id === 'home')!
    const [x, z] = placeCentre(home)
    expect(doorOf(home)).toEqual([x, z + home.footprint[1] / 2])
  })
})
