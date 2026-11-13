/**
 * Neglect (spec 4.4): days since the last care on a place, as a level. 0 to 6 days is fresh, 7 to 13 quiet (lamps off),
 * 14 to 27 dusty, 28 or more overgrown. Any care resets the count to 0. Nothing is ever removed from the world.
 */
export type NeglectLevel = 0 | 1 | 2 | 3

export function neglectLevel(days: number): NeglectLevel {
  if (days >= 28) return 3
  if (days >= 14) return 2
  if (days >= 7) return 1
  return 0
}

/** Home and the Workshop are lived in every day, so they never go above level 1. */
export const NEVER_NEGLECTED = ['home', 'workshop'] as const

const DAY_MS = 86_400_000

/** Whole days since the last care, or since the place was founded if it was never cared for. Time comes in; this never reads a clock. */
export function daysSinceCare(place: { lastCareAt: string | null; founded: string }, nowMs: number): number {
  const since = place.lastCareAt !== null ? Date.parse(place.lastCareAt) : Date.parse(`${place.founded}T00:00:00Z`)
  if (!Number.isFinite(since)) return 0
  return Math.max(0, Math.floor((nowMs - since) / DAY_MS))
}

export function neglectFor(place: { id: string; lastCareAt: string | null; founded: string }, nowMs: number): NeglectLevel {
  const level = neglectLevel(daysSinceCare(place, nowMs))
  return (NEVER_NEGLECTED as readonly string[]).includes(place.id) ? (Math.min(level, 1) as NeglectLevel) : level
}
