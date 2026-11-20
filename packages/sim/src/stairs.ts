import type { Kit, Place, Room } from '@forkling/schema'

/**
 * The stairs between the floors of a place (issue 333). The kit's `stairs` part is the only way up: a flight that starts on its
 * room's floor and climbs, the way the part faces (+z at rot 0), by one storey to the floor above. The viewer makes it walkable (a
 * ramp the visitor climbs and a stairwell cut out of the floor above), and found and expand require one under any room on floor 1
 * or above, so no room stands where nobody can go. Everything here is in meters from the middle of the building (the place's own
 * frame: x across, z front to back), y up from the ground floor.
 */

/** The kit part that is a flight of stairs. */
export const STAIRS_PART = 'stairs'
/** How far back from the top edge of a flight a visitor steps off it: the middle of its top step. */
const TOP_STEP = 0.25

/** How tall one storey of a place is: its tallest room, at least 2.4 m (the 12 m limit of spec 5.2 is floors times this). */
export const storeyHeight = (place: Pick<Place, 'rooms'>): number => Math.max(2.4, ...place.rooms.map((r) => r.size[2]))

/** An axis-aligned rectangle on the floor. */
export interface Rect {
  x0: number
  x1: number
  z0: number
  z1: number
}

export interface StairFlight {
  /** The room it stands in, and its index among that room's parts. */
  room: string
  part: number
  /** The floor it starts on; it ends on the one above. */
  floor: number
  /** The middle of its bottom edge and of its top edge. */
  foot: [number, number]
  top: [number, number]
  /** The way it climbs, as a unit vector on the floor, and its heading (the part's rot). */
  dir: [number, number]
  rot: number
  width: number
  /** How far it runs along the floor, and how far it climbs (one storey). */
  run: number
  rise: number
  /** The rectangle it covers on the floor, which is cut out of the floor above (the stairwell). */
  well: Rect
}

/** Every flight of stairs in a place that leads up to another floor: a stairs part on a floor with a floor above it. */
export function stairFlights(place: Pick<Place, 'rooms' | 'exterior'>, kit: Kit): StairFlight[] {
  const part = kit.parts.find((p) => p.id === STAIRS_PART)
  if (!part) return []
  const [width, , run] = part.size
  const rise = storeyHeight(place)
  const out: StairFlight[] = []
  for (const room of place.rooms) {
    if (room.floor >= place.exterior.floors - 1) continue
    room.parts.forEach((placed, index) => {
      if (placed.part !== STAIRS_PART) return
      const cx = room.at[0] + placed.at[0]
      const cz = room.at[1] + placed.at[2]
      const dir: [number, number] = [Math.sin(placed.rot), Math.cos(placed.rot)]
      const c = Math.abs(dir[1])
      const s = Math.abs(dir[0])
      const hx = (width * c + run * s) / 2
      const hz = (width * s + run * c) / 2
      out.push({
        room: room.id,
        part: index,
        floor: room.floor,
        foot: [cx - (dir[0] * run) / 2, cz - (dir[1] * run) / 2],
        top: [cx + (dir[0] * run) / 2, cz + (dir[1] * run) / 2],
        dir,
        rot: placed.rot,
        width,
        run,
        rise,
        well: { x0: cx - hx, x1: cx + hx, z0: cz - hz, z1: cz + hz },
      })
    })
  }
  return out
}

/** Where a visitor steps off a flight onto the floor above: the middle of its top step. */
export const landing = (f: StairFlight): [number, number] => [f.top[0] - f.dir[0] * TOP_STEP, f.top[1] - f.dir[1] * TOP_STEP]

/**
 * Why a room on floor 1 or above cannot be reached, or null. A room is reached when a flight of stairs from the floor under it tops
 * out inside it (its top step is under the room). A rail on what can be built (a schema limit, Roman approved it for issue 333),
 * checked for each room an expand adds or enlarges and for every room of a new place; rooms already standing are left as they are.
 */
export function upperRoomWithoutStairs(place: Pick<Place, 'rooms' | 'exterior'>, room: Pick<Room, 'id' | 'floor' | 'size' | 'at'>, kit: Kit): string | null {
  if (room.floor < 1) return null
  const [w, d] = room.size
  const [x, z] = room.at
  const inside = ([px, pz]: [number, number]) => px >= x - w / 2 - 1e-9 && px <= x + w / 2 + 1e-9 && pz >= z - d / 2 - 1e-9 && pz <= z + d / 2 + 1e-9
  if (stairFlights(place, kit).some((f) => f.floor === room.floor - 1 && inside(landing(f)))) return null
  const part = kit.parts.find((p) => p.id === STAIRS_PART)
  const size = part ? ` (the stairs are ${part.size[0]} m wide and ${part.size[2]} m long, and climb the way they face: toward the front at rot 0)` : ''
  return `room ${room.id} is on floor ${room.floor} and nothing leads up to it: put a stairs part in a room on floor ${room.floor - 1}, its top end under ${room.id}${size}`
}

/** A rectangle with others cut out of it, as the pieces that are left (none overlapping). */
export function rectMinus(rect: Rect, holes: readonly Rect[]): Rect[] {
  const cut = holes
    .map((h) => ({ x0: Math.max(rect.x0, h.x0), x1: Math.min(rect.x1, h.x1), z0: Math.max(rect.z0, h.z0), z1: Math.min(rect.z1, h.z1) }))
    .filter((h) => h.x1 - h.x0 > 1e-9 && h.z1 - h.z0 > 1e-9)
  if (cut.length === 0) return [rect]
  const xs = [...new Set([rect.x0, rect.x1, ...cut.flatMap((h) => [h.x0, h.x1])])].sort((a, b) => a - b)
  const zs = [...new Set([rect.z0, rect.z1, ...cut.flatMap((h) => [h.z0, h.z1])])].sort((a, b) => a - b)
  const out: Rect[] = []
  // Strip by strip across x, each strip's free cells along z joined into one piece where they touch.
  for (let i = 0; i < xs.length - 1; i++) {
    const [x0, x1] = [xs[i]!, xs[i + 1]!]
    let open: Rect | null = null
    for (let k = 0; k < zs.length - 1; k++) {
      const [z0, z1] = [zs[k]!, zs[k + 1]!]
      const holed = cut.some((h) => h.x0 <= x0 + 1e-9 && h.x1 >= x1 - 1e-9 && h.z0 <= z0 + 1e-9 && h.z1 >= z1 - 1e-9)
      if (holed) {
        if (open) out.push(open)
        open = null
      } else if (open) open.z1 = z1
      else open = { x0, x1, z0, z1 }
    }
    if (open) out.push(open)
  }
  // Pieces of neighbouring strips with the same ends along z are one piece.
  const merged: Rect[] = []
  for (const r of out) {
    const left = merged.find((m) => Math.abs(m.x1 - r.x0) < 1e-9 && Math.abs(m.z0 - r.z0) < 1e-9 && Math.abs(m.z1 - r.z1) < 1e-9)
    if (left) left.x1 = r.x1
    else merged.push({ ...r })
  }
  return merged
}
