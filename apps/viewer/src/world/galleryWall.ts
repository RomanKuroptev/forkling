import type { Kit, KitPalette, Place } from '@forkling/schema'
import { placeCentre, toLandPlace } from '@forkling/sim'
import { floorHeight, type Instance } from './kitBase.ts'
import { compose } from './matrix.ts'
import { COLORS } from './theme.ts'

/** A finished work (status `shelf`), as the gallery wall needs it. */
export interface GalleryWork {
  id: string
  title: string
  about: string
  made: string
}

type Vec3 = [number, number, number]

export interface WallTile {
  work: GalleryWork
  /** Its middle in the world. */
  position: Vec3
  /** Across and up on the wall, from the foot of the terminal's part (meters). */
  local: [number, number]
  /** Width and height (meters). */
  size: [number, number]
  rotY: number
}

export interface GalleryWall {
  placeId: string
  /** The gallery exhibit whose terminal carries the wall. */
  exhibit: Place['exhibits'][number]
  /** The foot of the terminal's part in the world, and its turn. */
  origin: Vec3
  rotY: number
  /** How far apart the tiles are, middle to middle. */
  pitch: number
  board: { position: Vec3; size: Vec3 }
  /** Newest work first, left to right from the top row. */
  tiles: WallTile[]
}

/** The board stands this far behind the middle of the terminal (its back is at -0.25), from this far below the part's top. */
const BOARD_Z = -0.22
const BOARD_DEPTH = 0.05
const BOARD_BELOW_TOP = 0.4
/** The tiles start this far above the terminal's top, stay this far under the ceiling, and leave this edge on the board. */
const TILES_ABOVE_TOP = 0.1
const CEILING_GAP = 0.15
const EDGE = 0.06
/** The widest the board gets, and how far it keeps from the room's sides. */
const MAX_WIDTH = 1.8
const SIDE_GAP = 0.1
/** Tiles are as big as they can be for the shelf, between these (middle to middle). */
const MAX_PITCH = 0.42
const MIN_PITCH = 0.08

/** How far a ray from (x, z) along (dx, dz) runs before it leaves the rectangle of half sizes hw by hd. */
function toEdge(x: number, z: number, dx: number, dz: number, hw: number, hd: number): number {
  let t = Infinity
  if (dx > 1e-9) t = Math.min(t, (hw - x) / dx)
  if (dx < -1e-9) t = Math.min(t, (-hw - x) / dx)
  if (dz > 1e-9) t = Math.min(t, (hd - z) / dz)
  if (dz < -1e-9) t = Math.min(t, (-hd - z) / dz)
  return Math.max(0, t)
}

/**
 * The gallery wall (spec 7.2: every finished work is shown somewhere in the world). The screens hold the newest few works
 * (`planInstalls` in the mind); the terminal that holds a `gallery` exhibit also carries a board above it with one lit tile for
 * every work on the shelf, newest first, so no finished work is only on the site. The board grows with the shelf: a few works
 * get big tiles, many get small ones, and it stays inside the room. Pointing at a tile names the work, and a tap opens it.
 * How it looks is the body's choice; which works are finished comes from their files.
 */
