import { drawPrng } from './prng.ts'

/** Spec 12.4, item 5: souvenirs from two places at least 2 chunks apart (the grid distance of 4.2, Manhattan). */
export const COLLISION_MIN_DISTANCE = 2
/** A souvenir kept in the last 3 days is preferred for a collision, and one used in a collision is not offered again for 7 (audit 17 Nov). */
export const COLLISION_FRESH_DAYS = 3
export const COLLISION_REUSE_DAYS = 7

export interface CollisionPlace {
  id: string
  chunk: readonly [number, number]
  tags: readonly string[]
}
export interface CollisionSouvenir {
  id: string
  /** The place whose exhibit holds it, or null while it is in the pile. */
  placedIn: string | null
  topics: readonly string[]
  /** When it was kept (an ISO time). Without it a souvenir is never fresh. */
  at?: string
}

/** Two souvenirs to put side by side: from two far places, or from two interests that share no place. */
export type Collision =
  | { how: 'places'; a: { souvenir: string; place: string }; b: { souvenir: string; place: string } }
  | { how: 'interests'; a: { souvenir: string; interest: string }; b: { souvenir: string; interest: string } }

export interface CollisionInput {
  places: readonly CollisionPlace[]
  souvenirs: readonly CollisionSouvenir[]
  /** The interests that exist, by name. */
  interests: readonly string[]
  /** The time of the draw: with it, souvenirs kept in the last 3 days are preferred. */
  nowMs?: number
  /** The souvenirs that were in a collision in the last 7 days: never offered again. */
  usedRecently?: readonly string[]
}

const lower = (s: string) => s.toLowerCase()
const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/**
 * The collision a tinker, expand or found call is offered (spec 12.4, item 5): one pair of souvenirs, chosen by the seeded
 * PRNG from the draw's key. Either from two places at least 2 chunks apart, or from two interests that share no place;
 * when both are possible, the draw picks which. Offered, never ordered: it is null when there is nothing to put together.
 * The result does not depend on the order of the lists.
 */
export function drawCollision(input: CollisionInput, seed: number, key: string): Collision | null {
  const rng = drawPrng(seed, key)
  const places = [...input.places].sort(byId)
  const used = new Set(input.usedRecently ?? [])
  const souvenirs = input.souvenirs.filter((s) => !used.has(s.id)).sort(byId)
  const freshFrom = input.nowMs === undefined ? Infinity : input.nowMs - COLLISION_FRESH_DAYS * 86_400_000
  const fresh = new Set(souvenirs.filter((s) => s.at !== undefined && Date.parse(s.at) >= freshFrom).map((s) => s.id))
  /** The ones with a fresh souvenir in them when there are any, otherwise all of them. */
  const preferFresh = <T>(list: readonly T[], has: (x: T) => boolean): readonly T[] => {
    const f = list.filter(has)
    return f.length > 0 ? f : list
  }
  const placeOf = new Map(places.map((p) => [p.id, p]))

  const farPairs: Extract<Collision, { how: 'places' }>[] = []
  const placed = souvenirs.filter((s) => s.placedIn !== null && placeOf.has(s.placedIn))
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const [s, t] = [placed[i]!, placed[j]!]
      if (s.placedIn === t.placedIn) continue
      const [p, q] = [placeOf.get(s.placedIn!)!, placeOf.get(t.placedIn!)!]
      if (Math.abs(p.chunk[0] - q.chunk[0]) + Math.abs(p.chunk[1] - q.chunk[1]) < COLLISION_MIN_DISTANCE) continue
      farPairs.push({ how: 'places', a: { souvenir: s.id, place: p.id }, b: { souvenir: t.id, place: q.id } })
    }
  }

  const interests = [...new Set(input.interests)].sort()
  const carrying = (interest: string) => souvenirs.filter((s) => s.topics.some((t) => lower(t) === lower(interest)))
  const sharePlace = (x: string, y: string) => places.some((p) => p.tags.some((t) => lower(t) === lower(x)) && p.tags.some((t) => lower(t) === lower(y)))
  const interestPairs: [string, string][] = []
  for (let i = 0; i < interests.length; i++) {
    for (let j = i + 1; j < interests.length; j++) {
      const [x, y] = [interests[i]!, interests[j]!]
      if (lower(x) === lower(y) || sharePlace(x, y)) continue
      const [cx, cy] = [carrying(x), carrying(y)]
      if (cx.length === 0 || cy.length === 0) continue
      if (cx.length === 1 && cy.length === 1 && cx[0]!.id === cy[0]!.id) continue
      interestPairs.push([x, y])
    }
  }

  const farChoice = preferFresh(farPairs, (p) => fresh.has(p.a.souvenir) || fresh.has(p.b.souvenir))
  const carryingFresh = (x: string, y: string) => carrying(x).some((a) => carrying(y).some((b) => b.id !== a.id && (fresh.has(a.id) || fresh.has(b.id))))
  const interestChoice = preferFresh(interestPairs, ([x, y]) => carryingFresh(x, y))

  const useInterests = farPairs.length === 0 ? interestPairs.length > 0 : interestPairs.length > 0 && rng.int(2) === 1
  if (!useInterests) return farChoice.length > 0 ? farChoice[rng.int(farChoice.length)]! : null

  const [x, y] = interestChoice[rng.int(interestChoice.length)]!
  const pairs = carrying(x).flatMap((a) => carrying(y).filter((b) => b.id !== a.id).map((b) => [a, b] as const))
  const both = preferFresh(pairs, ([a, b]) => fresh.has(a.id) || fresh.has(b.id))
  const [a, b] = both[rng.int(both.length)]!
  return { how: 'interests', a: { souvenir: a.id, interest: x }, b: { souvenir: b.id, interest: y } }
}
