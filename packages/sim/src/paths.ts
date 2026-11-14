import { chunkCentre, chunkKey, placeCentre, pullOf, type Chunk, type LandPlace } from './land.ts'

/** A path is drawn as a track this wide (spec 4.3). */
export const PATH_WIDTH = 3

const STEPS: Chunk[] = [[1, 0], [-1, 0], [0, 1], [0, -1]]

/**
 * The shortest route between two chunks, over chunk centres, by A* (spec 4.3). Only `passable` chunks are used (the owned ones),
 * and the two ends always are. Moves are to the four neighbours, so routes follow the same adjacency the world grows by.
 * Ties are broken in a fixed order, so the same world always gives the same route. Null when there is no way.
 */
export function findChunkPath(from: Chunk, to: Chunk, passable: ReadonlySet<string>): Chunk[] | null {
  const ok = (c: Chunk) => passable.has(chunkKey(c)) || chunkKey(c) === chunkKey(from) || chunkKey(c) === chunkKey(to)
  const h = (c: Chunk) => Math.abs(c[0] - to[0]) + Math.abs(c[1] - to[1])
  const g = new Map<string, number>([[chunkKey(from), 0]])
  const came = new Map<string, Chunk>()
  const open: { c: Chunk; f: number; order: number }[] = [{ c: from, f: h(from), order: 0 }]
  const closed = new Set<string>()
  let order = 1
  while (open.length > 0) {
    let best = 0
    for (let i = 1; i < open.length; i++) {
      const a = open[i]!
      const b = open[best]!
      if (a.f < b.f || (a.f === b.f && (h(a.c) < h(b.c) || (h(a.c) === h(b.c) && a.order < b.order)))) best = i
    }
    const { c } = open.splice(best, 1)[0]!
    const k = chunkKey(c)
    if (closed.has(k)) continue
    if (k === chunkKey(to)) {
      const route: Chunk[] = [c]
      let at = k
      while (came.has(at)) {
        const prev = came.get(at)!
        route.unshift(prev)
        at = chunkKey(prev)
      }
      return route
    }
    closed.add(k)
    for (const [dx, dz] of STEPS) {
      const n: Chunk = [c[0] + dx, c[1] + dz]
      const nk = chunkKey(n)
      if (!ok(n) || closed.has(nk)) continue
      const cost = g.get(k)! + 1
      if (cost < (g.get(nk) ?? Infinity)) {
        g.set(nk, cost)
        came.set(nk, c)
        open.push({ c: n, f: cost + h(n), order: order++ })
      }
    }
  }
  return null
}

/** The line a path is drawn along: through the centres of its chunks, as world `[x, z]` points. */
export const pathPolyline = (chunks: readonly Chunk[]): [number, number][] => chunks.map((c) => chunkCentre(c))

export interface WorldPath {
  from: string
  to: string
  chunks: Chunk[]
  /** Where it came from: a founding (always one) or an expand (spec 4.3). `derivePaths` leaves it out, `allPaths` fills it in. */
  kind?: 'founding' | 'expand'
}

/** A place as the paths need it: the land's view of it, its founding date, and the paths its expands added (spec 5.4). */
export type PathPlace = LandPlace & { founded: string; paths?: readonly { to: string; at: string }[] }

const FIRST = ['home', 'workshop']

/**
 * The paths a world has, worked out from its places alone (spec 4: the world can always be rebuilt from the repo). Founding
 * makes one path, from the new place to the best-scoring place that was there before it, or to Home when nothing is related, so
 * the world stays connected. Places are taken in the order they were founded (Home and the Workshop first, then by date, then by
 * id); a tie goes to the place founded first. Paths are never deleted. (`allPaths` adds the ones an expand made.)
 */
export function derivePaths(places: readonly (LandPlace & { founded: string })[]): WorldPath[] {
  const rank = (p: LandPlace) => (FIRST.includes(p.id) ? FIRST.indexOf(p.id) : FIRST.length)
  const ordered = [...places].sort((a, b) => rank(a) - rank(b) || a.founded.localeCompare(b.founded) || a.id.localeCompare(b.id))
  const paths: WorldPath[] = []
  for (let i = 0; i < ordered.length; i++) {
    const place = ordered[i]!
    const before = ordered.slice(0, i)
    if (before.length === 0 || before.some((b) => chunkKey(b.chunk) === chunkKey(place.chunk))) continue
    let target = before[0]!
    let best = 0
    for (const candidate of before) {
      const pull = pullOf(candidate, { tags: place.tags, related: place.related }, place.chunk)
      if (pull > best + 1e-9) {
        best = pull
        target = candidate
      }
    }
    if (best <= 0) target = before.find((b) => b.id === 'home') ?? before[0]!
    const route = findChunkPath(place.chunk, target.chunk, new Set(before.map((b) => chunkKey(b.chunk))))
    if (route) paths.push({ from: place.id, to: target.id, chunks: route })
  }
  return paths
}

/**
 * Every path a world has (spec 4.3): the founding paths of `derivePaths`, then each path an expand added (`place.paths`, spec
 * 5.4), routed by A* over the owned chunks like the others. A path to a place that is not there, or with no way through the
 * owned chunks, is left out; a pair of places has one path however many times it was made, and a pair founding already joined
 * is not drawn twice. Expands are taken in the order they were made, so the same world gives the same paths.
 */
