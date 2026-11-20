import type { MindState } from '@forkling/schema'

/**
 * Real visits (issue #422). The viewer polls the mind server's `GET /now.json` every 30 seconds; its first poll of a page load
 * adds `visit=1`, and the first poll after the visitor walks into a place adds `in=<place id>`. The server counts those and
 * nothing else: no address, no id of a visitor, no new route and no new host. The tick adds the counts to the day in the mind
 * state, and the plan is shown them as data. A visitor who leaves within the first 30 seconds is not counted.
 */

/** What one poll says. */
export interface VisitHit {
  visit: boolean
  place: string | null
}

/** The counts since the last drain. */
export interface VisitHits {
  visitors: number
  places: Record<string, number>
}

/** Where the counts come from in a tick: the server's counter, or the fast-forward's simulated visits. */
export interface VisitSource {
  drain(): VisitHits
}

/** A counter between two ticks stops here, so a flood of requests cannot grow it. */
export const MAX_HITS_BETWEEN_DRAINS = 500
const MAX_PLACES = 64
const PLACE_ID = /^[a-z0-9][a-z0-9-]{0,79}$/

/** The visit in a poll's query, or null when it says nothing. A place that is not a place id is left out. */
export function visitFromQuery(query: URLSearchParams): VisitHit | null {
  const visit = query.get('visit') === '1'
  const raw = query.get('in')
  const place = raw !== null && PLACE_ID.test(raw) ? raw : null
  return visit || place ? { visit, place } : null
}

export function createVisitCounter(): VisitSource & { record(hit: VisitHit): void } {
  let visitors = 0
  let places: Record<string, number> = {}
  let placeHits = 0
  return {
    record(hit) {
      if (hit.visit && visitors < MAX_HITS_BETWEEN_DRAINS) visitors++
      if (hit.place && placeHits < MAX_HITS_BETWEEN_DRAINS && (hit.place in places || Object.keys(places).length < MAX_PLACES)) {
        placeHits++
        places[hit.place] = (places[hit.place] ?? 0) + 1
      }
    },
    drain() {
      const out = { visitors, places }
      visitors = 0
      places = {}
      placeHits = 0
      return out
    },
  }
}

type DayVisits = NonNullable<MindState['visits']>

/** The day's visits with the new counts added: a new local date starts from zero, and a place that does not exist is left out. */
export function addVisits(state: DayVisits | undefined, hits: VisitHits, today: string, placeIds: readonly string[]): DayVisits | undefined {
  const sameDay = state?.date === today
  const known = Object.entries(hits.places).filter(([id, n]) => n > 0 && placeIds.includes(id))
  if (sameDay && hits.visitors === 0 && known.length === 0) return state
  const places: Record<string, number> = sameDay ? { ...state!.places } : {}
  for (const [id, n] of known) places[id] = (places[id] ?? 0) + n
  return { date: today, visitors: (sameDay ? state!.visitors : 0) + hits.visitors, places }
}

/** What a plan is shown: today's visitors and places, the most visited first. Another day's counts are nobody today. */
export function visitsForPrompt(state: DayVisits | undefined, today: string): { visitors: number; places: { id: string; count: number }[] } {
  if (!state || state.date !== today) return { visitors: 0, places: [] }
  const places = Object.entries(state.places)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))
  return { visitors: state.visitors, places }
}
