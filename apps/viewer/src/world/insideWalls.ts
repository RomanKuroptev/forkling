import type { Kit, KitPart, Place, Room } from '@forkling/schema'
import { DOOR_HALF, placeCentre, toLandPlace } from '@forkling/sim'
import { CROWN_SHARE, FRAME, INNER_FACE, WINDOW_SIZE, floorTaper, innerWallFace, windowLayout, type WallSide } from './building.ts'

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
  return settledWith(place, kit).place
}

/**
 * The screens of a place (`<room id>/<part index>`) drawn raised in place on a tall slim stand, and how far above their floor their
 * foot is drawn: a screen standing on the floor with no wall near enough to hang it on (`raiseScreens`).
 */
export function screenStands(place: Place, kit: Kit): Map<string, number> {
  return settledWith(place, kit).stands
}

function settledWith(place: Place, kit: Kit): Settled {
  const cached = memo.get(place)
  if (cached && cached.kit === kit && cached.rooms === place.rooms && sameBesideRooms(cached.settled.place, place)) return cached.settled
  const pulled = settle(place, kit)
  const settled = raiseScreens(pulled, kit)
  memo.set(place, { kit, rooms: place.rooms, settled })
  return settled
}

/** Whether a settled copy still has the place's own exhibits, exterior and the rest (a caller may have set new ones since). */
const sameBesideRooms = (settled: Place, place: Place): boolean => (Object.keys(place) as (keyof Place)[]).every((k) => k === 'rooms' || settled[k] === place[k])

interface Settled {
  place: Place
  stands: Map<string, number>
}

const memo = new WeakMap<Place, { kit: Kit; rooms: Place['rooms']; settled: Settled }>()

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

/** A screen's middle is drawn this high above its floor (meters): eye height for a visitor standing in front of it (issue 431). */
export const SCREEN_EYE = 1.5
/** A screen standing on the floor whose back is no further than this from a wall's inside face is hung on that wall. */
const HANG_REACH = 1.2
/** How far a hung screen keeps from the door gap, a window's frame, a tall piece of furniture and another hung screen. */
const CLEAR = 0.1
/** A part this close to a wall's inside face (meters) stands against that wall, where a hung screen would run into it. */
const AGAINST = 0.5

/** The screen slot of a display part, if it has one. */
const screenSlot = (part: KitPart) => (part.category === 'display' ? part.slots.find((s) => s.kind === 'screen') : undefined)

/**
 * Screens are hung at eye height (issue 431). The kit's screens are floor-standing monitors with their panel 0.5 m up, and the
 * Workshop's four stood on the floor in front of its front wall at knee height, one of them half in the door gap where it caught a
 * visitor walking out. A screen standing on the floor (on nothing, with nothing on it) is drawn with its middle `SCREEN_EYE` up:
 *
 * - When its back is within `HANG_REACH` of a wall, it is hung flat on that wall's inside face, at the nearest spot along the wall
 *   where it is clear of the door gap, the wall's windows, the tall furniture standing against that wall and the screens hung
 *   there before it. Drawn on the wall it has no foot (`hungParts`).
 * - Otherwise (no wall near, or no room on it), it stays where Merge put it, raised on a tall slim stand down to the floor
 *   (`screenStands`).
 *
 * Like `settle`, only the drawing reads this: the place file and the kit's sizes do not change.
 */
function raiseScreens(place: Place, kit: Kit): Settled {
  const stands = new Map<string, number>()
  const all = footings(place, kit)
  const screens = all.filter((f) => {
    const slot = screenSlot(f.part)
    return slot && f.y <= STACK && SCREEN_EYE - slot.at[1] > f.y && !all.some((b) => b !== f && supportOf(b, all) === f)
  })
  if (screens.length === 0) return { place, stands }
  const raised = new Set(screens)
  const taken = new Map<string, [number, number][]>()
  const moves = new Map<Footing, [number, number, number]>()
  for (const f of screens) {
    const lift = SCREEN_EYE - screenSlot(f.part)!.at[1]
    const spot = wallSpot(place, all, raised, taken, f, lift)
    if (spot) moves.set(f, [spot[0], lift, spot[1]])
    else {
      moves.set(f, [f.x, lift, f.z])
      stands.set(`${place.rooms[f.room]!.id}/${f.index}`, lift)
    }
  }
  const rooms = place.rooms.map((room, r): Room => {
    const mine = screens.filter((f) => f.room === r)
    if (mine.length === 0) return room
    const parts = room.parts.map((placed, index) => {
      const f = mine.find((g) => g.index === index)
      const to = f && moves.get(f)
      return to ? { ...placed, at: [to[0] - room.at[0], to[1], to[2] - room.at[1]] as [number, number, number] } : placed
    })
    return { ...room, parts }
  })
  return { place: { ...place, rooms }, stands }
}

/**
 * Where on a wall a floor-standing screen `f` hangs, as place-space x and z, or null when its back is not to a wall within
 * `HANG_REACH` or the wall has no room for it. `taken` holds, per wall, the stretches the screens hung before it fill.
 */
