import type { Kit, Place } from '@forkling/schema'
import { placeCentre, toLandPlace } from '@forkling/sim'
import { buildingModel } from '../world/building.ts'
import { SIGN_W, signSpot } from '../world/exhibitGeometry.ts'
import type { QaPose } from './registry.ts'

/** How far in front of a place's front the front camera stands at the least, in meters (the desktop picture). */
const NEAR = 7
/** Room kept at each side of what must be in the picture, in meters. */
const MARGIN = 0.8
const EYE = 1.6
const AIM = 2
const CORNERS = [-0.5, 0.5].flatMap((a) => [-0.5, 0.5].flatMap((b) => [-0.5, 0.5].map((c) => [a, b, c] as const)))

/**
 * The named camera `front:<place>` (audit spec 7.1): at eye height in front of the door, looking at the place. It stands 7 m in front
 * of the front, or further back when the picture is narrow (a phone held upright, issue 332), so the whole front, the title bar on it
 * and the sign beside the door are all in the picture. `aspect` is the picture's width over height, `fovY` its vertical field of view.
 */
export function frontPose(place: Place, kit: Kit, baseY: number, aspect: number, fovY: number): QaPose {
  const [x, z] = placeCentre(toLandPlace(place))
  const front = z + place.exterior.footprint[1] / 2
  const model = buildingModel(place, kit, baseY)
  const sign = signSpot(place, baseY).position
  // Every point that must be in the picture: the corners of the model's pieces (walls, eaves, the title bar) and of the sign.
  const points: [number, number, number][] = [
    [sign[0] - SIGN_W / 2, baseY + 2.1, sign[2]],
    [sign[0] + SIGN_W / 2, baseY + 2.1, sign[2]],
  ]
  for (const piece of model ? [...model.slots.body, ...model.slots.front, ...model.slots.crown] : []) {
    const m = piece.matrix
    for (const [a, b, c] of CORNERS) points.push([m[0]! * a + m[4]! * b + m[8]! * c + m[12]!, m[1]! * a + m[5]! * b + m[9]! * c + m[13]!, m[2]! * a + m[6]! * b + m[10]! * c + m[14]!])
  }
  if (!model) for (const sx of [-1, 1]) points.push([x + (sx * place.exterior.footprint[0]) / 2, baseY + 3, front])
  const tanY = Math.tan(((fovY / 2) * Math.PI) / 180)
  const tanX = tanY * aspect
  // How far in front of the front the camera must stand for each point to be inside the picture, with room to spare.
  let d = NEAR
  for (const [px, , pz] of points) {
    const ahead = pz - front
    d = Math.max(d, ahead + (Math.abs(px - x) + MARGIN) / tanX)
  }
  // Up to the top of the title bar with the place's name (what is above it, a roof's point, may leave the picture).
  const bar = model?.titleBar
  if (bar) d = Math.max(d, bar.position[2] - front + (bar.position[1] + bar.height / 2 - (baseY + EYE) + 0.3) / tanY)
  return { position: [x, baseY + EYE, front + d], target: [x, baseY + AIM, z] }
}

/** A box in world meters, as the scene list and `furnitureBoxes` give them. */
export interface PoseBox {
  min: readonly [number, number, number] | readonly number[]
  max: readonly [number, number, number] | readonly number[]
}

/** Whether the segment from `a` to `b` passes through the inside of `box` (the slab test). */
export function segmentHitsBox(a: readonly number[], b: readonly number[], box: PoseBox): boolean {
  let t0 = 0
  let t1 = 1
  for (let k = 0; k < 3; k++) {
    const d = b[k]! - a[k]!
    const lo = box.min[k]!
    const hi = box.max[k]!
    if (Math.abs(d) < 1e-9) {
      if (a[k]! <= lo || a[k]! >= hi) return false
      continue
    }
    let u0 = (lo - a[k]!) / d
    let u1 = (hi - a[k]!) / d
    if (u0 > u1) [u0, u1] = [u1, u0]
    t0 = Math.max(t0, u0)
    t1 = Math.min(t1, u1)
    if (t0 >= t1) return false
  }
  return true
}

/**
 * How far round Merge the merge-close camera may go from straight in front of its face, in order (never more than 45 deg, so the
 * face reads; issue 348's second look), how far away it may stand, and how high the lens may rise to look over furniture.
 */