export function galleryWalls(place: Place, kit: Kit, baseY: number, shelf: readonly GalleryWork[]): GalleryWall[] {
  if (shelf.length === 0) return []
  const [px, pz] = placeCentre(toLandPlace(place))
  const height = floorHeight(place)
  const out: GalleryWall[] = []
  for (const exhibit of place.exhibits) {
    if (exhibit.kind !== 'gallery') continue
    const m = /^([a-z0-9][a-z0-9-]*)\/(\d+)\/(\d+)$/.exec(exhibit.slot)
    const room = m ? place.rooms.find((r) => r.id === m[1]) : undefined
    const placed = room?.parts[Number(m?.[2])]
    const part = placed ? kit.parts.find((p) => p.id === placed.part) : undefined
    if (!room || !placed || !part || !part.slots[Number(m?.[3])]) continue
    const c = Math.cos(placed.rot)
    const s = Math.sin(placed.rot)
    // Room space: the part's foot and its sideways direction (local +x is (c, -s), as `exhibitSpots` turns a slot).
    const free = Math.min(toEdge(placed.at[0], placed.at[2], c, -s, room.size[0] / 2, room.size[1] / 2), toEdge(placed.at[0], placed.at[2], -c, s, room.size[0] / 2, room.size[1] / 2))
    const top = part.size[1]
    const tilesBottom = top + TILES_ABOVE_TOP
    const w = Math.min(MAX_WIDTH, 2 * (free - SIDE_GAP)) - 2 * EDGE
    const h = room.size[2] - placed.at[1] - CEILING_GAP - EDGE - tilesBottom
    if (w < MIN_PITCH || h < MIN_PITCH) continue
    const fit = (p: number) => Math.floor(w / p + 1e-9) * Math.floor(h / p + 1e-9)
    let pitch = MAX_PITCH
    while (pitch > MIN_PITCH && fit(pitch) < shelf.length) pitch = Math.max(MIN_PITCH, pitch - 0.005)
    // A shelf too big for the smallest tiles shows its newest works.
    const shown = shelf.slice(0, fit(pitch))
    if (shown.length === 0) continue
    const cols = Math.min(shown.length, Math.floor(w / pitch + 1e-9))
    const rows = Math.ceil(shown.length / cols)
    const origin: Vec3 = [px + room.at[0] + placed.at[0], baseY + room.floor * height + placed.at[1], pz + room.at[1] + placed.at[2]]
    const world = (lx: number, ly: number, lz: number): Vec3 => [origin[0] + lx * c + lz * s, origin[1] + ly, origin[2] - lx * s + lz * c]
    const boardBottom = Math.max(0, top - BOARD_BELOW_TOP)
    const boardTop = tilesBottom + rows * pitch + EDGE
    const tiles = shown.map((work, i): WallTile => {
      const lx = ((i % cols) - (cols - 1) / 2) * pitch
      const ly = tilesBottom + (rows - 1 - Math.floor(i / cols) + 0.5) * pitch
      return { work, position: world(lx, ly, BOARD_Z + BOARD_DEPTH / 2 + 0.012), local: [lx, ly], size: [pitch * 0.84, pitch * 0.64], rotY: placed.rot }
    })
    out.push({
      placeId: place.id,
      exhibit,
      origin,
      rotY: placed.rot,
      pitch,
      board: { position: world(0, (boardBottom + boardTop) / 2, BOARD_Z), size: [cols * pitch + 2 * EDGE, boardTop - boardBottom, BOARD_DEPTH] },
      tiles,
    })
  }
  return out
}

/** What a gallery wall looks like: a dark board, and a lit tile in the place's glow colour for each work. */
export function wallInstances(wall: GalleryWall, colors: KitPalette['colors']): Instance[] {
  return [
    { shape: 'box', matrix: compose(wall.board.position, [0, wall.rotY, 0], wall.board.size), color: COLORS.ink },
    ...wall.tiles.map((t): Instance => ({ shape: 'box', matrix: compose(t.position, [0, t.rotY, 0], [t.size[0], t.size[1], 0.02]), color: colors.glow })),
  ]
}

/** The tile under a point on the wall (where the visitor points), or null between and around the tiles. */
export function tileAt(wall: GalleryWall, point: readonly [number, number, number]): WallTile | null {
  const c = Math.cos(wall.rotY)
  const s = Math.sin(wall.rotY)
  const dx = point[0] - wall.origin[0]
  const dz = point[2] - wall.origin[2]
  const lx = dx * c - dz * s
  const ly = point[1] - wall.origin[1]
  const half = wall.pitch / 2
  return wall.tiles.find((t) => Math.abs(lx - t.local[0]) <= half && Math.abs(ly - t.local[1]) <= half) ?? null
}
