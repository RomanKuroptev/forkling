import type { Kit, Place, Room } from '@forkling/schema'
import { WALL } from '@forkling/sim'
import { INNER_FACE, floorTaper } from './building.ts'

/**
 * A place as it is drawn: every room and every piece of furniture inside the building's walls (issues 339, 373).
 *
 * The rooms have no walls of their own; the building's outer 0.8 m (`WALL`) is wall, where no one walks. A room an older expand put
 * partly in that ring (Home's 1 m Counter Room) is drawn moved in until it stands where a visitor can walk, and a part that would
 * reach into or through the wall (Tiny Patch's screen and the Counter Room's plinth, poking out of Home's east corner) is drawn
 * pulled in until it clears the wall's inside face. A part that already fits stays exactly where Merge put it, and the walls'
 * own pieces (structure: windows, doors, wall panels) stay where they were, since they belong in the wall.
 *
 * Only the drawing reads this. The place file is never changed, and the body's world (`bodyWorldFor`) walks the place as it is, so
 * the mind and every viewer still agree on where Merge goes. The validator now refuses a new room in the walls (`roomOutsideWalls`).
 */
export function settledPlace(place: Place, kit: Kit): Place {
  const cached = memo.get(place)
  if (cached && cached.kit === kit) return cached.place
  const settled = settle(place, kit)
  memo.set(place, { kit, place: settled })
  return settled
}

const memo = new WeakMap<Place, { kit: Kit; place: Place }>()

/** `v` kept in `lo..hi`; when the span is too small for it (`lo > hi`), the middle of the span. */
const clamp = (v: number, lo: number, hi: number) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)))

function settle(place: Place, kit: Kit): Place {
  const [fw, fd] = place.exterior.footprint
  let changed = false
  const rooms = place.rooms.map((room): Room => {
    const t = floorTaper(place, room.floor)
    const [w, d] = room.size
    // The room: inside the ring no one walks on.
    const wx = fw / 2 - WALL - t
    const wz = fd / 2 - WALL - t
    // A room wider or deeper than the inside (the Counter Room is as deep as the whole footprint) is drawn as the part of it inside.
    const size: Room['size'] = [Math.min(w, 2 * wx), Math.min(d, 2 * wz), room.size[2]]
    const at: [number, number] = [fitAxis(room.at[0], size[0] / 2, wx), fitAxis(room.at[1], size[1] / 2, wz)]
    // Each part, in place space (from the place's middle): inside the walls' inner face.
    const fx = fw / 2 - INNER_FACE - t
    const fz = fd / 2 - INNER_FACE - t
    const parts = room.parts.map((placed) => {
      const part = kit.parts.find((p) => p.id === placed.part)
      let x = room.at[0] + placed.at[0]
      let z = room.at[1] + placed.at[2]
      if (part && part.category !== 'structure') {
        const c = Math.abs(Math.cos(placed.rot))
        const s = Math.abs(Math.sin(placed.rot))
        const [pw, , pd] = part.size
        x = fitAxis(x, (pw * c + pd * s) / 2, fx)
        z = fitAxis(z, (pw * s + pd * c) / 2, fz)
      }
      const moved: [number, number, number] = [x - at[0], placed.at[1], z - at[1]]
      if (Math.abs(moved[0] - placed.at[0]) < 1e-9 && Math.abs(moved[2] - placed.at[2]) < 1e-9) return placed
      return { ...placed, at: moved }
    })
    if (at[0] === room.at[0] && at[1] === room.at[1] && size[0] === w && size[1] === d && parts.every((p, i) => p === room.parts[i])) return room
    changed = true
    return { ...room, size, at, parts }
  })
  return changed ? { ...place, rooms } : place
}

/** A centre `v` with half-width `half` kept within `-edge..edge`, or `v` unchanged when it already is. */
function fitAxis(v: number, half: number, edge: number): number {
  if (v - half >= -edge - 1e-9 && v + half <= edge + 1e-9) return v
  return clamp(v, -edge + half, edge - half)
}
