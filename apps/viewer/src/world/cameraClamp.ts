import type { Kit, Place } from '@forkling/schema'
import { placeCentre, toLandPlace } from '@forkling/sim'
import { floorHeight } from './kitBase.ts'
import { wallBoxes } from './kitGeometry.ts'

/**
 * Keeping the visitor's camera out of the buildings (pure, so it is tested without a renderer). The camera orbits the visitor at
 * the distance and angles the visitor chose; each frame this finds where it may really be: in front of the first wall, floor or
 * roof between it and the visitor (so indoors it stays inside, under the ceiling, and outdoors it never goes into a roof), and
 * above the ground. Nothing here changes the visitor's own orbit; it only decides where the camera is let to stand.
 */
export type Vec3 = readonly [number, number, number]

/** An axis-aligned box the camera may not enter or look through. */
export interface Solid {
  id: string
  min: Vec3
  max: Vec3
}

/** How far the camera keeps from a wall, a floor or a roof, in meters (the near plane and the lens are well inside it). */
export const CAMERA_CLEARANCE = 0.25
/** How far above the ground the camera keeps. */
const GROUND_CLEARANCE = 0.35
/** Pulled in closer than this to the visitor, the camera tries to look from higher up instead. */
const COMFORT = 1.4
/** A little further in than the surface it stopped at, so rounding never leaves it on the wrong side. */
const SLACK = 0.02

type Ground = (x: number, z: number) => number

// ---------- the solids ----------

/**
 * The solids of one place standing on `baseY`: the walls (the same boxes the visitor's physics uses, with the same gap at the door),
 * a slab at each floor above the ground floor, and the roof. A roof is stepped boxes that cover the whole of its real shape (a gable
 * a ridge along z narrowing upward, a cone a pyramid), so the camera is never inside it, and may be a little further from it than it
 * needs to be.
 */
export function placeSolids(place: Place, kit: Kit, baseY: number): Solid[] {
  const [px, pz] = placeCentre(toLandPlace(place))
  const [fw, fd] = place.exterior.footprint
  const height = floorHeight(place)
  const floors = place.exterior.floors
  const top = baseY + height * floors
  const out: Solid[] = wallBoxes(place).map((w, i) => ({ id: `${place.id}:wall${i}`, min: [w.x0, baseY, w.z0], max: [w.x1, baseY + w.height, w.z1] }))
  for (let f = 1; f < floors; f++) out.push({ id: `${place.id}:floor${f}`, min: [px - fw / 2, baseY + f * height - 0.1, pz - fd / 2], max: [px + fw / 2, baseY + f * height + 0.1, pz + fd / 2] })

  const style = kit.styles.find((s) => s.id === place.exterior.style) ?? kit.styles[0]!
  const roof = kit.parts.find((p) => p.id === style.roof)
  const rise = roof?.size[1] ?? 1.5
  const [hx, hz] = [(fw + 1.2) / 2, (fd + 1.2) / 2]
  // How the roof narrows going up: not at all (flat, or a roof this does not know), along x only (gable), or both ways (cone).
  const [steps, narrowX, narrowZ] = roof?.id === 'roof-gable' ? [5, true, false] : roof?.id === 'roof-cone' ? [6, true, true] : [1, false, false]
  for (let k = 0; k < steps; k++) {
    const [ax, az] = [narrowX ? 1 - k / steps : 1, narrowZ ? 1 - k / steps : 1]
    out.push({ id: `${place.id}:roof${k}`, min: [px - hx * ax, top + (k * rise) / steps, pz - hz * az], max: [px + hx * ax, top + ((k + 1) * rise) / steps, pz + hz * az] })
  }
  return out
}

/** The solids of every place, each on the ground under its middle. */
export function worldSolids(places: readonly Place[], kit: Kit, ground: Ground): Solid[] {
  return places.flatMap((place) => {
    const [px, pz] = placeCentre(toLandPlace(place))
    return placeSolids(place, kit, ground(px, pz))
  })
}

