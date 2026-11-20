import type { Page } from 'playwright'
import type { CheckResult } from '../report/finding.ts'

/** A place as `window.__qa.paths()` lists it: its chunk and its footprint on the ground. */
export interface PathPlace {
  id: string
  chunk: [number, number]
  x0: number
  x1: number
  z0: number
  z1: number
}

/** A path as drawn (apps/viewer/src/world/pathGeometry.ts): its two places, the line it runs along and its mesh. */
export interface DrawnPathMesh {
  from: string
  to: string
  kind: string
  line: [number, number][]
  positions: number[]
  indices: number[]
}

export interface PathInput {
  places: PathPlace[]
  paths: DrawnPathMesh[]
}

/** How far apart the points looked at along a path are, and how far to each side of its line (the track is 3 m wide). */
const ALONG = 0.25
const ACROSS = [-1.2, -0.8, -0.4, 0, 0.4, 0.8, 1.2]
/** A path closer than this above the drawn ground under it is lost in it: the ground shows through or flickers with it. */
const ABOVE = 0.01
/** A point this close to a building's footprint is the building's, not the path's. */
const NEAR_WALL = 0.05

const inside = (places: readonly PathPlace[], x: number, z: number) => places.some((p) => x > p.x0 - NEAR_WALL && x < p.x1 + NEAR_WALL && z > p.z0 - NEAR_WALL && z < p.z1 + NEAR_WALL)

/** The points a path is looked at: along its line, and across the track, leaving out those in or at a building. */
export function pathSamplePoints(path: Pick<DrawnPathMesh, 'line'>, places: readonly PathPlace[]): [number, number][] {
  const out: [number, number][] = []
  for (let s = 1; s < path.line.length; s++) {
    const [a, b] = [path.line[s - 1]!, path.line[s]!]
    const length = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (length === 0) continue
    const [dx, dz] = [(b[0] - a[0]) / length, (b[1] - a[1]) / length]
    for (let t = 0; t <= length + 1e-9; t += ALONG) {
      for (const off of ACROSS) {
        const x = a[0] + dx * t + dz * off
        const z = a[1] + dz * t - dx * off
        if (!inside(places, x, z)) out.push([x, z])
      }
    }
  }
  return out
}

type Tri = [number, number, number, number, number, number, number, number, number]

/** The triangles of every drawn path, in 1 m buckets of x, z, so a point is tested only against the few near it. */
function bucketed(paths: readonly DrawnPathMesh[]) {
  const buckets = new Map<string, Tri[]>()
  for (const p of paths) {
    for (let t = 0; t + 2 < p.indices.length; t += 3) {
      const v = [p.indices[t]!, p.indices[t + 1]!, p.indices[t + 2]!].flatMap((i) => [p.positions[i * 3]!, p.positions[i * 3 + 1]!, p.positions[i * 3 + 2]!]) as Tri
      const xs = [v[0], v[3], v[6]]
      const zs = [v[2], v[5], v[8]]
      for (let bx = Math.floor(Math.min(...xs)); bx <= Math.floor(Math.max(...xs)); bx++) {
        for (let bz = Math.floor(Math.min(...zs)); bz <= Math.floor(Math.max(...zs)); bz++) {
          const key = `${bx},${bz}`
          buckets.set(key, [...(buckets.get(key) ?? []), v])
        }
      }
    }
  }
  /** The highest drawn path over the point, or null when no path triangle covers it. */
  return (x: number, z: number): number | null => {
    let top: number | null = null
    for (const [ax, ay, az, bx, by, bz, cx, cy, cz] of buckets.get(`${Math.floor(x)},${Math.floor(z)}`) ?? []) {
      const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz)
      if (Math.abs(d) < 1e-12) continue
      const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d
      const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d
      const l3 = 1 - l1 - l2
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue
      const y = l1 * ay + l2 * by + l3 * cy
      top = top === null ? y : Math.max(top, y)
    }
    return top
  }
}

const at = (p: readonly [number, number]) => `x ${p[0].toFixed(1)}, z ${p[1].toFixed(1)}`

/**
 * Three checks on the paths as drawn (audit QW.2), added after the world explorer saw a hole in the path to the Hillside Room
 * (issue 433), ground poking through the path on the slope by Grown Place 6 (issue 428), and the Workshop with no path at all
 * (issue 434):
 *
 * - `world.path-hole`: a point on a path's track (within 1.2 m of its line, not in or at a building) that no path triangle covers.
 * - `world.ground-over-path`: a point of a path's track where the drawn ground is above the path, or less than 1 cm under it, so
 *   the ground shows through. `groundAt` is the drawn ground's height (the land mesh's flat triangles, `__qa.drawnGround`).
 * - `world.place-no-path`: a place no drawn path reaches, or that the paths do not join to Home, in a world of more than one
 *   place. The finding says why: whether it shares a chunk with another place, and whether any path ends at it.
 */
