import type { Kit, Place, Room } from '@forkling/schema'
import { INNER_FACE, floorTaper } from './building.ts'

/**
 * Parts pulled in from a wall stand this far in front of its inside face, so their back is not in the plane of the lining (two
 * faces in one plane fight in the depth buffer, issue 353).
 */
export const OFF_WALL = 0.02

/**
 * A place as it is drawn: every piece of furniture inside the building's walls (issues 339, 373).
 *
 * The rooms have no walls of their own; the building's outer 0.8 m is wall, where no one walks. An older expand put Home's 1 m
 * Counter Room in that ring, so its plinth, plaque and stool stood in the wall where no one could reach them, and Tiny Patch's screen
 * and the plinth poked out of Home's east corner. A part that would reach into the wall is drawn pulled in until it clears the
 * wall's inside face, so it stands in the house where a visitor walks; a part that already fits stays exactly where Merge put it,
 * and the walls' own pieces (structure: windows, doors, wall panels) stay where they were, since they belong in the wall. The rooms
 * themselves keep their place and size: they are not drawn, and moving one would put it through its neighbour.
 *
 * Only the drawing reads this. The place file is never changed, and the body's world (`bodyWorldFor`) walks the place as it is, so
 * the mind and every viewer still agree on where Merge goes. Stopping new rooms in the walls is the validator's job, not the drawing's.
 */
export function settledPlace(place: Place, kit: Kit): Place {
  const cached = memo.get(place)
  if (cached && cached.kit === kit) return cached.place
  const settled = settle(place, kit)
  memo.set(place, { kit, place: settled })
  return settled
}

const memo = new WeakMap<Place, { kit: Kit; place: Place }>()

function settle(place: Place, kit: Kit): Place {
  const [fw, fd] = place.exterior.footprint
  let changed = false
  const rooms = place.rooms.map((room): Room => {
    const t = floorTaper(place, room.floor)
    // In place space (from the place's middle): the walls' inside face, and a little in front of it.
    const fx = fw / 2 - INNER_FACE - OFF_WALL - t
    const fz = fd / 2 - INNER_FACE - OFF_WALL - t
    let moved = false
    const parts = room.parts.map((placed) => {
      const part = kit.parts.find((p) => p.id === placed.part)
      if (!part || part.category === 'structure') return placed
      const c = Math.abs(Math.cos(placed.rot))
      const s = Math.abs(Math.sin(placed.rot))
      const [pw, , pd] = part.size
      const x = room.at[0] + placed.at[0]
      const z = room.at[1] + placed.at[2]
      const nx = fitAxis(x, (pw * c + pd * s) / 2, fx)
      const nz = fitAxis(z, (pw * s + pd * c) / 2, fz)
      if (nx === x && nz === z) return placed
      moved = true
      return { ...placed, at: [nx - room.at[0], placed.at[1], nz - room.at[1]] as [number, number, number] }
    })
    if (!moved) return room
    changed = true
    return { ...room, parts }
  })
  return changed ? { ...place, rooms } : place
}

/**
 * A centre `v` with half-width `half` kept within `-edge..edge` (the middle when it is wider than that), or `v` itself when it
 * already reaches no further than the inside face. A part Merge set flush against a wall is left alone.
 */
function fitAxis(v: number, half: number, edge: number): number {
  const face = edge + OFF_WALL
  if (v - half >= -face - 1e-9 && v + half <= face + 1e-9) return v
  if (half > edge) return 0
  return Math.min(edge - half, Math.max(-edge + half, v))
}
