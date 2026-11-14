import { chunkCentre, chunkKey, pullOf, type Chunk, type LandPlace } from './land.ts'

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
