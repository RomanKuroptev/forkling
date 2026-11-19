import type { Kit, KitPalette, Place } from '@forkling/schema'
import { placeCentre, toLandPlace } from '@forkling/sim'
import { floorHeight, type Instance } from './kitBase.ts'
import { compose } from './matrix.ts'
import { settledPlace } from './insideWalls.ts'

/** A finished work (status `shelf`), as the gallery wall needs it. */
export interface GalleryWork {
  id: string
  title: string
  about: string
  made: string
  /** It has `works/<id>/thumb.png`: its tile shows that picture, else its title in terminal green. */
  thumb: boolean
}

type Vec3 = [number, number, number]

/** One tile's place on the board: every page puts its works in the same slots. */
export interface WallSlot {
  /** The middle of the tile (picture and caption) in the world. */
  position: Vec3
  /** Along the wall from the board's line through the terminal, and up from the floor (meters). */
  local: [number, number]
  /** The tile's width and height, picture and caption (meters). */
  size: [number, number]
  /** The picture's width and height (meters): a screen's shape. */
  picture: [number, number]
}

export interface GalleryWall {
  placeId: string
  /** The gallery exhibit whose terminal carries the wall. */
  exhibit: Place['exhibits'][number]
  rotY: number
  /** The board's line on the wall at the floor: along 0 is straight behind the terminal. */
  origin: Vec3
  /** The glowing board, a box: its middle and its width, height and depth. */
  board: { position: Vec3; size: Vec3 }
  /** The face painted with the page's tiles, just in front of the board: its middle and its width and height. */
  face: { position: Vec3; size: [number, number] }
  cols: number
  rows: number
  /** One page's tiles, left to right from the top row. */
  slots: WallSlot[]
  /** How many pages it takes to show every work. */
  pages: number
  /** Newest first, a page of `slots.length` at a time. */
  works: GalleryWork[]
}

/** How long each page stays up before the next one, in milliseconds of the world's clock. */
export const GALLERY_PAGE_MS = 8000

/** A tile: a picture the shape of a screen (as `SCREEN_FACE`), a caption under it, and a gap around it (meters, at scale 1). */
const PICTURE: [number, number] = [0.76, 0.46]
const CAPTION = 0.15
const GAP = 0.08
const CELL: [number, number] = [PICTURE[0] + GAP, PICTURE[1] + CAPTION + GAP]
/** The board's edge around the tiles, the strip at its foot that says which works are up, its depth and its glowing rim. */
const EDGE = 0.06
const STRIP = 0.13
const DEPTH = 0.05
const RIM = 0.04
/** At most this many tiles on a page, and a tile never larger than this scale (few big shapes, look.md). */
const MAX_TILES = 6
const MAX_SCALE = 1.3
/** A layout whose tiles are at least this scale is big enough; then the one with the most tiles wins. */
const BIG_ENOUGH = 0.8
/** The board stays this far from the side walls and from windows, and keeps this gap under the wall's top band (0.25 m). */
const SIDE_GAP = 0.1
const WINDOW_GAP = 0.12
const TOP_BAND = 0.25
const CEILING_GAP = 0.1
/** It starts this far above the terminal's top. */
const ABOVE_TERMINAL = 0.12
/** The walls' inner faces stand this far inside the footprint (their middle is 0.4 m in, they are up to 0.4 m thick). */
const WALL_INNER = 0.6
/** A terminal this close to a wall has its board hung on that wall; one further out carries it on its own back. */
const ON_WALL = 1.2
const TERMINAL_BACK = 0.3
/** The widest board. */
const MAX_WIDTH = 2.2

/** How far a ray from (x, z) along (dx, dz) runs before it leaves the rectangle of half sizes hw by hd. */
function toEdge(x: number, z: number, dx: number, dz: number, hw: number, hd: number): number {
  let t = Infinity
  if (dx > 1e-9) t = Math.min(t, (hw - x) / dx)
  if (dx < -1e-9) t = Math.min(t, (-hw - x) / dx)
  if (dz > 1e-9) t = Math.min(t, (hd - z) / dz)
  if (dz < -1e-9) t = Math.min(t, (-hd - z) / dz)
  return Math.max(0, t)
}

const UNIT = [-0.5, 0.5]

/** The world corners of an instance's unit shape. */
function corners(i: Instance): Vec3[] {
  const m = i.matrix
  return UNIT.flatMap((x) => UNIT.flatMap((y) => UNIT.map((z): Vec3 => [m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!])))
}

/** `[lo, hi]` with the `cuts` taken out, as the pieces that are left. */
function subtract(lo: number, hi: number, cuts: readonly [number, number][]): [number, number][] {
  let pieces: [number, number][] = [[lo, hi]]
  for (const [a, b] of cuts) pieces = pieces.flatMap(([p, q]): [number, number][] => (b <= p || a >= q ? [[p, q]] : [...(a > p ? [[p, a] as [number, number]] : []), ...(b < q ? [[b, q] as [number, number]] : [])]))
  return pieces
}

