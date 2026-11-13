import type { Place } from '@forkling/schema'
import { fbm2 } from './noise.ts'
import { createPrng } from './prng.ts'

/**
 * The land (spec 4.1, 4.2). The world is a grid of 32 meter chunks that grows by one chunk each time a place is founded.
 * Everything here is worked out from the place files and the forkling's seed, so the world can always be rebuilt from the repo.
 *
 * Chunk `(cx, cz)` covers x from 32 cx to 32 cx + 32, and the same for z. Pure and seeded: no DOM, no three.js, and nothing
 * random except the seeded PRNG.
 */
export const CHUNK_SIZE = 32
/** More than a year at the founding quota (spec 4.1). */
export const MAX_PLACES = 64
/** How far the ground is smoothed from a place's footprint back into the plain terrain, in meters. */
export const BLEND = 6
/** The terrain stays within plus or minus this many meters. */
const AMPLITUDE = 5

export type Chunk = readonly [number, number]

/** What the land needs to know about a place (`toLandPlace` makes one from a place file). */
export interface LandPlace {
  id: string
  chunk: Chunk
  /** Where its middle is from its chunk's middle, in meters. Missing means the middle (the founding clearing is the exception). */
  offset?: readonly [number, number]
  footprint: readonly [number, number]
  tags: readonly string[]
  /** The places the found call named as related (spec 4.2). */
  related?: readonly string[]
}

/** What the land needs from a place file, plus the date it was founded (paths are made in that order). */
export function toLandPlace(place: Place): LandPlace & { founded: string } {
  return { id: place.id, chunk: place.chunk, offset: place.offset, footprint: place.exterior.footprint, tags: place.tags, related: place.related, founded: place.founded }
}

export const chunkKey = (c: Chunk) => `${c[0]},${c[1]}`
export const chunkAt = (x: number, z: number): Chunk => [Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)]
export const chunkCentre = (c: Chunk): [number, number] => [c[0] * CHUNK_SIZE + CHUNK_SIZE / 2, c[1] * CHUNK_SIZE + CHUNK_SIZE / 2]

/** The middle of a place in the world. */
export function placeCentre(place: LandPlace): [number, number] {
  const [cx, cz] = chunkCentre(place.chunk)
  return [cx + (place.offset?.[0] ?? 0), cz + (place.offset?.[1] ?? 0)]
}

/** The ground without any place on it: a seeded noise of world coordinates, so chunks join without seams. */
export function rawHeight(seed: number, x: number, z: number): number {
  return (fbm2(x / 64, z / 64, seed, 4) - 0.5) * 2 * AMPLITUDE
}

const smoothstep = (t: number) => {
  const s = Math.min(1, Math.max(0, t))
  return s * s * (3 - 2 * s)
}

const NEIGHBOURS_8: Chunk[] = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]
const NEIGHBOURS_4: Chunk[] = [[0, -1], [-1, 0], [1, 0], [0, 1]]

export type ChunkClass = 'owned' | 'edge' | 'fog'

export interface Land {
  seed: number
  places: readonly LandPlace[]
  /** Owned: it holds a place. Edge: empty, next to an owned chunk (8 neighbours); it shows plain terrain fading into fog. Fog: the rest. */
  classify(chunk: Chunk): ChunkClass
  placesIn(chunk: Chunk): LandPlace[]
  /** Ground height at a world point: the noise, flattened under each place's footprint and blended back over `BLEND` meters. */
  heightAt(x: number, z: number): number
}

export function createLand(seed: number, places: readonly LandPlace[]): Land {
  const byChunk = new Map<string, LandPlace[]>()
  for (const p of places) {
    const k = chunkKey(p.chunk)
    byChunk.set(k, [...(byChunk.get(k) ?? []), p])
  }
  const bases = new Map<string, number>()
  const baseOf = (p: LandPlace) => {
    let b = bases.get(p.id)
    if (b === undefined) {
      const [x, z] = placeCentre(p)
      b = rawHeight(seed, x, z)
      bases.set(p.id, b)
    }
    return b
  }
  const placesIn = (c: Chunk) => [...(byChunk.get(chunkKey(c)) ?? [])]

  return {
    seed,
    places,
    placesIn,
    classify(c) {
      if (byChunk.has(chunkKey(c))) return 'owned'
      return NEIGHBOURS_8.some(([dx, dz]) => byChunk.has(chunkKey([c[0] + dx, c[1] + dz]))) ? 'edge' : 'fog'
    },
    heightAt(x, z) {
      const raw = rawHeight(seed, x, z)
      const [cx, cz] = chunkAt(x, z)
      let pull = 0
      let weights = 0
      // A place only reaches a few meters past its own chunk, so the 3 by 3 chunks around the point are all that can matter.
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (const p of byChunk.get(chunkKey([cx + dx, cz + dz])) ?? []) {
            const [px, pz] = placeCentre(p)
            const ox = Math.max(Math.abs(x - px) - p.footprint[0] / 2, 0)
            const oz = Math.max(Math.abs(z - pz) - p.footprint[1] / 2, 0)
            const w = 1 - smoothstep(Math.hypot(ox, oz) / BLEND)
            if (w > 0) {
              pull += w * (baseOf(p) - raw)
              weights += w
            }
          }
        }
      }
      return raw + pull / Math.max(1, weights)
    },
  }
}