export function allPaths(places: readonly PathPlace[]): WorldPath[] {
  const founding: WorldPath[] = derivePaths(places).map((p) => ({ ...p, kind: 'founding' as const }))
  const pair = (a: string, b: string) => [a, b].sort().join('|')
  const seen = new Set(founding.map((p) => pair(p.from, p.to)))
  const byId = new Map(places.map((p) => [p.id, p]))
  const owned = new Set(places.map((p) => chunkKey(p.chunk)))
  const made = places
    .flatMap((p) => (p.paths ?? []).map((e) => ({ from: p.id, to: e.to, at: e.at })))
    .sort((a, b) => a.at.localeCompare(b.at) || a.from.localeCompare(b.from) || a.to.localeCompare(b.to))
  const added: WorldPath[] = []
  for (const e of made) {
    const [source, target] = [byId.get(e.from), byId.get(e.to)]
    if (!source || !target || seen.has(pair(e.from, e.to))) continue
    const route = findChunkPath(source.chunk, target.chunk, owned)
    if (!route) continue
    seen.add(pair(e.from, e.to))
    added.push({ from: e.from, to: e.to, chunks: route, kind: 'expand' })
  }
  return [...founding, ...added]
}

/** The middle of a place's door, on the front (+z) wall, as a world `[x, z]`. */
export const doorOf = (place: LandPlace): [number, number] => {
  const [x, z] = placeCentre(place)
  return [x, z + place.footprint[1] / 2]
}

/** How far a route keeps from every wall it passes: half the track, and as much again, so the track never touches one. */
export const ROUTE_MARGIN = PATH_WIDTH / 2 + 1.5

type Pt = [number, number]
interface Box {
  x0: number
  x1: number
  z0: number
  z1: number
}

/** Whether the segment `a` to `b` passes through the inside of the box (running along its edge, or touching a corner, does not count). */
function crosses(a: Pt, b: Pt, box: Box): boolean {
  const eps = 1e-6
  let t0 = 0
  let t1 = 1
  for (const [from, to, lo, hi] of [[a[0], b[0], box.x0 + eps, box.x1 - eps], [a[1], b[1], box.z0 + eps, box.z1 - eps]] as const) {
    const d = to - from
    if (Math.abs(d) < 1e-12) {
      if (from <= lo || from >= hi) return false
      continue
    }
    let near = (lo - from) / d
    let far = (hi - from) / d
    if (near > far) [near, far] = [far, near]
    t0 = Math.max(t0, near)
    t1 = Math.min(t1, far)
    if (t1 - t0 <= 1e-9) return false
  }
  return true
}

/**
 * The line a path is drawn along, from the door of the place it comes from to the door of the place it goes to (spec 4.3). It
 * leaves each door straight out along the door's axis, then takes the shortest way round the buildings (their footprints grown
 * by `ROUTE_MARGIN`), bending only at their corners, so it never goes through a building, whichever one, and never touches a
 * wall except at its own door. Nothing is random: the same places always give the same line. If a place of the path is not
 * there, or no way is open, the line through the chunk centres (`pathPolyline`) is used instead.
 */
export function routePath(path: WorldPath, places: readonly LandPlace[]): Pt[] {
  const [from, to] = [places.find((p) => p.id === path.from), places.find((p) => p.id === path.to)]
  if (!from || !to) return pathPolyline(path.chunks)
  const boxes: Box[] = places.map((p) => {
    const [x, z] = placeCentre(p)
    const [w, d] = p.footprint
    return { x0: x - w / 2 - ROUTE_MARGIN, x1: x + w / 2 + ROUTE_MARGIN, z0: z - d / 2 - ROUTE_MARGIN, z1: z + d / 2 + ROUTE_MARGIN }
  })
  const [start, end] = [doorOf(from), doorOf(to)]
  const [a, b]: [Pt, Pt] = [[start[0], start[1] + ROUTE_MARGIN], [end[0], end[1] + ROUTE_MARGIN]]
  const inside = (p: Pt) => boxes.some((box) => p[0] > box.x0 + 1e-6 && p[0] < box.x1 - 1e-6 && p[1] > box.z0 + 1e-6 && p[1] < box.z1 - 1e-6)

  // The nodes: the two points in front of the doors, then the corners of the buildings near the way between them.
  const reach = 40
  const area: Box = { x0: Math.min(a[0], b[0]) - reach, x1: Math.max(a[0], b[0]) + reach, z0: Math.min(a[1], b[1]) - reach, z1: Math.max(a[1], b[1]) + reach }
  const nodes: Pt[] = [a, b]
  for (const box of boxes) {
    if (box.x1 < area.x0 || box.x0 > area.x1 || box.z1 < area.z0 || box.z0 > area.z1) continue
    for (const corner of [[box.x0, box.z0], [box.x1, box.z0], [box.x0, box.z1], [box.x1, box.z1]] as Pt[]) if (!inside(corner)) nodes.push(corner)
  }

  // Dijkstra over the nodes that can see each other; ties go to the lower index, so the route is always the same.
  const dist = nodes.map(() => Infinity)
  const prev = nodes.map(() => -1)
  const done = nodes.map(() => false)
  dist[0] = 0
  for (;;) {
    let u = -1
    for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i]! < Infinity && (u < 0 || dist[i]! < dist[u]! - 1e-12)) u = i
    if (u < 0 || u === 1) break
    done[u] = true
    for (let v = 0; v < nodes.length; v++) {
      if (done[v]) continue
      const length = Math.hypot(nodes[v]![0] - nodes[u]![0], nodes[v]![1] - nodes[u]![1])
      if (dist[u]! + length >= dist[v]! - 1e-12) continue
      if (boxes.some((box) => crosses(nodes[u]!, nodes[v]!, box))) continue
      dist[v] = dist[u]! + length
      prev[v] = u
    }
  }
  if (!done[0] || dist[1] === Infinity) return pathPolyline(path.chunks)
  const inner: Pt[] = []
  for (let n = 1; n >= 0; n = prev[n]!) {
    inner.unshift(nodes[n]!)
    if (n === 0) break
  }
  return [start, ...inner, end]
}
