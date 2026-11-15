import { neglectFor } from './neglect.ts'
import { maxSimilarity } from './novelty.ts'

/** What the place nudges need of a place. */
export interface PlaceNudgeLike {
  id: string
  name: string
  purpose: string
  founded: string
  lastCareAt: string | null
  closed?: boolean
}

/** What the repeated-place nudge needs of a request: a gift is Roman's choice of name, so it is left alone. */
export interface PlaceNudgeRequest {
  id: string
  kind: 'place' | 'gift'
  name: string
  purpose: string
  written: string
}

/** A step it started, from `memory/timeline/`. */
export interface PlaceNudgeStep {
  at: string
  verb: string
  targetId?: string
}

/** A new place's name over 0.5, or its purpose over 0.4, like an existing one would trip the nudge (spec 12.3). */
export const PLACE_NAME_SIMILARITY = 0.5
export const PLACE_PURPOSE_SIMILARITY = 0.4
/** More than this many steps on one place other than Home in a day would trip the stuck nudge (spec 12.3). */
export const STUCK_STEPS_PER_DAY = 3

export interface PlaceNudge {
  id: string
  why: string
}

const foundedMs = (p: { founded: string }) => Date.parse(`${p.founded}T00:00:00Z`)

/**
 * The repeated-place nudge (spec 12.3): a new place whose name is over 0.5, or whose purpose is over 0.4, like an existing place.
 * A place founded since `sinceMs` is compared with the places founded before it (the same day goes by id), and a request for a
 * new place written since then is compared with every place there is. A gift is not Merge's choice, so it is never reported.
 * Measured and logged, never enforced: nothing here turns a place or a request away.
 */
export function repeatedPlaces(places: readonly PlaceNudgeLike[], requests: readonly PlaceNudgeRequest[], opts: { sinceMs: number }): PlaceNudge[] {
  const list = [...places].sort((a, b) => foundedMs(a) - foundedMs(b) || a.id.localeCompare(b.id))
  const out: PlaceNudge[] = []
  const check = (id: string, name: string, purpose: string, against: readonly PlaceNudgeLike[]) => {
    if (against.length === 0) return
    if (maxSimilarity(name, against.map((p) => p.name)) > PLACE_NAME_SIMILARITY) out.push({ id, why: 'its name is like an existing place' })
    if (maxSimilarity(purpose, against.map((p) => p.purpose)) > PLACE_PURPOSE_SIMILARITY) out.push({ id, why: 'its purpose is like an existing place' })
  }
  list.forEach((p, i) => {
    if (foundedMs(p) >= opts.sinceMs) check(p.id, p.name, p.purpose, list.slice(0, i))
  })
  for (const r of requests) {
    if (r.kind === 'place' && Date.parse(r.written) >= opts.sinceMs) check(`request:${r.id}`, r.name, r.purpose, list)
  }
  return out
}

/**
 * The stuck-in-one-place nudge (spec 12.3): a place other than Home is the target of more than 3 steps in a day. `dayOf` turns a
 * moment into the forkling's own day (the UTC date when none is given).
 */
export function stuckInOnePlace(
  steps: readonly PlaceNudgeStep[],
  placeIds: readonly string[],
  opts: { sinceMs: number; dayOf?: (iso: string) => string },
): { id: string; day: string; count: number }[] {
  const dayOf = opts.dayOf ?? ((iso: string) => iso.slice(0, 10))
  const known = new Set(placeIds)
  const counts = new Map<string, { id: string; day: string; count: number }>()
  for (const s of steps) {
    if (!s.targetId || s.targetId === 'home' || !known.has(s.targetId) || Date.parse(s.at) < opts.sinceMs) continue
    const day = dayOf(s.at)
    const key = `${day}|${s.targetId}`
    const entry = counts.get(key) ?? { id: s.targetId, day, count: 0 }
    entry.count++
    counts.set(key, entry)
  }
  return [...counts.values()].filter((e) => e.count > STUCK_STEPS_PER_DAY).sort((a, b) => a.day.localeCompare(b.day) || a.id.localeCompare(b.id))
}

/**
 * The weekend-revisit nudge (spec 12.3): a place at neglect 1 or more that had no care all week. Neglect 1 starts at 7 days without
 * care, so this is exactly the places at level 1 or more at the time of asking; asked at the week's end it is the spec's rule.
 */
export function neglectedPlaces(places: readonly PlaceNudgeLike[], nowMs: number): string[] {
  return places.filter((p) => neglectFor(p, nowMs) >= 1).map((p) => p.id)
}

export interface PlaceNovelty {
  wouldFire: number
  repeatedPlace: number
  stuckInOnePlace: number
  weekendRevisit: number
}

/** The place numbers of the week in `mind/health.json` (spec 12.6): how many places or requests, day-places and places each nudge would have named. */
export function placeNovelty(input: {
  places: readonly PlaceNudgeLike[]
  requests: readonly PlaceNudgeRequest[]
  steps: readonly PlaceNudgeStep[]
  nowMs: number
  sinceMs: number
  dayOf?: (iso: string) => string
}): PlaceNovelty {
  const repeatedPlace = new Set(repeatedPlaces(input.places, input.requests, { sinceMs: input.sinceMs }).map((n) => n.id)).size
  const stuck = stuckInOnePlace(input.steps, input.places.map((p) => p.id), { sinceMs: input.sinceMs, ...(input.dayOf ? { dayOf: input.dayOf } : {}) }).length
  const weekendRevisit = neglectedPlaces(input.places, input.nowMs).length
  return { wouldFire: repeatedPlace + stuck + weekendRevisit, repeatedPlace, stuckInOnePlace: stuck, weekendRevisit }
}