/** Empty chunks that touch an owned chunk on a side (spec 4.2, step 1), in a fixed order. */
export function placementCandidates(places: readonly LandPlace[]): Chunk[] {
  const owned = new Set(places.map((p) => chunkKey(p.chunk)))
  const seen = new Set<string>()
  const out: Chunk[] = []
  for (const p of places) {
    for (const [dx, dz] of NEIGHBOURS_4) {
      const c: Chunk = [p.chunk[0] + dx, p.chunk[1] + dz]
      const k = chunkKey(c)
      if (!owned.has(k) && !seen.has(k)) {
        seen.add(k)
        out.push(c)
      }
    }
  }
  return out.sort((a, b) => a[1] - b[1] || a[0] - b[0])
}

/** What a place that is about to be founded is like, for scoring where it goes. */
export interface Incoming {
  tags: readonly string[]
  /** Places the found call named as related. */
  related?: readonly string[]
}

const gridDistance = (a: Chunk, b: Chunk) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1])

/** How much one existing place pulls on a chunk: each shared tag counts 1, a named relation 0.5, over the grid distance (spec 4.2, step 2). */
export function pullOf(place: LandPlace, incoming: Incoming, chunk: Chunk): number {
  const shared = place.tags.filter((t) => incoming.tags.includes(t)).length
  const named = incoming.related?.includes(place.id) ? 0.5 : 0
  const d = gridDistance(place.chunk, chunk)
  return d === 0 ? 0 : (shared + named) / d
}

/** The candidate's whole score: the pull of every existing place. */
export const placementScore = (chunk: Chunk, incoming: Incoming, places: readonly LandPlace[]) => places.reduce((sum, p) => sum + pullOf(p, incoming, chunk), 0)

/**
 * Where a new place goes (spec 4.2): the highest-scoring candidate chunk, a tie broken by the seeded PRNG, so related places
 * cluster and districts form without a list of districts. Null when the world already has 64 places.
 */
export function choosePlacement(places: readonly LandPlace[], incoming: Incoming, seed: number): Chunk | null {
  if (places.length >= MAX_PLACES) return null
  const candidates = placementCandidates(places)
  if (candidates.length === 0) return null
  const scores = candidates.map((c) => placementScore(c, incoming, places))
  const best = Math.max(...scores)
  const tied = candidates.filter((_, i) => scores[i]! > best - 1e-9)
  const prng = createPrng((seed ^ Math.imul(places.length + 1, 0x9e3779b1)) >>> 0)
  return tied[prng.int(tied.length)]!
}

/** The founding clearing: chunk (0, 0) holds Home and the Workshop side by side (spec 4.1); every other chunk holds exactly one place. */
const CLEARING: Chunk = [0, 0]
const CLEARING_PLACES = ['home', 'workshop']

/** Everything wrong with where the places stand, or an empty list. */
export function layoutProblems(places: readonly LandPlace[]): string[] {
  const problems: string[] = []
  if (places.length > MAX_PLACES) problems.push(`the world may have at most ${MAX_PLACES} places (it has ${places.length})`)

  const byChunk = new Map<string, LandPlace[]>()
  for (const p of places) byChunk.set(chunkKey(p.chunk), [...(byChunk.get(chunkKey(p.chunk)) ?? []), p])
  for (const [key, group] of byChunk) {
    const clearing = key === chunkKey(CLEARING)
    if (group.length > 1 && !(clearing && group.length === 2 && group.every((p) => CLEARING_PLACES.includes(p.id)))) {
      problems.push(`chunk ${key} holds ${group.length} places (${group.map((p) => p.id).join(', ')}); each chunk holds exactly one, except the clearing, which holds Home and the Workshop`)
    }
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!
        const b = group[j]!
        const [ax, az] = placeCentre(a)
        const [bx, bz] = placeCentre(b)
        if (Math.abs(ax - bx) < (a.footprint[0] + b.footprint[0]) / 2 - 1e-9 && Math.abs(az - bz) < (a.footprint[1] + b.footprint[1]) / 2 - 1e-9) problems.push(`places ${a.id} and ${b.id} overlap in chunk ${key}`)
      }
    }
  }
  for (const p of places) {
    const [ox, oz] = p.offset ?? [0, 0]
    if (Math.abs(ox) + p.footprint[0] / 2 > CHUNK_SIZE / 2 + 1e-9 || Math.abs(oz) + p.footprint[1] / 2 > CHUNK_SIZE / 2 + 1e-9) problems.push(`place ${p.id}: the footprint must fit inside its chunk`)
  }

  // The world stays connected: every owned chunk can be reached from the clearing over owned chunks.
  const owned = new Set(places.map((p) => chunkKey(p.chunk)))
  if (owned.size > 0) {
    const start: Chunk = owned.has(chunkKey(CLEARING)) ? CLEARING : places[0]!.chunk
    const reached = new Set([chunkKey(start)])
    const queue: Chunk[] = [start]
    while (queue.length > 0) {
      const c = queue.shift()!
      for (const [dx, dz] of NEIGHBOURS_4) {
        const n: Chunk = [c[0] + dx, c[1] + dz]
        if (owned.has(chunkKey(n)) && !reached.has(chunkKey(n))) {
          reached.add(chunkKey(n))
          queue.push(n)
        }
      }
    }
    for (const p of places) if (!reached.has(chunkKey(p.chunk))) problems.push(`place ${p.id} at chunk ${chunkKey(p.chunk)} is not connected to the rest of the world`)
  }
  return problems
}
