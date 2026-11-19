/**
 * The visitor keeps a small distance from Merge (issues 357, 349). Merge's own collider is the size of the sim's small body, but it
 * is drawn twice as big, so a visitor walking at it ended with the camera on top of it, its face cut by the edge of a phone. Like
 * `keepOnLand`, this works on positions: a step that would bring the visitor's middle nearer Merge's than `KEEP_FROM_MERGE` (or
 * nearer than it already was, when Merge walked up to it) is put back on that circle, so the visitor slides round Merge. It never
 * pushes a visitor away: a step away from Merge, or one that stays far enough, is left alone.
 */

/** How near the visitor's middle comes to Merge's, in meters: its face, 0.5 m wide, then fits on a phone held upright. */
export const KEEP_FROM_MERGE = 1.2

interface Point {
  x: number
  z: number
}

/** Where the visitor stands after stepping from `prev` to `next` with Merge at `merge`: null when the step is fine as it is. */
export function keepAwayFrom(merge: Point, prev: Point, next: Point, keep = KEEP_FROM_MERGE): Point | null {
  const dNext = Math.hypot(next.x - merge.x, next.z - merge.z)
  if (dNext >= keep) return null
  const dPrev = Math.hypot(prev.x - merge.x, prev.z - merge.z)
  if (dNext >= dPrev) return null
  const r = Math.min(keep, dPrev)
  // Straight onto Merge's middle: back the way it came.
  const [ux, uz] = dNext > 1e-6 ? [(next.x - merge.x) / dNext, (next.z - merge.z) / dNext] : [(prev.x - merge.x) / (dPrev || 1), (prev.z - merge.z) / (dPrev || 1)]
  return { x: merge.x + ux * r, z: merge.z + uz * r }
}
