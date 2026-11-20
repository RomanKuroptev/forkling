import type { Kit, KitPart, Place, Room } from '@forkling/schema'
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

/** One placed part in place space (from the place's middle), with its kit size turned by its rotation. */
interface Footing {
  room: number
  index: number
  part: KitPart
  floor: number
  x: number
  z: number
  y: number
  hx: number
  hz: number
}

/** How close (meters) a part's foot must be to another part's top to stand on it. */
const STACK = 0.05

function footings(place: Place, kit: Kit): Footing[] {
  const out: Footing[] = []
  place.rooms.forEach((room, r) => {
    room.parts.forEach((placed, index) => {
      const part = kit.parts.find((p) => p.id === placed.part)
      if (!part) return
      const c = Math.abs(Math.cos(placed.rot))
      const s = Math.abs(Math.sin(placed.rot))
      const [pw, , pd] = part.size
      out.push({ room: r, index, part, floor: room.floor, x: room.at[0] + placed.at[0], z: room.at[1] + placed.at[2], y: placed.at[1], hx: (pw * c + pd * s) / 2, hz: (pw * s + pd * c) / 2 })
    })
  })
  return out
}

/** The part `b` stands on: one on the same floor whose footprint holds `b`'s middle and whose height reaches `b`'s foot (a lamp on a workbench's surface, below the top of its back board), or none. */
function supportOf(b: Footing, all: readonly Footing[]): Footing | undefined {
  if (b.y <= STACK) return undefined
  return all.find((a) => a !== b && a.floor === b.floor && b.y > a.y + STACK && b.y <= a.y + a.part.size[1] + STACK && Math.abs(b.x - a.x) <= a.hx + 1e-9 && Math.abs(b.z - a.z) <= a.hz + 1e-9)
}

function settle(place: Place, kit: Kit): Place {
  const [fw, fd] = place.exterior.footprint
  const all = footings(place, kit)
  // Whatever stands on a part moves with it (a lamp on a desk, a screen on a plinth), and so does what its slots hold, since an
  // exhibit stands at its part's slot: each stack moves as one, by the most any of its pieces must move.
  const rootOf = (f: Footing): Footing => {
    const seen = new Set<Footing>([f])
    let at = f
    for (let next = supportOf(at, all); next && !seen.has(next); next = supportOf(at, all)) {
      seen.add(next)
      at = next
    }
    return at
  }
  const need = new Map<Footing, [number, number]>()
  for (const f of all) {
    if (f.part.category === 'structure') continue
    const t = floorTaper(place, f.floor)
    // The walls' inside face, and a little in front of it.
    const fx = fw / 2 - INNER_FACE - OFF_WALL - t
    const fz = fd / 2 - INNER_FACE - OFF_WALL - t
    const dx = fitAxis(f.x, f.hx, fx) - f.x
    const dz = fitAxis(f.z, f.hz, fz) - f.z
    const root = rootOf(f)
    const was = need.get(root) ?? [0, 0]
    need.set(root, [Math.abs(dx) > Math.abs(was[0]) ? dx : was[0], Math.abs(dz) > Math.abs(was[1]) ? dz : was[1]])
  }
  let changed = false
  const rooms = place.rooms.map((room, r): Room => {
    let moved = false
    const parts = room.parts.map((placed, index) => {
      const f = all.find((g) => g.room === r && g.index === index)
      if (!f || f.part.category === 'structure') return placed
      const [dx, dz] = need.get(rootOf(f)) ?? [0, 0]
      if (dx === 0 && dz === 0) return placed
      moved = true
      return { ...placed, at: [placed.at[0] + dx, placed.at[1], placed.at[2] + dz] as [number, number, number] }
    })
    if (!moved) return room
    changed = true
    return { ...room, parts }
  })
  return changed ? { ...place, rooms } : place
}

/** A primitive of a part's foot or stand: it reaches no higher than a quarter of the part (a screen's neck and foot plate). */
export const isFootPrimitive = (part: KitPart, p: KitPart['primitives'][number]): boolean => p.at[1] + p.size[1] / 2 <= part.size[1] / 4 + 1e-9

/** How close (meters) a part's back must be to a wall's inside face to hang on it. */
const HANG = 0.15

/**
 * The parts of a place (`<room id>/<part index>`) drawn hung on a wall: a part standing above the floor on nothing, with its back to
 * a wall, is drawn without its foot or stand, as a screen on a wall bracket is. Merge set Tiny Patch's screen 1.2 m up against Home's
 * back wall, on nothing; drawn with its stand, the stand's foot stood in mid-air. Its height and place are Merge's and do not change.
 */
export function hungParts(place: Place, kit: Kit): Set<string> {
  const settled = settledPlace(place, kit)
  const cached = hungMemo.get(settled)
  if (cached && cached.kit === kit) return cached.hung
  const [fw, fd] = settled.exterior.footprint
  const all = footings(settled, kit)
  const hung = new Set<string>()
  for (const f of all) {
    // Only a display (a screen, a plaque) is hung; a lamp or a crate on nothing is not made to hang.
    if (f.y <= STACK || f.part.category !== 'display' || supportOf(f, all)) continue
    if (!f.part.primitives.some((p) => isFootPrimitive(f.part, p))) continue
    const rot = settled.rooms[f.room]!.parts[f.index]!.rot
    // The way its back faces, in place space, and how far its back is from the wall that way.
    const bx = -Math.sin(rot)
    const bz = -Math.cos(rot)
    const t = floorTaper(settled, f.floor)
    const depth = f.part.size[2] / 2
    const gapX = Math.abs(bx) > 0.9 ? fw / 2 - INNER_FACE - t - (Math.sign(bx) * f.x + depth) : Infinity
    const gapZ = Math.abs(bz) > 0.9 ? fd / 2 - INNER_FACE - t - (Math.sign(bz) * f.z + depth) : Infinity
    if (Math.min(gapX, gapZ) <= HANG) hung.add(`${settled.rooms[f.room]!.id}/${f.index}`)
  }
  hungMemo.set(settled, { kit, hung })
  return hung
}

const hungMemo = new WeakMap<Place, { kit: Kit; hung: Set<string> }>()

/** A part made to hang (a lantern on its chain): its topmost primitive is a thin rod reaching the part's top. */
function hangsByDesign(part: KitPart): boolean {
  const top = [...part.primitives].sort((p, q) => q.at[1] + q.size[1] / 2 - (p.at[1] + p.size[1] / 2))[0]
  return !!top && top.at[1] + top.size[1] / 2 >= part.size[1] - 1e-9 && top.size[0] <= 0.05 && top.size[2] <= 0.05
}

/**
 * The parts (`<room id>/<part index>`) drawn with a foot or stand standing in mid-air: above the floor, on no other part, not hung
 * on a wall and not made to hang. The audit's `world.part-in-air` check reads this from the scene list.
 */
export function partsInAir(place: Place, kit: Kit): Set<string> {
  const settled = settledPlace(place, kit)
  const hung = hungParts(place, kit)
  const all = footings(settled, kit)
  const out = new Set<string>()
  for (const f of all) {
    const key = `${settled.rooms[f.room]!.id}/${f.index}`
    if (f.y <= STACK || f.part.category === 'structure' || hung.has(key) || supportOf(f, all) || hangsByDesign(f.part)) continue
    if (f.part.primitives.some((p) => isFootPrimitive(f.part, p))) out.add(key)
  }
  return out
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