function wallSpot(place: Place, all: readonly Footing[], raised: ReadonlySet<Footing>, taken: Map<string, [number, number][]>, f: Footing, lift: number): [number, number] | null {
  const placed = place.rooms[f.room]!.parts[f.index]!
  const bx = -Math.sin(placed.rot)
  const bz = -Math.cos(placed.rot)
  // `alongZ`: the wall is a side wall (its line is an x), so the screen runs along z.
  const alongZ = Math.abs(bx) > 0.9
  if (!alongZ && Math.abs(bz) <= 0.9) return null
  const sign = Math.sign(alongZ ? bx : bz)
  const [fw, fd] = place.exterior.footprint
  const t = floorTaper(place, f.floor)
  const [w, h, d] = f.part.size
  const top = lift + h
  // The wall's inside face, from the place's middle, at the screen's top (a tower's walls lean in as they rise).
  const face = (alongZ ? fw : fd) / 2 - innerWallFace(place, top) - t
  const perp = alongZ ? f.x : f.z
  if (face - (sign * perp + d / 2) > HANG_REACH) return null
  const reach = (alongZ ? fd : fw) / 2 - INNER_FACE - t
  const hw = w / 2
  const [px, pz] = placeCentre(toLandPlace(place))
  const side: WallSide = alongZ ? (sign > 0 ? 'right' : 'left') : sign < 0 ? 'back' : 'front'
  const blocked: [number, number][] = [...(taken.get(`${f.floor}/${side}`) ?? [])]
  if (side === 'front' && f.floor === 0) blocked.push([-DOOR_HALF - CLEAR, DOOR_HALF + CLEAR])
  if (place.exterior.style in CROWN_SHARE) {
    const layout = windowLayout(place)
    const sides: WallSide[] = side === 'front' ? (f.floor === 0 ? ['front-left', 'front-right'] : []) : [side]
    const half = WINDOW_SIZE[0] / 2 + FRAME + CLEAR
    for (const s of sides) for (const at of layout.along(f.floor, s)) blocked.push([at - (alongZ ? pz : px) - half, at - (alongZ ? pz : px) + half])
  }
  for (const g of all) {
    if (g === f || raised.has(g) || g.floor !== f.floor || g.part.category === 'structure') continue
    if (g.y >= top || g.y + g.part.size[1] <= lift) continue
    if (sign * (alongZ ? g.x : g.z) + (alongZ ? g.hx : g.hz) < face - AGAINST) continue
    const at = alongZ ? g.z : g.x
    const half = (alongZ ? g.hz : g.hx) + CLEAR
    blocked.push([at - half, at + half])
  }
  const want = alongZ ? f.z : f.x
  const fits = (c: number) => c - hw >= -reach - 1e-9 && c + hw <= reach + 1e-9 && blocked.every(([a, b]) => c + hw <= a + 1e-9 || c - hw >= b - 1e-9)
  const candidates = [want, -reach + hw, reach - hw, ...blocked.flatMap(([a, b]) => [a - hw, b + hw])]
  let best: number | null = null
  for (const c of candidates) if (fits(c) && (best === null || Math.abs(c - want) < Math.abs(best - want) - 1e-9)) best = c
  if (best === null) return null
  taken.set(`${f.floor}/${side}`, [...(taken.get(`${f.floor}/${side}`) ?? []), [best - hw - CLEAR, best + hw + CLEAR]])
  const across = sign * (face - OFF_WALL - d / 2)
  return alongZ ? [across, best] : [best, across]
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
  const stands = screenStands(place, kit)
  const hung = new Set<string>()
  for (const f of all) {
    // Only a display (a screen, a plaque) is hung; a lamp or a crate on nothing is not made to hang, nor a screen on its tall stand.
    if (f.y <= STACK || f.part.category !== 'display' || supportOf(f, all) || stands.has(`${settled.rooms[f.room]!.id}/${f.index}`)) continue
    if (!f.part.primitives.some((p) => isFootPrimitive(f.part, p))) continue
    const rot = settled.rooms[f.room]!.parts[f.index]!.rot
    // The way its back faces, in place space, and how far its back is from the wall that way.
    const bx = -Math.sin(rot)
    const bz = -Math.cos(rot)
    const t = floorTaper(settled, f.floor)
    const depth = f.part.size[2] / 2
    // The wall's inside face at the part's top: a tower's walls lean in as they rise, and a screen hung there touches them up top.
    const inner = innerWallFace(settled, f.y + f.part.size[1])
    const gapX = Math.abs(bx) > 0.9 ? fw / 2 - inner - t - (Math.sign(bx) * f.x + depth) : Infinity
    const gapZ = Math.abs(bz) > 0.9 ? fd / 2 - inner - t - (Math.sign(bz) * f.z + depth) : Infinity
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
  const stands = screenStands(place, kit)
  const all = footings(settled, kit)
  const out = new Set<string>()
  for (const f of all) {
    const key = `${settled.rooms[f.room]!.id}/${f.index}`
    if (f.y <= STACK || f.part.category === 'structure' || hung.has(key) || stands.has(key) || supportOf(f, all) || hangsByDesign(f.part)) continue
    if (f.part.primitives.some((p) => isFootPrimitive(f.part, p))) out.add(key)
  }
  return out
}

/** The pole of a screen's tall stand, this thick (meters). */
const POLE = 0.06

/**
 * A screen raised on its tall stand (`screenStands`), `lift` meters above its floor: the kit part with a slim pole from its own
 * neck down to the floor, and its foot plate on the floor. Its panel is the kit's own, at eye height.
 */
export function onTallStand(part: KitPart, lift: number): KitPart {
  const foot = part.primitives.filter((p) => isFootPrimitive(part, p))
  const plate = [...foot].sort((p, q) => p.at[1] - q.at[1])[0]
  const neck = [...foot].sort((p, q) => q.at[1] - p.at[1])[0]
  const color = (neck ?? plate)?.color ?? 'metal'
  const z = neck?.at[2] ?? 0
  const pole = { shape: 'box' as const, size: [POLE, lift, POLE] as [number, number, number], at: [0, -lift / 2, z] as [number, number, number], color }
  const floor = plate ? [{ ...plate, at: [plate.at[0], plate.at[1] - lift, plate.at[2]] as [number, number, number] }] : []
  return { ...part, primitives: [...part.primitives.filter((p) => p !== plate), pole, ...floor] }
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
