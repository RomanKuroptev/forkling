/**
 * The visitor keeps a small distance from Merge (issues 357, 349). Merge's own collider is the size of the sim's small body, but it
 * is drawn twice as big, so a visitor walking at it ended with the camera on top of it, its face cut by the edge of a phone. Like
 * `keepOnLand`, this works on positions: a step that would bring the visitor's middle nearer Merge's than `KEEP_FROM_MERGE` (or
 * nearer than it already was, when Merge walked up to it) is put back on that circle, so the visitor slides round Merge. It never
 * pushes a visitor away: a step away from Merge, or one that stays far enough, is left alone.
 */

/** How near the visitor's middle comes to Merge's indoors, in meters: its face, 0.5 m wide there, then fits on a phone held upright, and
 * shows whole in the lower part of the picture when the visitor looks a little down (nearer, the camera looks down onto its head). */
export const KEEP_FROM_MERGE = 1.6
/**
 * How near the visitor's middle comes to Merge's from behind, indoors, in meters. The distance in front is for its face; behind it
 * there is no face to fit, only its back (0.34 m behind its middle) for the camera to stay off. The full distance all round left
 * Merge, sitting in the middle of Home facing the back wall, keeping a visitor 1.3 m from its back with nothing in front of the
 * visitor but air: an invisible wall short of the room's middle (day-30).
 */
export const BEHIND_MERGE = 1.0
/** Merge's drawn scale indoors (`INDOOR_SCALE` in `Forkling.tsx`), the size `KEEP_FROM_MERGE` is for. */
const INDOOR_SCALE = 1.35

/** The distance for Merge drawn at `scale`: on open land it is drawn bigger (twice), and its face with it, so the visitor stays further off. */
export const keepFor = (scale: number): number => (KEEP_FROM_MERGE * scale) / INDOOR_SCALE

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

/**
 * One step of the visitor near Merge, with its speed `v` on the ground: where it stands (`keepAwayFrom`) and the speed it keeps, or
 * null when the step is fine as it is. Only the part of the speed toward Merge is lost; the part round it stays, so the visitor goes
 * on sliding past. Stopping it dead each frame (the first try) left a visitor that Merge had walked up to stuck where it stood, unable
 * to walk on past Merge with nothing in front of it: an invisible wall (day-0, inside Home's door).
 */
export function keepAwayStep(merge: Point, prev: Point, next: Point, v: Point, keep = KEEP_FROM_MERGE, heading?: number): { at: Point; v: Point } | null {
  // The circle kept clear: round Merge's middle, or, when the way it faces is known, moved forward so it reaches `keep` in front of
  // its face and only `keep * BEHIND_MERGE / KEEP_FROM_MERGE` behind it.
  let centre = merge
  let radius = keep
  if (heading !== undefined) {
    const back = (keep * BEHIND_MERGE) / KEEP_FROM_MERGE
    const shift = (keep - back) / 2
    centre = { x: merge.x + Math.sin(heading) * shift, z: merge.z + Math.cos(heading) * shift }
    radius = (keep + back) / 2
  }
  const at = keepAwayFrom(centre, prev, next, radius)
  if (!at) return null
  const d = Math.hypot(at.x - centre.x, at.z - centre.z)
  if (d < 1e-6) return { at, v: { x: 0, z: 0 } }
  const ux = (at.x - centre.x) / d
  const uz = (at.z - centre.z) / d
  const out = v.x * ux + v.z * uz
  return { at, v: out >= 0 ? v : { x: v.x - out * ux, z: v.z - out * uz } }
}
