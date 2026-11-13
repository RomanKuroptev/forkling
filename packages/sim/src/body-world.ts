import type { Place, SpeciesPack, WorldObject } from '@forkling/schema'
import { heightAt as islandHeight, type Spawn } from './island.ts'
import { CHUNK_SIZE, chunkAt, createLand, placeCentre, toLandPlace, type Chunk } from './land.ts'
import { createNavGrid, nearestWalkable, type NavGrid, type Point2 } from './nav.ts'
import type { Vec3Tuple } from './sky.ts'
import { worldWithObjects, type StarterWorld } from './starter.ts'
import { collectSpots } from './world.ts'

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
  spots(sun: Vec3Tuple): Record<string, Point2[]>
}

/** How thick a building's wall is for walking, in meters (cells are 1 m). */
export const WALL = 0.8
/** Half the width of the door in a building's front wall (the +z side), in meters. */
export const DOOR_HALF = 1.25

/**
 * The land with its buildings. The body may walk on owned chunks and the edge chunks around them, not in the fog. A building
 * is a ring of wall around its footprint with one door in the front (+z) wall; inside it is open, since furniture does not block.
 */
export function buildBodyWorld(seed: number, places: readonly Place[]): BodyWorld {
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

  const spots: Record<string, Point2[]> = {}
  const add = (name: string, at: Point2) => (spots[name] ??= []).push(nearestWalkable(grid, at, 6) ?? at)
  for (const place of places) {
    const [px, pz] = placeCentre(toLandPlace(place))
    add(place.id, { x: px, z: pz })
    for (const room of place.rooms) for (const part of room.parts) add(part.part, { x: px + room.at[0] + part.at[0], z: pz + room.at[1] + part.at[2] })
  }

  const home = places.find((p) => p.id === 'home') ?? places[0]
  const [sx, sz] = home ? [spots[home.id]![0]!.x, spots[home.id]![0]!.z] : [CHUNK_SIZE / 2, CHUNK_SIZE / 2]
  const heightAt = (x: number, z: number) => land.heightAt(x, z)
  // The visitor starts outside the front door of Home (or of the first place), looking at it.
  const front = home ? placeCentre(toLandPlace(home)) : [sx, sz]
  const fd = home ? home.exterior.footprint[1] : 0
  const vx = front[0]!
  const vz = front[1]! + fd / 2 + 4
  const visitorSpawn: Spawn = { x: vx, y: heightAt(vx, vz), z: vz, yaw: Math.PI }
  return { grid, spawn: { x: sx, y: heightAt(sx, sz), z: sz, yaw: 0 }, visitorSpawn, heightAt, spots: () => spots }
}

/** The pet-era starter island as a body world, so playback runs on one kind of world until the island is retired. */
export function bodyWorldFromStarter(world: StarterWorld, pack: SpeciesPack): BodyWorld {
  return {
    grid: world.nav.grid,
    spawn: world.spawn,
    visitorSpawn: world.spawn,
    heightAt: (x, z) => islandHeight(x, z, world.cfg),
    spots: (sun) => collectSpots(pack, world.cfg, world.nav, world.spawn, sun, world.objects),
  }
}

/**
 * What the body walks on, for the mind, the replay and the viewer. A world with places gets the new land (chunks, buildings,
 * doors). A world without any keeps the pet-era island exactly as it was, so a world that has not been migrated does not change
 * under anyone. Everyone makes this choice from the same files with this one function, which keeps playback identical.
 */
export function bodyWorldFor(o: { seed: number; pack: SpeciesPack; places: readonly Place[]; objects: readonly WorldObject[] }): BodyWorld {
  return o.places.length > 0 ? buildBodyWorld(o.seed, o.places) : bodyWorldFromStarter(worldWithObjects(o.objects), o.pack)
}