export function pathFindings(fixture: string, input: PathInput, groundAt: (x: number, z: number) => number): CheckResult[] {
  const out: CheckResult[] = []
  const topAt = bucketed(input.paths)
  for (const path of input.paths) {
    const holes: [number, number][] = []
    const under: { p: [number, number]; gap: number }[] = []
    const points = pathSamplePoints(path, input.places)
    for (const p of points) {
      const top = topAt(p[0], p[1])
      if (top === null) holes.push(p)
      else if (top - groundAt(p[0], p[1]) < ABOVE) under.push({ p, gap: top - groundAt(p[0], p[1]) })
    }
    const key = `${path.from}+${path.to}`
    if (holes.length) {
      out.push({
        id: 'world.path-hole',
        fingerprint: `world.path-hole|${fixture}|${key}`,
        severity: 'major',
        title: `The path from ${path.from} to ${path.to} has holes in it`,
        what: `${holes.length} of the ${points.length} points looked at on its track are not covered by the path. The first is at ${at(holes[0]!)}.`,
        causes: 'The ground shows through gaps in the path, which looks like a drawing slip.',
        evidence: [],
        fixKind: 'look',
        fixture,
        where: 'apps/viewer/src/world/pathGeometry.ts',
      })
    }
    if (under.length) {
      const worst = under.reduce((a, b) => (b.gap < a.gap ? b : a))
      out.push({
        id: 'world.ground-over-path',
        fingerprint: `world.ground-over-path|${fixture}|${key}`,
        severity: 'major',
        title: `The ground pokes through the path from ${path.from} to ${path.to}`,
        what: `At ${under.length} of the ${points.length} points looked at on its track the drawn ground is above the path or less than ${ABOVE * 100} cm under it. The worst is at ${at(worst.p)}, where the ground is ${(-worst.gap).toFixed(2)} m above the path.`,
        causes: 'Slivers of ground show through the path, as if it were laid on top without following the land.',
        evidence: [],
        fixKind: 'look',
        fixture,
        where: 'apps/viewer/src/world/pathGeometry.ts',
      })
    }
  }

  if (input.places.length > 1) {
    const drawn = input.paths.filter((p) => p.indices.length > 0)
    const links = new Map<string, string[]>()
    for (const p of drawn) {
      links.set(p.from, [...(links.get(p.from) ?? []), p.to])
      links.set(p.to, [...(links.get(p.to) ?? []), p.from])
    }
    const start = input.places.find((p) => p.id === 'home')?.id ?? input.places[0]!.id
    const reached = new Set([start])
    for (const queue = [start]; queue.length; ) {
      for (const next of links.get(queue.shift()!) ?? []) {
        if (reached.has(next)) continue
        reached.add(next)
        queue.push(next)
      }
    }
    for (const place of input.places) {
      if (reached.has(place.id)) continue
      const neighbours = input.places.filter((o) => o.id !== place.id && o.chunk[0] === place.chunk[0] && o.chunk[1] === place.chunk[1]).map((o) => o.id)
      const own = links.get(place.id) ?? []
      const why = own.length === 0 ? `No drawn path ends at it${neighbours.length ? `; it shares its chunk ${place.chunk.join(', ')} with ${neighbours.join(', ')}, and founding makes no path inside a chunk` : ''}.` : `Its paths (to ${own.join(', ')}) do not join the paths that reach ${start}.`
      out.push({
        id: 'world.place-no-path',
        fingerprint: `world.place-no-path|${fixture}|${place.id}`,
        severity: 'major',
        title: `No path leads to ${place.id}`,
        what: `${place.id} cannot be reached from ${start} along the drawn paths. ${why}`,
        causes: 'The place looks as if it is not part of the same world, and a visitor walks over bare ground to get there.',
        evidence: [],
        fixKind: 'look',
        fixture,
        where: 'apps/viewer/src/world/pathGeometry.ts',
      })
    }
  }
  return out
}

type QaPaths = { paths(): PathInput; drawnGround(points: [number, number][]): number[] }

/** The drawn paths of the world open on the page, and the drawn ground under every point the checks look at. */
export async function collectPaths(page: Page): Promise<{ input: PathInput; groundAt: (x: number, z: number) => number }> {
  const input = await page.evaluate(() => (globalThis as unknown as { __qa: QaPaths }).__qa.paths())
  const points = input.paths.flatMap((p) => pathSamplePoints(p, input.places))
  const heights = await page.evaluate((pts) => (globalThis as unknown as { __qa: QaPaths }).__qa.drawnGround(pts), points)
  const byPoint = new Map(points.map((p, i) => [`${p[0]},${p[1]}`, heights[i]!]))
  return { input, groundAt: (x, z) => byPoint.get(`${x},${z}`) ?? Number.NaN }
}
