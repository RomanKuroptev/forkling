import { createNavGrid, isWalkable, type NavGrid, type Point2 } from '@forkling/sim'
import type { SceneObject } from './open.ts'

/**
 * What a visitor bumps into (issues 357, 349, 348), decided on boxes so the walking and picture checks can be tested without a
 * browser. Furniture must stop the visitor before it, the visitor must stop short of Merge, and nothing may stand between the
 * merge-close camera and Merge.
 */

type Box = { min: readonly number[]; max: readonly number[] }

/** The visitor's capsule radius (apps/viewer/src/player/Player.tsx). */
export const CAPSULE = 0.3
/** A part lower than this is walked over (a rug, floor boards); one whose foot is higher than this above its floor hangs overhead. */
export const LOW = 0.35
export const OVERHEAD = 1.6
/** The visitor's middle must stay at least this far from Merge's drawn box: its capsule stops outside it (issues 357, 349). */
export const MERGE_GAP = CAPSULE

/** The drawn parts that stand on a room's floor in the visitor's way: the ones a walk into them must stop at. */
export function solidParts(scene: readonly SceneObject[]): (SceneObject & { box: NonNullable<SceneObject['box']> })[] {
  const rooms = new Map(scene.filter((o) => o.kind === 'room' && o.box).map((r) => [r.id, r.box!]))
  return scene.filter((o): o is SceneObject & { box: NonNullable<SceneObject['box']> } => {
    if (o.kind !== 'part' || !o.box || o.inDoorway || o.material === 'none') return false
    const room = rooms.get(o.id.split('/').slice(0, 2).join('/'))
    const floor = room ? room.min[1] : o.box.min[1]
    return o.box.max[1] - Math.max(o.box.min[1], floor) >= LOW && o.box.min[1] - floor <= OVERHEAD
  })
}

/**
 * Where along a walk from `start` heading `dir` (a unit vector on the ground) the line first meets a box, in meters, or null when
 * it misses it (the slab test on x and z).
 */
export function distanceToBox(start: Point2, dir: Point2, box: Box): number | null {
  let t0 = 0
  let t1 = Infinity
  for (const [p, d, lo, hi] of [[start.x, dir.x, box.min[0]!, box.max[0]!], [start.z, dir.z, box.min[2]!, box.max[2]!]] as const) {
    if (Math.abs(d) < 1e-9) {
      if (p < lo || p > hi) return null
      continue
    }
    let a = (lo - p) / d
    let b = (hi - p) / d
    if (a > b) [a, b] = [b, a]
    t0 = Math.max(t0, a)
    t1 = Math.min(t1, b)
  }
  return t0 <= t1 ? t0 : null
}

/**
 * Whether a walk from `start` heading `dir` that ended at `end` went into the box: its middle came nearer the box's near face than
 * half the capsule (a stop puts it a whole capsule radius away), or past it. False when the walk's line misses the box.
 */
export function walkedInto(start: Point2, dir: Point2, box: Box, end: Point2): boolean {
  const gap = distanceToBox(start, dir, box)
  if (gap === null) return false
  const travelled = (end.x - start.x) * dir.x + (end.z - start.z) * dir.z
  return travelled > gap - CAPSULE / 2
}

/** How far the visitor's middle is from Merge's drawn box on the ground, in meters (0 inside it). */
export function gapToBox(at: Point2, box: Box): number {
  const dx = Math.max(box.min[0]! - at.x, 0, at.x - box.max[0]!)
  const dz = Math.max(box.min[2]! - at.z, 0, at.z - box.max[2]!)
  return Math.hypot(dx, dz)
}

/**
 * The walking grid made fine (`cell` meters) and with the furniture in it, for the walks into places: the body's own grid is 1 m and
 * leaves furniture out, so its path ran straight through the bench inside Home's door. A fine cell is open where the body's grid
 * is and no part's box, widened by `inflate`, covers its middle.
 */
export function gridWithFurniture(grid: NavGrid, parts: readonly Box[], cell = 0.25, inflate = CAPSULE + 0.15): NavGrid {
  const k = Math.round(grid.cellSize / cell)
  const cols = grid.cols * k
  const rows = grid.rows * k
  const walkable = new Uint8Array(cols * rows)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = grid.originX + (col + 0.5) * cell
      const z = grid.originZ + (row + 0.5) * cell
      if (!isWalkable(grid, x, z)) continue
      if (parts.some((b) => x > b.min[0]! - inflate && x < b.max[0]! + inflate && z > b.min[2]! - inflate && z < b.max[2]! + inflate)) continue
      walkable[row * cols + col] = 1
    }
  }
  return createNavGrid({ cols, rows, cellSize: cell, originX: grid.originX, originZ: grid.originZ, walkable })
}