/** The most tiles that are still big on the space, or the biggest tiles when none are. */
function layout(n: number, w: number, h: number): { cols: number; rows: number; scale: number } | null {
  let best: { cols: number; rows: number; scale: number } | null = null
  const better = (a: { cols: number; rows: number; scale: number }, b: typeof a | null) => {
    if (!b) return true
    const bigA = a.scale >= BIG_ENOUGH
    const bigB = b.scale >= BIG_ENOUGH
    if (bigA !== bigB) return bigA
    if (bigA) return a.cols * a.rows !== b.cols * b.rows ? a.cols * a.rows > b.cols * b.rows : a.scale > b.scale
    return a.scale !== b.scale ? a.scale > b.scale : a.cols * a.rows > b.cols * b.rows
  }
  for (let cols = 1; cols <= MAX_TILES; cols++) {
    for (let rows = 1; cols * rows <= MAX_TILES; rows++) {
      // No column with nothing in it, and no row that would stay empty on every page.
      if (cols > n || (rows - 1) * cols >= n) continue
      const scale = Math.min(MAX_SCALE, w / (cols * CELL[0]), h / (rows * CELL[1]))
      if (scale < 0.4) continue
      const next = { cols, rows, scale }
      if (better(next, best)) best = next
    }
  }
  return best
}

/**
 * The gallery wall (spec 7.2: every finished work is shown somewhere in the world). The screens hold the newest few works; the
 * terminal that holds a `gallery` exhibit also carries a board on the wall behind it, with a few big tiles, each showing one work
 * (its thumbnail, or its title in terminal green, with its title under it). The board turns its pages every `GALLERY_PAGE_MS`,
 * newest first, so every finished work comes up; pointing at a tile names the work and a tap opens it, and the terminal under it
 * opens the whole list. The board keeps clear of the place's windows (`outside`, its exterior instances) and stays under the
 * band at the top of the walls. How it looks is the body's choice; which works are finished comes from their files.
 */
export function galleryWalls(place: Place, kit: Kit, baseY: number, shelf: readonly GalleryWork[], outside: readonly Instance[]): GalleryWall[] {
  if (shelf.length === 0) return []
  place = settledPlace(place, kit)
  const [px, pz] = placeCentre(toLandPlace(place))
  const height = floorHeight(place)
  const [fw, fd] = place.exterior.footprint
  const hw = fw / 2 - WALL_INNER
  const hd = fd / 2 - WALL_INNER
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
    // Place space (from the place's middle): the terminal's foot, the way it faces, and its sideways direction.
    const tx = room.at[0] + placed.at[0]
    const tz = room.at[1] + placed.at[2]
    const fwd: [number, number] = [s, c]
    const side: [number, number] = [c, -s]
    const back = toEdge(tx, tz, -fwd[0], -fwd[1], hw, hd)
    const behind = back < ON_WALL ? back - DEPTH / 2 - 0.005 : TERMINAL_BACK
    const bx = tx - fwd[0] * behind
    const bz = tz - fwd[1] * behind
    const floorY = baseY + room.floor * height
    const bottom = placed.at[1] + part.size[1] + ABOVE_TERMINAL
    const top = Math.min(height - TOP_BAND - CEILING_GAP, room.size[2] - CEILING_GAP)
    if (top - bottom < 0.5) continue
    // The wall's windows that the board could cover: near its plane and in its height, as stretches along it.
    const cuts: [number, number][] = []
    for (const i of outside) {
      if (!i.glow) continue
      const pts = corners(i)
      const ys = pts.map((p) => p[1] - floorY)
      if (Math.max(...ys) - Math.min(...ys) < 0.5 || Math.max(...ys) <= bottom || Math.min(...ys) >= top) continue
      const depth = pts.map((p) => (p[0] - px - bx) * fwd[0] + (p[2] - pz - bz) * fwd[1])
      if (Math.max(...depth) < -0.6 || Math.min(...depth) > 0.6) continue
      const along = pts.map((p) => (p[0] - px - bx) * side[0] + (p[2] - pz - bz) * side[1])
      cuts.push([Math.min(...along) - WINDOW_GAP, Math.max(...along) + WINDOW_GAP])
    }
    const lo = -toEdge(bx, bz, -side[0], -side[1], hw, hd) + SIDE_GAP
    const hi = toEdge(bx, bz, side[0], side[1], hw, hd) - SIDE_GAP
    const free = subtract(lo, hi, cuts).filter(([a, b]) => b - a >= CELL[0] * 0.6 + 2 * EDGE)
    if (free.length === 0) continue
    // The free stretch behind the terminal, or the nearest one to it.
    const gap = ([a, b]: [number, number]) => (a <= 0 && b >= 0 ? 0 : Math.min(Math.abs(a), Math.abs(b)))
    const [fa, fb] = [...free].sort((p, q) => gap(p) - gap(q) || q[1] - q[0] - (p[1] - p[0]))[0]!
    const fit = layout(shelf.length, Math.min(MAX_WIDTH, fb - fa) - 2 * EDGE, top - bottom - 2 * EDGE - STRIP)
    if (!fit) continue
    const { cols, rows, scale } = fit
    const cellW = CELL[0] * scale
    const cellH = CELL[1] * scale
    const bw = cols * cellW + 2 * EDGE
    const bh = rows * cellH + STRIP + 2 * EDGE
    const centre = Math.min(Math.max(0, fa + bw / 2), fb - bw / 2)
    const cy = bottom + bh / 2
    const origin: Vec3 = [px + bx, floorY, pz + bz]
    const world = (along: number, up: number, out: number): Vec3 => [origin[0] + along * side[0] + out * fwd[0], floorY + up, origin[2] + along * side[1] + out * fwd[1]]
    const slots: WallSlot[] = []
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const along = centre + (k - (cols - 1) / 2) * cellW
        const up = bottom + bh - EDGE - (r + 0.5) * cellH
        slots.push({ position: world(along, up, DEPTH / 2 + 0.01), local: [along, up], size: [cellW, cellH], picture: [PICTURE[0] * scale, PICTURE[1] * scale] })
      }
    }
    out.push({
      placeId: place.id,
      exhibit,
      rotY: placed.rot,
      origin,
      board: { position: world(centre, cy, 0), size: [bw, bh, DEPTH] },
      face: { position: world(centre, cy, DEPTH / 2 + 0.006), size: [bw - 2 * RIM, bh - 2 * RIM] },
      cols,
      rows,
      slots,
      pages: Math.ceil(shelf.length / slots.length),
      works: [...shelf],
    })
  }
  return out
}

