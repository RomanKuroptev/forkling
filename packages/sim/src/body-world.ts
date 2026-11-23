import type { KitPart, PlacedPart, Place } from '@forkling/schema'
import { CHUNK_SIZE, chunkAt, createLand, placeCentre, toLandPlace, type Chunk } from './land.ts'
import { createNavGrid, isWalkable, nearestWalkable, type NavGrid, type Point2, type Spot } from './nav.ts'
import type { Vec3Tuple } from './sky.ts'
import { starterPlaces } from './starter-places.ts'

/** Where something stands: a point on the ground, the height there and the way it faces (radians). */
export interface Spawn {
  x: number
  y: number
  z: number
  yaw: number
}

/**
 * What the body walks on and where it can go (spec 2.7). The body is the same code in the mind and in every viewer, so both
 * build this from the same places and the same seed, and playback stays identical.
 *
 * `spots` are named points: a place's id (a spot inside it), and the id of each kind of furniture where it stands, so the
 * engine can say "the desk at Home" or "the bench in the Workshop" without the pack knowing about either.
 */
export interface BodyWorld {
  grid: NavGrid
  spawn: Spawn
  /** Where a visitor first stands: on open ground, facing the way in. */
  visitorSpawn: Spawn
  /** Ground height at a world point, for standing on it. */
  heightAt(x: number, z: number): number
  /** Where the body can go, by name, with the sun where it is. */
  spots(sun: Vec3Tuple): Record<string, Spot[]>
}

/** How thick a building's wall is for walking, in meters (cells are 1 m). */
export const WALL = 0.8
/** Half the width of the door in a building's front wall (the +z side), in meters. */
export const DOOR_HALF = 1.25
/**
 * How far in front of Home's front wall a visitor first stands (meters). From 4 m the arrival view was the underside of Home's porch
 * and its columns, with no sky, sun, grid or land (issue 452); from 10 m Home stands whole under the sky, Merge in its door.
 */
export const ARRIVAL_BACK = 10
/** The nearest the visitor starts to Home's front wall when the ground further back is not open (another place, the land's end). */
const ARRIVAL_NEAREST = 4

/** The kit parts' sizes and seats, which say where the body stands at a piece of furniture. Data passed in; the sim reads no files. */
export interface BodyKit {
  parts: readonly Pick<KitPart, 'id' | 'size' | 'seat'>[]
}

/** How far a seat may be from a surface (centre to centre, meters) to be the place to sit at it: the chair at a desk. */
const SEAT_REACH = 1.2
/** How far in front of a part's box the body stands (meters). */
const STAND_OFF = 0.35

/** A part's front (local +z) in the world, turned by its rot about y as the viewer draws it. */
const frontOf = (rot: number) => ({ x: Math.sin(rot), z: Math.cos(rot) })

/**
 * Where the body goes for each part of a room, by the part's id. A seat (a part with `seat`) is sat on: the spot is the seat
 * itself, with `perch` its height. A part with no seat that has a seat within `SEAT_REACH` on its front side (the chair at a
 * desk, the stool at a workbench) is worked at from that seat, facing the part. Any other part is stood in front of, just out of
 * its box, on the first side the body can stand on (`open`). Without the kit's sizes a spot is the part's centre, as it was before issue 461.
 */
export function furnitureSpots(
  parts: readonly PlacedPart[],
  ox: number,
  oz: number,
  partOf: ReadonlyMap<string, BodyKit['parts'][number]>,
  open: (p: Point2) => boolean,
): [string, Spot][] {
  const items = parts.map((placed) => ({ placed, kit: partOf.get(placed.part), x: ox + placed.at[0], z: oz + placed.at[2] }))
  type Item = (typeof items)[number]
  const d = (a: Item, b: Item) => Math.hypot(a.x - b.x, a.z - b.z)
  // The seat a surface is worked at from: the nearest seat in reach on its front side.
  const seatFor = (item: Item): Item | undefined => {
    const front = frontOf(item.placed.rot)
    let best: Item | undefined
    for (const other of items) {
      if (other === item || other.kit?.seat === undefined || d(item, other) > SEAT_REACH) continue
      if ((other.x - item.x) * front.x + (other.z - item.z) * front.z <= 0) continue
      if (!best || d(item, other) < d(item, best)) best = other
    }
    return best
  }
  const towards = (from: Item, to: Item) => Math.atan2(to.x - from.x, to.z - from.z)
  const surfaces = items.filter((i) => i.kit && i.kit.seat === undefined).map((i) => ({ surface: i, seat: seatFor(i) }))

  // A seat faces the nearest surface it serves (the desk, not the lamp on it), or the way the seat itself faces.
  const seatFace = (seat: Item): number => {
    let served: Item | undefined
    for (const s of surfaces) if (s.seat === seat && (!served || d(seat, s.surface) < d(seat, served))) served = s.surface
    return served ? towards(seat, served) : Math.atan2(Math.sin(seat.placed.rot), Math.cos(seat.placed.rot))
  }

  return items.map((item): [string, Spot] => {
    const { kit, placed } = item
    if (!kit) return [placed.part, { x: item.x, z: item.z }]
    if (kit.seat !== undefined) return [placed.part, { x: item.x, z: item.z, perch: kit.seat, face: seatFace(item) }]
    const seat = surfaces.find((s) => s.surface === item)?.seat
    if (seat) return [placed.part, { x: seat.x, z: seat.z, perch: seat.kit!.seat!, face: seatFace(seat) }]
    // In front of it, or beside or behind it where the front is a wall (a lamp in a corner); the first of those the body can stand on.
    const [w, , dp] = kit.size
    const c = Math.cos(placed.rot)
    const s = Math.sin(placed.rot)
    const around = ([lx, lz]: [number, number]): Spot => ({ x: item.x + lx * c + lz * s, z: item.z - lx * s + lz * c })
    const sides = ([[0, dp / 2 + STAND_OFF], [w / 2 + STAND_OFF, 0], [-(w / 2 + STAND_OFF), 0], [0, -(dp / 2 + STAND_OFF)]] as [number, number][]).map(around)
    return [placed.part, sides.find(open) ?? sides[0]!]
  })
}

