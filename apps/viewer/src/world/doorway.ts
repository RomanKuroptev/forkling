import type { Kit, Place, Room } from '@forkling/schema'
import { DOOR_HALF, WALL, placeCentre, toLandPlace } from '@forkling/sim'
import { floorHeight } from './kitBase.ts'

/**
 * The way in to a place: its door gap in the front (+z) wall, as wide as the body's own world leaves it (`DOOR_HALF`), up to the
 * lintel, through the wall's 0.8 m ring and a step on inside. Nothing of the inside is drawn there (issues 342, 345, 354: a frame
 * Merge hung over the door and a door leaf it stood in the gap hung in the opening and made it look shut). The building draws the
 * opening itself, so a door part is not needed there; a rug or floor boards lower than `DOOR_FLOOR` stay, they are walked over.
 */
export const DOOR_HEIGHT = 2.2
/** How far inside the wall ring the doorway reaches: the step in, where a visitor walks through. */
export const DOOR_STEP = 0.4
/** Anything no higher than this above the floor (a rug, floor boards) is walked over and may lie in the doorway. */
export const DOOR_FLOOR = 0.15

export interface DoorBox {
  min: [number, number, number]
  max: [number, number, number]
}

/** The doorway of a place standing at ground height `baseY`, as a box in world meters. */
export function doorwayBox(place: Place, baseY: number): DoorBox {
  const [px, pz] = placeCentre(toLandPlace(place))
  const front = pz + place.exterior.footprint[1] / 2
  return { min: [px - DOOR_HALF, baseY + DOOR_FLOOR, front - WALL - DOOR_STEP], max: [px + DOOR_HALF, baseY + DOOR_HEIGHT, front] }
}

/** The box a placed part fills, from its kit size: its footprint round its position, turned about y, from its foot up. */
export function placedPartBox(place: Place, kit: Kit, room: Room, placed: Room['parts'][number], baseY: number): DoorBox | null {
  const part = kit.parts.find((p) => p.id === placed.part)
  if (!part) return null
  const [px, pz] = placeCentre(toLandPlace(place))
  const [w, h, d] = part.size
  const c = Math.abs(Math.cos(placed.rot))
  const s = Math.abs(Math.sin(placed.rot))
  const hx = (w * c + d * s) / 2
  const hz = (w * s + d * c) / 2
  const x = px + room.at[0] + placed.at[0]
  const y = baseY + room.floor * floorHeight(place) + placed.at[1]
  const z = pz + room.at[1] + placed.at[2]
  return { min: [x - hx, y, z - hz], max: [x + hx, y + h, z + hz] }
}

const EPS = 0.01

/** Whether a placed part stands in its place's doorway (only the ground floor has a door). */
export function partInDoorway(place: Place, kit: Kit, room: Room, placed: Room['parts'][number], baseY: number): boolean {
  if (room.floor !== 0) return false
  const box = placedPartBox(place, kit, room, placed, baseY)
  if (!box) return false
  const door = doorwayBox(place, baseY)
  return [0, 1, 2].every((k) => Math.min(box.max[k]!, door.max[k]!) - Math.max(box.min[k]!, door.min[k]!) > EPS)
}