/** The page up at a moment of the world's clock: the same in every window. */
export function pageAt(wall: GalleryWall, nowMs: number): number {
  const n = Math.floor(nowMs / GALLERY_PAGE_MS)
  return ((n % wall.pages) + wall.pages) % wall.pages
}

/** The works on a page, each in its slot. */
export function tilesOn(wall: GalleryWall, page: number): { work: GalleryWork; slot: WallSlot }[] {
  const per = wall.slots.length
  return wall.works.slice(page * per, page * per + per).map((work, k) => ({ work, slot: wall.slots[k]! }))
}

/** Where on the wall a work hangs (its slot on its page), for the scene list. */
export function slotOf(wall: GalleryWall, index: number): WallSlot {
  return wall.slots[index % wall.slots.length]!
}

/** The board: a box in the place's glow colour, whose rim shows round the painted face and glows (look.md: things that glow). */
export function wallInstances(wall: GalleryWall, colors: KitPalette['colors']): Instance[] {
  return [{ shape: 'box', matrix: compose(wall.board.position, [0, wall.rotY, 0], wall.board.size), color: colors.glow, glow: true }]
}

/** The work under a point on the wall on the page shown, or null between and around the tiles. */
export function tileAt(wall: GalleryWall, page: number, point: readonly [number, number, number]): GalleryWork | null {
  const c = Math.cos(wall.rotY)
  const s = Math.sin(wall.rotY)
  const along = (point[0] - wall.origin[0]) * c - (point[2] - wall.origin[2]) * s
  const up = point[1] - wall.origin[1]
  const k = wall.slots.findIndex((t) => Math.abs(along - t.local[0]) <= t.size[0] / 2 && Math.abs(up - t.local[1]) <= t.size[1] / 2)
  return k < 0 ? null : (tilesOn(wall, page)[k]?.work ?? null)
}

export interface PixelRect {
  x: number
  y: number
  w: number
  h: number
}

/** Where everything is painted on the face's canvas, at `perMeter` pixels a meter: each slot's picture and caption, and the strip. */
export function wallFaceLayout(wall: GalleryWall, perMeter: number): { width: number; height: number; tiles: { picture: PixelRect; caption: PixelRect }[]; strip: PixelRect } {
  const [fw, fh] = wall.face.size
  const width = Math.round(fw * perMeter)
  const height = Math.round(fh * perMeter)
  const c = Math.cos(wall.rotY)
  const s = Math.sin(wall.rotY)
  const centreAlong = (wall.board.position[0] - wall.origin[0]) * c - (wall.board.position[2] - wall.origin[2]) * s
  const centreUp = wall.board.position[1] - wall.origin[1]
  const left = centreAlong - fw / 2
  const topUp = centreUp + fh / 2
  const px = (m: number) => Math.round(m * perMeter)
  const tiles = wall.slots.map((slot) => {
    const [pw, ph] = slot.picture
    const scale = pw / PICTURE[0]
    const x = slot.local[0] - pw / 2 - left
    // The picture starts half a gap under the tile's top; the caption is right under it.
    const y = topUp - (slot.local[1] + slot.size[1] / 2) + (GAP * scale) / 2
    return { picture: { x: px(x), y: px(y), w: px(pw), h: px(ph) }, caption: { x: px(x), y: px(y + ph), w: px(pw), h: px(CAPTION * scale) } }
  })
  const stripH = px(STRIP * 0.8)
  return { width, height, tiles, strip: { x: px(EDGE - RIM), y: height - stripH - px(Math.max(0, EDGE - RIM)), w: width - 2 * px(EDGE - RIM), h: stripH } }
}