/**
 * The land with its buildings. The body may walk on owned chunks and the edge chunks around them, not in the fog. A building
 * is a ring of wall around its footprint with one door in the front (+z) wall; inside it is open, since furniture does not block.
 */
export function buildBodyWorld(seed: number, places: readonly Place[], kit?: BodyKit): BodyWorld {
  const landPlaces = places.map(toLandPlace)
  const land = createLand(seed, landPlaces)

  const owned: Chunk[] = landPlaces.length > 0 ? landPlaces.map((p) => p.chunk) : [[0, 0]]
  const cx0 = Math.min(...owned.map((c) => c[0])) - 1
  const cx1 = Math.max(...owned.map((c) => c[0])) + 1
  const cz0 = Math.min(...owned.map((c) => c[1])) - 1
  const cz1 = Math.max(...owned.map((c) => c[1])) + 1
  const cols = (cx1 - cx0 + 1) * CHUNK_SIZE
  const rows = (cz1 - cz0 + 1) * CHUNK_SIZE
  const originX = cx0 * CHUNK_SIZE
  const originZ = cz0 * CHUNK_SIZE
  const walkable = new Uint8Array(cols * rows)
  const grid = createNavGrid({ cols, rows, cellSize: 1, originX, originZ, walkable })

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const chunk = chunkAt(originX + col + 0.5, originZ + row + 0.5)
      if (landPlaces.length === 0 || land.classify(chunk) !== 'fog') walkable[row * cols + col] = 1
    }
  }

  for (const p of landPlaces) {
    const [px, pz] = placeCentre(p)
    const x0 = px - p.footprint[0] / 2
    const x1 = px + p.footprint[0] / 2
    const z0 = pz - p.footprint[1] / 2
    const z1 = pz + p.footprint[1] / 2
    for (let row = Math.max(0, Math.floor(z0 - originZ)); row <= Math.min(rows - 1, Math.ceil(z1 - originZ)); row++) {
      for (let col = Math.max(0, Math.floor(x0 - originX)); col <= Math.min(cols - 1, Math.ceil(x1 - originX)); col++) {
        const x = originX + col + 0.5
        const z = originZ + row + 0.5
        if (x < x0 || x > x1 || z < z0 || z > z1) continue
        const frontWall = z1 - z < WALL
        const wall = x - x0 < WALL || x1 - x < WALL || z - z0 < WALL || frontWall
        if (wall && !(frontWall && Math.abs(x - px) <= DOOR_HALF)) walkable[row * cols + col] = 0
      }
    }
  }

  const spots: Record<string, Spot[]> = {}
  const add = (name: string, at: Spot) => {
    // A seat stays where it is when the body can stand there; otherwise the nearest open cell, which is no seat.
    const open = nearestWalkable(grid, at, 6)
    ;(spots[name] ??= []).push(open === at || !open ? at : open)
  }
  const partOf = new Map(kit?.parts.map((p) => [p.id, p]) ?? [])
  for (const place of places) {
    const [px, pz] = placeCentre(toLandPlace(place))
    add(place.id, { x: px, z: pz })
    for (const room of place.rooms) {
      for (const [name, at] of furnitureSpots(room.parts, px + room.at[0], pz + room.at[1], partOf, (p) => isWalkable(grid, p.x, p.z))) add(name, at)
    }
  }

  const home = places.find((p) => p.id === 'home') ?? places[0]
  const [sx, sz] = home ? [spots[home.id]![0]!.x, spots[home.id]![0]!.z] : [CHUNK_SIZE / 2, CHUNK_SIZE / 2]
  const heightAt = (x: number, z: number) => land.heightAt(x, z)
  // The visitor starts in front of Home's door (or the first place's), looking at it, `ARRIVAL_BACK` back from its front wall, or
  // nearer where that is not open ground (off the land, or at another place).
  const front = home ? placeCentre(toLandPlace(home)) : [sx, sz]
  const fd = home ? home.exterior.footprint[1] : 0
  const vx = front[0]!
  const open = (x: number, z: number) => isWalkable(grid, x, z) && landPlaces.every((p) => {
    const [cx, cz] = placeCentre(p)
    return Math.abs(x - cx) > p.footprint[0] / 2 + 1 || Math.abs(z - cz) > p.footprint[1] / 2 + 1
  })
  let back = ARRIVAL_BACK
  while (back > ARRIVAL_NEAREST && !open(vx, front[1]! + fd / 2 + back)) back -= 0.5
  const vz = front[1]! + fd / 2 + back
  const visitorSpawn: Spawn = { x: vx, y: heightAt(vx, vz), z: vz, yaw: Math.PI }
  return { grid, spawn: { x: sx, y: heightAt(sx, sz), z: sz, yaw: 0 }, visitorSpawn, heightAt, spots: () => spots }
}

/**
 * What the body walks on, for the mind, the replay and the viewer: the land with its buildings and doors. A world with no
 * places is walked as Home and the Workshop (`starterPlaces`), so there is always somewhere to stand and the same spots to
 * go to. Everyone makes this choice from the same files with this one function, which keeps playback identical.
 */
export function bodyWorldFor(o: { seed: number; places: readonly Place[]; kit: BodyKit }): BodyWorld {
  return buildBodyWorld(o.seed, o.places.length > 0 ? o.places : starterPlaces(), o.kit)
}