/** The solids within `radius` of a point, to keep the frame's work small in a world of many places. */
export function nearSolids(solids: readonly Solid[], at: Vec3, radius: number): Solid[] {
  return solids.filter((s) => {
    const [dx, dy, dz] = [0, 1, 2].map((i) => Math.max(s.min[i]! - at[i]!, 0, at[i]! - s.max[i]!))
    return Math.hypot(dx!, dy!, dz!) <= radius
  })
}

// ---------- the clamp ----------

const inflate = (s: Solid, by: number): Solid => ({ id: s.id, min: [s.min[0] - by, s.min[1] - by, s.min[2] - by], max: [s.max[0] + by, s.max[1] + by, s.max[2] + by] })
const contains = (p: Vec3, s: Solid) => p.every((v, i) => v > s.min[i]! && v < s.max[i]!)

/** Where along `origin + t * dir` (t from 0 to 1) a segment first enters a box, or null if it does not, or starts inside it. */
function entry(origin: Vec3, dir: Vec3, s: Solid): number | null {
  let t0 = 0
  let t1 = 1
  for (let i = 0; i < 3; i++) {
    const d = dir[i]!
    if (Math.abs(d) < 1e-12) {
      if (origin[i]! <= s.min[i]! || origin[i]! >= s.max[i]!) return null
      continue
    }
    let near = (s.min[i]! - origin[i]!) / d
    let far = (s.max[i]! - origin[i]!) / d
    if (near > far) [near, far] = [far, near]
    t0 = Math.max(t0, near)
    t1 = Math.min(t1, far)
    if (t1 <= t0) return null
  }
  // Starting inside is not an entry: a visitor pressed against a wall is within its clearance, and must not trap the camera.
  return t0 > 1e-9 ? t0 : null
}

interface Pulled {
  position: Vec3
  distance: number
  pulled: boolean
}

/** The farthest the camera may be along the line from `target` towards `wanted`: in front of any solid, and above the ground. */
function pull(target: Vec3, wanted: Vec3, solids: readonly Solid[], ground: Ground | undefined): Pulled {
  const dir: Vec3 = [wanted[0] - target[0], wanted[1] - target[1], wanted[2] - target[2]]
  const length = Math.hypot(dir[0], dir[1], dir[2])
  if (length < 1e-9) return { position: wanted, distance: 0, pulled: false }
  let t = 1
  for (const solid of solids) {
    // Kept clear of by the clearance; but a visitor already within that clearance of a wall is measured against the wall itself.
    // A hair less than the clearance, so a line that only touches the edge of the clearance (a corner at exactly 45 degrees) is not a hit.
    const grown = inflate(solid, CAMERA_CLEARANCE - 1e-4)
    const hit = entry(target, dir, contains(target, grown) ? solid : grown)
    if (hit !== null && hit < t) t = hit
  }
  if (t < 1) t = Math.max(0, t - SLACK / length)
  if (ground) t = aboveGround(target, dir, t, ground)
  const position: Vec3 = t >= 1 ? wanted : [target[0] + dir[0] * t, target[1] + dir[1] * t, target[2] + dir[2] * t]
  return { position, distance: t * length, pulled: t < 1 }
}

/** Shortens `end` (0 to 1 along the line) until the whole line from the visitor is above the ground. */
function aboveGround(target: Vec3, dir: Vec3, end: number, ground: Ground): number {
  const clear = (t: number) => target[1] + dir[1] * t >= ground(target[0] + dir[0] * t, target[2] + dir[2] * t) + GROUND_CLEARANCE
  const steps = 24
  let last = 0
  for (let i = 1; i <= steps; i++) {
    const t = (end * i) / steps
    if (clear(t)) {
      last = t
      continue
    }
    // Between the last clear point and this one the line meets the ground: find where.
    let [lo, hi] = [last, t]
    for (let k = 0; k < 20; k++) {
      const mid = (lo + hi) / 2
      if (clear(mid)) lo = mid
      else hi = mid
    }
    return lo
  }
  return end
}

