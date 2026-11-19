import { chunkAt, type Land } from '@forkling/sim'

/**
 * Keeps the visitor on the drawn land (the owned and edge chunks). Past the last edge chunk there is no ground and no collider,
 * so a visitor who walked on fell under the world (issues 340 and 351). The fog walls stand on that edge, so the visitor stops
 * in the mist, a little inside it. Works on positions, so the keys, the phone stick and a jump are held the same way.
 */

/** How far from the end of the land the visitor's middle stops, in meters: more than the capsule's radius, so it stays on the ground. */
export const EDGE_MARGIN = 1
/** A visitor put nearer the end than `EDGE_MARGIN` (by `?stand=` or a teleport) is held at this, so it can still walk back in. */
const INNER_MARGIN = 0.35

interface Point {
  x: number
  z: number
}

/** True when the square `margin` meters round (x, z) lies on drawn land, none of it in the fog. */
export function onLand(land: Land, x: number, z: number, margin = EDGE_MARGIN): boolean {
  for (const dx of [-margin, margin]) for (const dz of [-margin, margin]) if (land.classify(chunkAt(x + dx, z + dz)) === 'fog') return false
  return true
}

/** The farthest point from `from` (on land) towards `to` that is still on land, found by halving. */
function farthest(land: Land, from: Point, to: Point, margin: number): Point {
  if (onLand(land, to.x, to.z, margin)) return to
  let lo = 0
  let hi = 1
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    if (onLand(land, from.x + (to.x - from.x) * mid, from.z + (to.z - from.z) * mid, margin)) lo = mid
    else hi = mid
  }
  return { x: from.x + (to.x - from.x) * lo, z: from.z + (to.z - from.z) * lo }
}

/**
 * Where the visitor stands after stepping from `prev` to `next`: null when the step is fine as it is, otherwise the point to put
 * it at instead. A step over the end is cut at the end, each axis on its own, so the visitor slides along the edge. A visitor
 * who is already off the land (or a world with no land) is left alone: this never traps anyone out there.
 */
export function keepOnLand(land: Land, prev: Point, next: Point): Point | null {
  if (land.places.length === 0) return null
  for (const margin of [EDGE_MARGIN, INNER_MARGIN]) {
    if (!onLand(land, prev.x, prev.z, margin)) continue
    if (onLand(land, next.x, next.z, margin)) return null
    const alongX = farthest(land, prev, { x: next.x, z: prev.z }, margin)
    return farthest(land, alongX, { x: alongX.x, z: next.z }, margin)
  }
  return null
}