export const CLOSE_MAX_TURN = 45
const CLOSE_TURNS = [0, 15, -15, 30, -30, 45, -45].map((d) => (d * Math.PI) / 180)
const CLOSE_DISTANCES = [1.5, 1.2, 1.0]
const CLOSE_HEIGHTS = [0.7, 1.1, 1.5]
/** The lens keeps this far from any box, so nothing is right in front of it. */
const LENS_CLEAR = 0.25
/** In the picture, nothing may be nearer the lens than this: a bench top 20 cm under it filled the bottom third (issue 348). */
export const NEAR_LENS = 0.6
/** Heights on Merge the lens must see, its feet to its face. */
const MERGE_POINTS = [0.05, 0.4, 0.8]
/** Half the picture's field of view, tall and wide (a laptop window, 70 deg tall), in radians: the corners of what the lens sees. */
const HALF_TALL = (35 * Math.PI) / 180
const HALF_WIDE = Math.atan(Math.tan(HALF_TALL) * 1.6)

/**
 * The named camera `merge-close`: low in front of Merge's face, looking at it, 1.5 m away. When a piece of furniture or a wall
 * stands between the lens and Merge (its feet to its face), or anything in the picture is right in front of the lens (issue 348:
 * the camera stood over the bench by Home's door, which filled the bottom third), it comes a little nearer or goes a little round
 * Merge, never more than 45 deg off the way it faces, so its face reads. When no such pose at eye level is clear, the lens rises to
 * look over the furniture; a bit of bench in the picture is better than Merge seen from the side. When none is clear at all, the
 * pose with the least in the way.
 */
export function mergeClosePose(merge: { x: number; z: number }, heading: number, heightAt: (x: number, z: number) => number, obstacles: readonly PoseBox[]): QaPose {
  const y = heightAt(merge.x, merge.z)
  const at = (turn: number, dist: number, high: number): QaPose => ({
    position: [merge.x + Math.sin(heading + turn) * dist, y + high, merge.z + Math.cos(heading + turn) * dist],
    target: [merge.x, y + 0.4, merge.z],
  })
  /** How many of the lens's sight lines a box crosses: to Merge, or across the picture right in front of the lens. */
  const blocked = (pose: QaPose): number => {
    const [cx, cy, cz] = pose.position
    const f = pose.target.map((v, k) => v - pose.position[k]!)
    const len = Math.hypot(f[0]!, f[1]!, f[2]!)
    const fw = f.map((v) => v / len)
    const rl = Math.hypot(fw[0]!, fw[2]!)
    const right = [-fw[2]! / rl, 0, fw[0]! / rl]
    const up = [right[1]! * fw[2]! - right[2]! * fw[1]!, right[2]! * fw[0]! - right[0]! * fw[2]!, right[0]! * fw[1]! - right[1]! * fw[0]!]
    // To Merge, up to just short of it: a piece it is sitting on or in, or one beside it, is not in front of it.
    const toMerge: number[][] = MERGE_POINTS.map((h) => {
      const end = [merge.x, y + h, merge.z]
      const l = Math.hypot(end[0]! - cx, end[1]! - cy, end[2]! - cz)
      const t = Math.max(0, (l - 0.3) / l)
      return [cx + (end[0]! - cx) * t, cy + (end[1]! - cy) * t, cz + (end[2]! - cz) * t]
    })
    // Across the picture, as far as `NEAR_LENS`.
    const near: number[][] = []
    for (let i = -3; i <= 3; i++) {
      for (let j = -2; j <= 2; j++) {
        const a = (Math.tan(HALF_WIDE) * i) / 3
        const b = (Math.tan(HALF_TALL) * j) / 2
        const d = [0, 1, 2].map((k) => fw[k]! + right[k]! * a + up[k]! * b)
        const dl = Math.hypot(d[0]!, d[1]!, d[2]!)
        near.push(d.map((v, k) => pose.position[k]! + (v / dl) * NEAR_LENS))
      }
    }
    let count = 0
    for (const b of obstacles) {
      if ([cx, cy, cz].every((v, k) => v > b.min[k]! - LENS_CLEAR && v < b.max[k]! + LENS_CLEAR)) count += toMerge.length + near.length
      for (const end of [...toMerge, ...near]) if (segmentHitsBox(pose.position, end, b)) count++
    }
    return count
  }
  let best = at(0, CLOSE_DISTANCES[0]!, CLOSE_HEIGHTS[0]!)
  let least = Infinity
  // Straight in front at eye level first; then a little nearer or a little round; then higher, looking over what is in the way.
  for (const high of CLOSE_HEIGHTS) {
    for (const turn of CLOSE_TURNS) {
      for (const dist of CLOSE_DISTANCES) {
        const pose = at(turn, dist, high)
        const n = blocked(pose)
        if (n === 0) return pose
        if (n < least) [best, least] = [pose, n]
      }
    }
  }
  return best
}
