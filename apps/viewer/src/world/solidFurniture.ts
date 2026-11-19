import type { Kit, Place } from '@forkling/schema'
import { floorHeight } from './kitBase.ts'
import { partInDoorway, placedPartBox } from './doorway.ts'

/**
 * The furniture a visitor bumps into (issue 357): one plain box for each piece of a room that stands on its floor, as the kit sizes
 * it, the same box the audit's scene list gives it. Walls already stop the visitor; with these the bench, the desk and the shelves
 * do too, so the camera never ends up inside them. One fixed box each keeps the physics cheap.
 *
 * Left out: the structure parts (walls, windows, doors, floors and stairs are the building's own), anything as low as a rug or
 * a cat bed (walked over), anything hung higher than the visitor (a hanging lantern, a frame on the wall), and a part standing
 * in the doorway, which is not drawn (`doorway.ts`).
 */

/** Lower than this, a part is walked over. */
export const STEP_OVER = 0.35
/** A part whose foot is higher than this above its floor hangs over the visitor's head. */
export const OVERHEAD = 1.6

export interface SolidBox {
  /** The kit part. */
  part: string
  min: [number, number, number]
  max: [number, number, number]
}

export function furnitureBoxes(place: Place, kit: Kit, baseY: number): SolidBox[] {
  const out: SolidBox[] = []
  const storey = floorHeight(place)
  for (const room of place.rooms) {
    const floorY = baseY + room.floor * storey
    for (const placed of room.parts) {
      const part = kit.parts.find((p) => p.id === placed.part)
      if (!part || part.category === 'structure') continue
      const box = placedPartBox(place, kit, room, placed, baseY)
      if (!box) continue
      if (box.max[1] - Math.max(box.min[1], floorY) < STEP_OVER) continue
      if (box.min[1] - floorY > OVERHEAD) continue
      if (partInDoorway(place, kit, room, placed, baseY)) continue
      out.push({ part: part.id, min: box.min, max: box.max })
    }
  }
  return out
}