/**
 * A hit no higher than this over Merge's feet is the floor or lies flat on it (a rug, a visitor's note): a room's floor stands 14 cm
 * over the land Merge's feet are measured from (`FLOOR_TOP` in the viewer), and a rug 3 cm on that.
 */
export const FLAT = 0.2

/** One sight line of the merge-close camera: where it heads and how far it must be clear (to just short of Merge). */
export interface SightLine {
  dir: [number, number, number]
  reach: number
}

/**
 * Across the picture, nothing may be nearer the lens than this: the bench top 20 cm under it filled the bottom third (issue 348).
 * Further off, a bit of furniture in the picture is fine, so long as nothing stands between the lens and Merge.
 */
export const NEAR_LENS = 0.6
/** The merge-close camera stands no more than this many degrees round from straight in front of Merge's face, so the face reads. */
export const MAX_OFF_FACE = 45

/** How many degrees round from straight in front of Merge's face (Merge at `merge`, facing `heading`, 0 along +z) a lens stands. */
export function offFace(merge: Point2, heading: number, lens: readonly number[]): number {
  const a = Math.atan2(lens[0]! - merge.x, lens[2]! - merge.z) - heading
  return Math.abs((Math.atan2(Math.sin(a), Math.cos(a)) * 180) / Math.PI)
}

/**
 * The sight lines of a camera at `position` looking at `target` with Merge in `merge`: to Merge's feet, middle and top, each to
 * 0.3 m short of it, and a grid across the picture (`fovY` degrees tall, `aspect` wide over tall), each to `NEAR_LENS`.
 */
export function sightLines(position: readonly number[], target: readonly number[], merge: Box, fovY: number, aspect: number): SightLine[] {
  const norm = (v: number[]) => {
    const l = Math.hypot(v[0]!, v[1]!, v[2]!)
    return v.map((n) => n / l) as [number, number, number]
  }
  const mid = [0, 1, 2].map((k) => (merge.min[k]! + merge.max[k]!) / 2)
  const out: SightLine[] = []
  for (const y of [merge.min[1]! + 0.05, mid[1]!, merge.max[1]! - 0.05]) {
    const v = [mid[0]! - position[0]!, y - position[1]!, mid[2]! - position[2]!]
    out.push({ dir: norm(v), reach: Math.hypot(v[0]!, v[1]!, v[2]!) - 0.3 })
  }
  const fw = norm(target.map((v, k) => v - position[k]!))
  const right = norm([-fw[2], 0, fw[0]])
  const up = [right[1] * fw[2] - right[2] * fw[1], right[2] * fw[0] - right[0] * fw[2], right[0] * fw[1] - right[1] * fw[0]]
  const tY = Math.tan((fovY / 2) * (Math.PI / 180))
  const reach = Math.min(NEAR_LENS, Math.hypot(mid[0]! - position[0]!, mid[2]! - position[2]!) - 0.3)
  for (let i = -3; i <= 3; i++) {
    for (let j = -2; j <= 2; j++) {
      const a = (tY * aspect * i) / 3
      const b = (tY * j) / 2
      out.push({ dir: norm([0, 1, 2].map((k) => fw[k]! + right[k]! * a + up[k]! * b)), reach })
    }
  }
  return out
}

/**
 * What stands in the way of the merge-close picture: each sight line whose first hit is nearer than its reach, and is neither the
 * ground or lies flat on it (the hit point lower than Merge's feet and `FLAT`) nor Merge itself (a hit on its body, `of: 'merge'`, or inside its box).
 */
export function inTheWay(position: readonly number[], lines: readonly SightLine[], hits: readonly ({ distance: number; object: string; of?: string } | null)[], merge: Box): { object: string; distance: number; at: number[] }[] {
  const out: { object: string; distance: number; at: number[] }[] = []
  lines.forEach((l, i) => {
    const h = hits[i]
    if (!h || h.distance >= l.reach || h.of === 'merge') return
    const p = [0, 1, 2].map((k) => position[k]! + l.dir[k]! * h.distance)
    if (p[1]! < merge.min[1]! + FLAT) return
    if (p.every((v, k) => v >= merge.min[k]! - 0.05 && v <= merge.max[k]! + 0.05)) return
    out.push({ object: h.object, distance: h.distance, at: p.map((v) => Math.round(v * 100) / 100) })
  })
  return out
}
