import type { Kit, Place } from '@forkling/schema'
import { placeCentre, rectMinus, stairFlights, storeyHeight, toLandPlace, type Rect } from '@forkling/sim'
import { FLOOR_INSET, FLOOR_TOP } from './kitBase.ts'

/**
 * The stairs and upper floors a visitor walks on (issue 333). Each flight of the kit's `stairs` part (`stairFlights` in the sim) is a
 * ramp the visitor's capsule climbs, from its foot on its floor to the floor above, and every floor above the ground is a solid slab
 * with the stairwells cut out of it. The ground floor is the land itself, as before. Only the visitor's physics read this; the drawing
 * cuts the same stairwells out of the drawn floors (`floorPieces`).
 */

/** How thick a ramp and an upper floor's slab are for the physics, in meters. */
const RAMP_THICK = 0.2
const SLAB_THICK = 0.25
/** How far past its foot a ramp reaches, under the floor, so the visitor meets no lip where it starts. */
const RAMP_UNDER = 0.4

export interface RampBox {
  position: [number, number, number]
  half: [number, number, number]
  /** x, y, z, w */
  quaternion: [number, number, number, number]
}

export interface SlabBox {
  position: [number, number, number]
  half: [number, number, number]
}

/** The rectangle a floor covers, in meters from the middle of the building: as far as the drawn floor reaches. */
export function floorRect(place: Place): Rect {
  const [fw, fd] = place.exterior.footprint
  return { x0: -fw / 2 + FLOOR_INSET, x1: fw / 2 - FLOOR_INSET, z0: -fd / 2 + FLOOR_INSET, z1: fd / 2 - FLOOR_INSET }
}

/** The pieces of a floor of a place, in meters from the middle of the building: the whole floor, less the stairwells that come up through it. */
export function floorPieces(place: Place, kit: Kit, floor: number): Rect[] {
  if (floor === 0) return [floorRect(place)]
  return rectMinus(floorRect(place), stairFlights(place, kit).filter((f) => f.floor === floor - 1).map((f) => f.well))
}

/** The ramps of a place's stairs, and the slabs of its upper floors, as boxes for the visitor's physics. */
export function stairColliders(place: Place, kit: Kit, baseY: number): { ramps: RampBox[]; slabs: SlabBox[] } {
  const [px, pz] = placeCentre(toLandPlace(place))
  const h = storeyHeight(place)
  const ramps: RampBox[] = stairFlights(place, kit).map((f) => {
    // From the foot (on the land for the ground floor, on its slab above) to the top of the floor above.
    const y0 = baseY + f.floor * h + (f.floor > 0 ? FLOOR_TOP : 0)
    const y1 = baseY + (f.floor + 1) * h + FLOOR_TOP
    const slope = Math.atan2(y1 - y0, f.run)
    const run = f.run + RAMP_UNDER
    const length = run / Math.cos(slope)
    // The middle of the top face's middle line, then down by half the thickness along the face's normal.
    const along = f.run / 2 - run / 2
    const mx = px + (f.foot[0] + f.top[0]) / 2 + f.dir[0] * along
    const mz = pz + (f.foot[1] + f.top[1]) / 2 + f.dir[1] * along
    const my = y1 - (run / 2) * Math.tan(slope)
    const nx = -Math.sin(slope) * f.dir[0]
    const nz = -Math.sin(slope) * f.dir[1]
    const ny = Math.cos(slope)
    const t = RAMP_THICK / 2
    // Turned to face the way it climbs (about y), then tipped up by the slope (about its own x).
    const [sy, cy] = [Math.sin(f.rot / 2), Math.cos(f.rot / 2)]
    const [sx, cx] = [Math.sin(-slope / 2), Math.cos(-slope / 2)]
    return { position: [mx - nx * t, my - ny * t, mz - nz * t], half: [f.width / 2, t, length / 2], quaternion: [cy * sx, sy * cx, -sy * sx, cy * cx] }
  })
  const slabs: SlabBox[] = []
  for (let floor = 1; floor < place.exterior.floors; floor++) {
    const top = baseY + floor * h + FLOOR_TOP
    for (const r of floorPieces(place, kit, floor)) slabs.push({ position: [px + (r.x0 + r.x1) / 2, top - SLAB_THICK / 2, pz + (r.z0 + r.z1) / 2], half: [(r.x1 - r.x0) / 2, SLAB_THICK / 2, (r.z1 - r.z0) / 2] })
  }
  return { ramps, slabs }
}