/** The directions tried when the camera is hard against the visitor, as turns about y and lifts, in radians. */
const TURNS = Array.from({ length: 25 }, (_, k) => ((k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * (15 * Math.PI)) / 180)
const LIFTS = Array.from({ length: 9 }, (_, k) => (k * 10 * Math.PI) / 180)
const LIFT_MAX = (80 * Math.PI) / 180

/**
 * Where the camera may stand when the visitor wants it at : there if the view is clear, otherwise pulled in along the same
 * line to just in front of whatever is in the way. When that would put it hard against the visitor (the visitor is pressed to a
 * wall, or stands in a small room), it looks from another direction instead: the nearest one to the wanted direction (turning to
 * either side and looking from higher up) that gives a usable distance.
 */
export function clampCamera(target: Vec3, wanted: Vec3, solids: readonly Solid[], opts: { ground?: Ground } = {}): Vec3 {
  const first = pull(target, wanted, solids, opts.ground)
  if (!first.pulled) return first.position
  const length = Math.hypot(wanted[0] - target[0], wanted[1] - target[1], wanted[2] - target[2])
  const usable = Math.min(COMFORT, length)
  if (first.distance >= usable) return first.position
  const horizontal = Math.hypot(wanted[0] - target[0], wanted[2] - target[2])
  const turn0 = Math.atan2(wanted[0] - target[0], wanted[2] - target[2])
  const lift0 = Math.atan2(wanted[1] - target[1], horizontal)
  // Every direction to try, the ones nearest the wanted direction first.
  const tries: { cost: number; position: Vec3 }[] = []
  for (const turn of TURNS) {
    for (const extra of LIFTS) {
      const lift = Math.min(lift0 + extra, LIFT_MAX)
      if (extra > 0 && lift <= lift0) continue
      const azimuth = turn0 + turn
      tries.push({
        cost: Math.acos(Math.min(1, Math.max(-1, Math.cos(lift) * Math.cos(lift0) * Math.cos(turn) + Math.sin(lift) * Math.sin(lift0)))),
        position: [target[0] + Math.sin(azimuth) * Math.cos(lift) * length, target[1] + Math.sin(lift) * length, target[2] + Math.cos(azimuth) * Math.cos(lift) * length],
      })
    }
  }
  tries.sort((a, b) => a.cost - b.cost)
  let best = first
  for (const { position } of tries) {
    const candidate = pull(target, position, solids, opts.ground)
    if (candidate.distance > best.distance) best = candidate
    if (best.distance >= usable) break
  }
  return best.position
}

// ---------- easing ----------

/** Whether the camera at `camera` is inside a solid, or has one between it and the visitor. */
function blocked(target: Vec3, camera: Vec3, solids: readonly Solid[]): boolean {
  const dir: Vec3 = [camera[0] - target[0], camera[1] - target[1], camera[2] - target[2]]
  return solids.some((s) => contains(camera, s) || entry(target, dir, s) !== null)
}

/** How fast the camera glides back out once the way is open, per second (about 0.15 s to cover most of the way). */
const GLIDE = 7

/**
 * The camera to show this frame. A camera that would now be blocked (behind a wall the visitor has just come up to) snaps to the
 * clamped position at once, so a wall is never seen from behind. When the way is open the camera glides out to the wanted
 * position instead of jumping, and the frame is checked: a glide that would cross anything snaps too.
 */
export function easeCamera(args: { shown: Vec3; target: Vec3; wanted: Vec3; solids: readonly Solid[]; dt: number; ground?: Ground }): Vec3 {
  const { shown, target, wanted, solids, dt, ground } = args
  const under = (p: Vec3) => (ground ? p[1] < ground(p[0], p[2]) + GROUND_CLEARANCE * 0.8 : false)
  if (blocked(target, shown, solids) || under(shown)) return wanted
  const k = 1 - Math.exp(-GLIDE * dt)
  const next: Vec3 = [shown[0] + (wanted[0] - shown[0]) * k, shown[1] + (wanted[1] - shown[1]) * k, shown[2] + (wanted[2] - shown[2]) * k]
  if (Math.hypot(wanted[0] - next[0], wanted[1] - next[1], wanted[2] - next[2]) < 0.005) return wanted
  return blocked(target, next, solids) || under(next) ? wanted : next
}
