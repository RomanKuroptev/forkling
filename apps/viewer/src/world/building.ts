import type { Kit, KitPalette, Place } from '@forkling/schema'
import { DOOR_HALF, placeCentre, toLandPlace } from '@forkling/sim'
import { FLOOR_INSET, FLOOR_TOP, floorHeight, type Instance, type Shape } from './kitBase.ts'
import { compose } from './matrix.ts'
import { COLORS, INTERIOR, dayInteriorWall, interiorWall, outsideWall } from './theme.ts'

/**
 * The building model of docs/spec/v4/look.md: every building is drawn from six slots (base, body, front, crown, hero, glow) and is a
 * program on Merge's computer: its front is a window with a title bar. Silhouette first, few big shapes, three colours (body, accent
 * and glow of the palette) plus the neutrals chrome and white marble, one hero, a lit surface, nothing thinner than 0.15 m except neon.
 * The footprint, floors, the door's place and the body's physics come from the place file and are not touched: this is only looks.
 * Only the `tower` style is drawn this way so far; `buildingModel` returns nothing for the others, which keep their old drawing.
 */

/** Front and crown are clamped to the 12 m limit of spec 5.2, Roman to decide whether decoration counts. Lifting the clamp is this constant. */
export const MAX_OUTLINE_HEIGHT = 12
/** The thinnest a thing may be, in meters, unless it is neon (a glowing line). */
export const MIN_THICKNESS = 0.15
/** The slab a building stands on reaches this far past the footprint, on every side, and is this high. */
export const BASE_REACH = 0.8
export const BASE_HEIGHT = 0.12
/** The window of a body: at most one for each this many meters of wall, at least this wide and tall. */
export const WINDOW_EVERY = 4
export const WINDOW_SIZE: readonly [number, number] = [1.3, 1.7]
/** A false front stands over only the middle of a building wider than this, as wide as `NARROW_FRONT`. */
export const WIDE_BUILDING = 16
export const NARROW_FRONT = 8
/** The title bar along the top of the front. */
export const TITLE_BAR = 1
/** The glowing band round the body (the hero) is at least this tall. */
export const RING_HEIGHT = 0.45
/** The crown is this wide at its foot: steep and narrow. */
export const CROWN_WIDTH = 3.2

/** The frame round each window pane, as thick as the thinnest thing allowed, and how far it stands out of each face of the wall. */
export const FRAME = 0.15
export const FRAME_OUT = 0.1
/** The pane stands this far out of each face of its frame: just enough to be seen, not a slab (issue 358). */
export const PANE_OUT = 0.03
/** The inside of the walls is lined with a thin panel in the room's own colour (`interiorWall`), this thick. */
export const LINING = 0.025
/** The pane that covers a window from inside (`INTERIOR.windowNight`) is this thick. */
export const INSIDE_PANE = 0.02

const WALL_THICKNESS = 0.4
/**
 * Two faces in one plane fight in the depth buffer (stripes that shimmer as the visitor moves, issues 350, 353, 335, 337, 364, 370,
 * 371). Where two shapes meet face to face, one stands this far proud of the other.
 */
const SKIN = 0.01
/** How far inside the footprint's edge a wall's middle stands (the body cannot walk on the outer 0.8 m). */
const INSET = 0.4
const DOOR_HEIGHT = 2.2
/** Each floor of a tower stands this far in from the one below, on every side. */
const TAPER = 0.35
/** How far in from the footprint's edge the inside face of the walls is, lining included: the furniture stands inside this (`insideWalls.ts`). */
export const INNER_FACE = INSET + WALL_THICKNESS / 2 + SKIN + LINING
/** How far each floor's walls stand in from the ground floor's, on every side. */
export function floorTaper(place: Place, floor: number): number {
  const [fw, fd] = place.exterior.footprint
  return Math.min(TAPER * floor, Math.min(fw, fd) / 4)
}
/** How far the top of every wall leans in, on a floor, in meters: the outline reads as a trapezoid. */
const LEAN = 0.7

export interface BuildingModel {
  slots: { base: Instance[]; body: Instance[]; front: Instance[]; crown: Instance[]; hero: Instance[]; glow: Instance[] }
  instances: Instance[]
  /** The front: its width and height, and its area in square meters (the wall it is in the plane of, up to the top of the false front). */
  front: { width: number; height: number; area: number }
  /** The area of lit surface that faces the front, in square meters: the glowing windows in the front wall and the screen on the false front. */
  frontGlowArea: number
  /** The highest point of the outline above the ground slab's bottom. */
  outlineHeight: number
  /** The lining of the walls inside, in the room's own colour, round the windows and the door: drawn only with the inside. */
  inside: Instance[]
  /** The panes over the windows from inside (`INTERIOR.windowNight`, issue 435): drawn only with the inside. */
  insidePanes: Instance[]
  /** Where the place's name is written on the title bar (the viewer paints the text): its middle, and its size. Null when the front has no bar. */
  titleBar: { text: string; position: [number, number, number]; width: number; height: number } | null
}

type Colors = { body: string; accent: string; glow: string; chrome: string; marble: string }

const colorsOf = (palette: KitPalette): Colors => ({
  // Given colour enough to stay coloured in shade (look.md rule 2).
  body: outsideWall(palette.colors),
  accent: palette.colors.accent,
  glow: palette.colors.glow,
  chrome: palette.colors.metal,
  marble: COLORS.white,
})

/**
 * How far in from the footprint's edge the inside face of a ground-floor wall is (its lining), `up` meters above the floor: where a
 * thing hung in a corner touches the wall. A tower's walls lean in as they rise.
 */
export function innerWallFace(place: Place, up: number): number {
  const lean = place.exterior.style === 'tower' ? Math.sin(Math.atan2(LEAN, floorHeight(place))) * up : 0
  return INSET + WALL_THICKNESS / 2 + SKIN + LINING + lean
}

/** The height of the front: as tall as the larger of 1.5 times the body or the body plus 2.5 m, and no taller than the 12 m clamp. */
export function frontHeight(bodyHeight: number): number {
  return Math.min(MAX_OUTLINE_HEIGHT, Math.max(1.5 * bodyHeight, bodyHeight + 2.5))
}

/**
 * How tall the crown is, in meters: two thirds of the body, standing on top of the front over the door; the clamp cuts it to the
 * 12 m limit. (So the tip is at the front's height plus this.)
 */
export function crownHeight(bodyHeight: number, share = 2 / 3): number {
  return Math.max(0, Math.min(bodyHeight * share, MAX_OUTLINE_HEIGHT - frontHeight(bodyHeight)))
}

/** The styles drawn by the building model, and how tall each one's crown is as a share of the body (a third to two thirds). */
export const CROWN_SHARE: Record<string, number> = { tower: 2 / 3, timber: 1 / 3, stone: 1 / 2, glass: 1 / 3, 'tin-shack': 1 / 2 }

/** The width of the front: the whole building, or the middle 8 m of one wider than 16 m. */
export const frontWidth = (footprintWidth: number): number => (footprintWidth > WIDE_BUILDING ? NARROW_FRONT : footprintWidth)

/** A wall of a floor: the back, the two sides, the front, or the two pieces of the front either side of the door. */
export type WallSide = 'back' | 'left' | 'right' | 'front' | 'front-left' | 'front-right'

/** Is this kit part a window (Merge may put one in a room, against a wall)? */
const isWindowPart = (id: string) => id.startsWith('window-')

/** The key of one placed part of a place: its room's index and its own index in that room. */
export const partKey = (room: number, part: number) => `${room}/${part}`

/**
 * Where the windows of a building model are (issue 346). By default the windows of a wall are spread evenly along it, one for each
 * 4 m. When Merge put window parts in a room against an outer wall, that wall's windows stand where those parts are instead, and
 * the parts themselves are not drawn: one framed pane in the wall, not a part's pane floating beside the model's. `consumed` are
 * those parts (`partKey`).
 */
export function windowLayout(place: Place): { along: (floor: number, side: WallSide) => number[]; consumed: Set<string> } {
  const [px, pz] = placeCentre(toLandPlace(place))
  const [fw, fd] = place.exterior.footprint
  const taper = (f: number) => Math.min(TAPER * f, Math.min(fw, fd) / 4)
  const out = new Map<string, number[]>()
  const consumed = new Set<string>()
  for (let f = 0; f < place.exterior.floors; f++) {
    const t = taper(f)
    const x0 = px - fw / 2 + INSET + t
    const x1 = px + fw / 2 - INSET - t
    const z0 = pz - fd / 2 + INSET + t
    const z1 = pz + fd / 2 - INSET - t
    // Each wall with windows: its side, its line (x or z it stands on), whether it runs along z, and its two ends.
    const walls: { side: WallSide; fixed: number; alongZ: boolean; a: number; b: number }[] = [
      { side: 'back', fixed: z0, alongZ: false, a: x0, b: x1 },
      { side: 'left', fixed: x0, alongZ: true, a: z0, b: z1 },
      { side: 'right', fixed: x1, alongZ: true, a: z0, b: z1 },
      ...(f === 0
        ? [
            { side: 'front-left' as const, fixed: z1, alongZ: false, a: x0, b: px - DOOR_HALF },
            { side: 'front-right' as const, fixed: z1, alongZ: false, a: px + DOOR_HALF, b: x1 },
          ]
        : []),
    ]
    for (const w of walls) {
      const n = Math.floor((w.b - w.a) / WINDOW_EVERY)
      const even = Array.from({ length: n }, (_, k) => w.a + ((w.b - w.a) * (k + 0.5)) / n)
      // The window parts of the rooms on this floor that stand against this wall.
      const parts: { key: string; along: number }[] = []
      place.rooms.forEach((room, r) => {
        if (room.floor !== f) return
        room.parts.forEach((placed, k) => {
          if (!isWindowPart(placed.part)) return
          const x = px + room.at[0] + placed.at[0]
          const z = pz + room.at[1] + placed.at[2]
          const [line, along] = w.alongZ ? [x, z] : [z, x]
          if (Math.abs(line - w.fixed) <= 0.9 && along >= w.a && along <= w.b) parts.push({ key: partKey(r, k), along })
        })
      })
      if (n === 0 || parts.length === 0) {
        out.set(`${f}/${w.side}`, even)
        continue
      }
      // One window where each part is, kept clear of the wall's ends and of each other, and no more than the wall may have.
      const lo = w.a + WINDOW_SIZE[0] / 2 + 0.2
      const hi = w.b - WINDOW_SIZE[0] / 2 - 0.2
      const kept: number[] = []
      for (const along of parts.map((p) => Math.min(hi, Math.max(lo, p.along))).sort((p, q) => p - q)) {
        if (kept.length < n && (kept.length === 0 || along - kept[kept.length - 1]! >= WINDOW_SIZE[0] + 0.6)) kept.push(along)
      }
      for (const p of parts) consumed.add(p.key)
      out.set(`${f}/${w.side}`, kept)
    }
  }
  return { along: (floor, side) => out.get(`${floor}/${side}`) ?? [], consumed }
}

/** The six slots of a building, or nothing for a style that is not drawn this way yet. */
export function buildingModel(place: Place, kit: Kit, baseY: number): BuildingModel | null {
  const style = place.exterior.style
  if (!(style in CROWN_SHARE)) return null
  const palette = kit.palettes.find((p) => p.id === place.exterior.palette) ?? kit.palettes[0]!
  const c = colorsOf(palette)
  // The body is the palette's pastel wall, white marble (stone) or chrome (tin-shack).
  const bodyColor = style === 'stone' ? c.marble : style === 'tin-shack' ? COLORS.metal : c.body
  const [px, pz] = placeCentre(toLandPlace(place))
  const [fw, fd] = place.exterior.footprint
  const h = floorHeight(place)
  const floors = place.exterior.floors
  const bodyH = h * floors

  const slots: BuildingModel['slots'] = { base: [], body: [], front: [], crown: [], hero: [], glow: [] }
  const add = (slot: keyof BuildingModel['slots'], shape: Shape, at: [number, number, number], size: [number, number, number], color: string, glow = false, rot: [number, number, number] = [0, 0, 0]): void => {
    slots[slot].push({ shape, matrix: compose(at, rot, size), color, ...(glow ? { glow: true } : {}), ...(!glow && color === c.accent ? { trim: true } : {}), ...(style === 'glass' && color === bodyColor && shape === 'box' ? { glass: true } : {}) })
  }
  // The lining of the walls inside (not for a glass house, whose walls are see-through), in the room's own colour.
  const inside: Instance[] = []
  const insidePanes: Instance[] = []
  const lining = style === 'glass' ? null : interiorWall(palette.colors.trim)
  const dayLining = dayInteriorWall(palette.colors)
  const windows = windowLayout(place)

  // Base: a low marble slab, wider than the footprint, with a thin glowing edge.
  add('base', 'box', [px, baseY + BASE_HEIGHT / 2, pz], [fw + 2 * BASE_REACH, BASE_HEIGHT, fd + 2 * BASE_REACH], c.marble)
  // The edge reaches 1 cm under the slab, so their undersides are never in one plane (they would fight).
  add('base', 'box', [px, baseY + 0.02, pz], [fw + 2 * BASE_REACH + 0.2, 0.06, fd + 2 * BASE_REACH + 0.2], c.glow, true)

  // Body: smooth wall panels on every floor, each leaning in a little and each floor a little narrower than the one below, with few
  // big glowing windows. `dir` is +1 for a wall whose inside is towards +x or +z (back and left), -1 for the front and right.
  let frontWindows = 0
  const tilt = style === 'tower' ? Math.atan2(LEAN, h) : 0
  const lean = Math.sin(tilt)
  const taper = (f: number) => Math.min(TAPER * f, Math.min(fw, fd) / 4)
  const windowTop = h / 2 + WINDOW_SIZE[1] / 2
  const ringUp = Math.min(h - RING_HEIGHT / 2 - 0.1, windowTop + 0.15 + RING_HEIGHT / 2)
  for (let f = 0; f < floors; f++) {
    const y = baseY + f * h
    const t = taper(f)
    const x0 = px - fw / 2 + INSET + t
    const x1 = px + fw / 2 - INSET - t
    const z0 = pz - fd / 2 + INSET + t
    const z1 = pz + fd / 2 - INSET - t
    const wall = (a: number, b: number, fixed: number, alongZ: boolean, dir: 1 | -1, side: WallSide, front = false, gap: 'none' | 'before' | 'after' = 'none') => {
      const length = b - a
      if (length < 0.5) return
      const mid = (a + b) / 2
      // A wall piece reaches 0.25 m past each end to cover the leaning corners, but never into the door gap.
      const bodyLen = length + (gap === 'before' ? 0 : 0.25) + (gap === 'after' ? 0 : 0.25)
      const bodyMid = mid + (gap === 'after' ? -0.125 : gap === 'before' ? 0.125 : 0)
      /** A point on the wall `up` meters above its foot, `out` meters outward, along the wall at `along`. The wall leans in as it rises. */
      const at = (along: number, up: number, out = 0): [number, number, number] => {
        const plane = fixed + dir * up * lean - dir * out
        return alongZ ? [plane, y + up * Math.cos(tilt), along] : [along, y + up * Math.cos(tilt), plane]
      }
      const size = (len: number, up: number, thick: number): [number, number, number] => (alongZ ? [thick, up, len] : [len, up, thick])
      const rot: [number, number, number] = alongZ ? [0, 0, -dir * tilt] : [dir * tilt, 0, 0]
      // The outer face stands `SKIN` back from the wall's line, so a part the place file set flush with the line (a door on an upper
      // floor) stands just in front of the wall and shows, instead of fighting it (issues 370, 371) or being covered by it.
      // On the ground floor, how far up the wall (along its lean) a leaning box of this height and thickness centred `up` must start
      // so its lowest corner is on the floor's line, not under the ground (a tower's walls dipped 8 cm into it). Zero when upright.
      const rise = (up: number, height: number, thick: number) => (f === 0 ? Math.max(0, -(up * Math.cos(tilt) - (height / 2) * Math.cos(tilt) - (thick / 2) * lean) / Math.cos(tilt)) : 0)
      const wallH = h / Math.cos(tilt)
      const bodyRise = rise(h / 2, wallH, WALL_THICKNESS - SKIN)
      add('body', 'box', at(bodyMid, h / 2 + bodyRise / 2, -SKIN / 2), size(bodyLen, wallH - bodyRise, WALL_THICKNESS - SKIN), bodyColor, false, rot)
      if (f === 0) add('body', 'box', at(bodyMid, 0.125 + rise(0.125, 0.25, WALL_THICKNESS + 0.12)), size(bodyLen + 0.1, 0.25, WALL_THICKNESS + 0.12), c.accent, false, rot)
      // The top band rises `SKIN` over the wall top, so the two tops are not in one plane (issue 364).
      if (f === floors - 1) add('body', 'box', at(bodyMid, h - 0.125 + SKIN / 2), size(bodyLen + 0.1, 0.25 + SKIN, WALL_THICKNESS + 0.12), c.accent, false, rot)
      // The glowing band round the body (the hero), above the windows, on the top floor, on every side.
      if (style === 'tower' && f === floors - 1) add('hero', 'box', at(mid, ringUp, WALL_THICKNESS / 2 + 0.15), size(length + 1.1, RING_HEIGHT, 0.3), c.glow, true, rot)
      const alongs = side === 'front' ? [] : windows.along(f, side)
      if (front) frontWindows += alongs.length
      const [ww, wh] = WINDOW_SIZE
      for (const along of alongs) {
        // A frame of the accent colour that stands out of both faces of the wall, and the pane just proud of the frame: one box
        // each, so the frame shows as a border round the pane.
        // The frame belongs to the window (the glow slot), so a place being built is drawn without it, as before.
        add('glow', 'box', at(along, h / 2), size(ww + 2 * FRAME, wh + 2 * FRAME, WALL_THICKNESS + 2 * FRAME_OUT), c.accent, false, rot)
        add('glow', 'box', at(along, h / 2), size(ww, wh, WALL_THICKNESS + 2 * FRAME_OUT + 2 * PANE_OUT), c.glow, true, rot)
      }
      if (!lining) return
      // From inside, each pane is covered by a thin pane `SKIN` clear of the glass: by day the palette's glow, as from outside; at night
      // a glow in the look's pink, not the flat lemon that read as the sun still out (issue 435).
      const paneIn = -(WALL_THICKNESS / 2 + FRAME_OUT + PANE_OUT + SKIN + INSIDE_PANE / 2)
      for (const along of alongs) insidePanes.push({ shape: 'box', matrix: compose(at(along, h / 2, paneIn), rot, size(ww, wh, INSIDE_PANE)), color: INTERIOR.windowNight, dayColor: c.glow, glow: true, inside: true })
      // The lining: from the foot band to the top band, from inner corner to inner corner (or to the door), round each window.
      // At the door the lining stops `SKIN` short of the wall's end, so its end is not in the plane of the wall's (the door's reveal).
      const from = gap === 'before' ? a + SKIN : a + WALL_THICKNESS / 2
      const to = gap === 'after' ? b - SKIN : b - WALL_THICKNESS / 2
      const lo = 0.25
      const hi = h - 0.25
      // `SKIN` clear of the wall's inner face, so the two are never in one plane.
      const inward = -(WALL_THICKNESS / 2 + SKIN + LINING / 2)
      const piece = (p: number, q: number, u0: number, u1: number) => {
        if (q - p < 0.02 || u1 - u0 < 0.02) return
        inside.push({ shape: 'box', matrix: compose(at((p + q) / 2, (u0 + u1) / 2, inward), rot, size(q - p, u1 - u0, LINING)), color: lining, inside: true, dayColor: dayLining })
      }
      let cursor = from
      for (const along of alongs) {
        piece(cursor, along - ww / 2, lo, hi)
        piece(along - ww / 2, along + ww / 2, lo, h / 2 - wh / 2)
        piece(along - ww / 2, along + ww / 2, h / 2 + wh / 2, hi)
        cursor = along + ww / 2
      }
      piece(cursor, to, lo, hi)
    }
    wall(x0, x1, z0, false, 1, 'back')
    wall(z0, z1, x0, true, 1, 'left')
    wall(z0, z1, x1, true, -1, 'right')
    if (f === 0) {
      // The door is in the middle of the front (+z) wall, as wide a gap as the body's own world leaves, with a lintel over it.
      wall(x0, px - DOOR_HALF, z1, false, -1, 'front-left', true, 'after')
      wall(px + DOOR_HALF, x1, z1, false, -1, 'front-right', true, 'before')
      // The band goes on over the door too, above it.
      if (style === 'tower' && floors === 1) add('hero', 'box', [px, y + ringUp * Math.cos(tilt), z1 - ringUp * lean + WALL_THICKNESS / 2 + 0.15], [DOOR_HALF * 2 + 1, RING_HEIGHT, 0.3], c.glow, true, [-tilt, 0, 0])
      const lintel = h - DOOR_HEIGHT
      if (lintel > 0.05) add('body', 'box', [px, y + DOOR_HEIGHT + lintel / 2, z1 - lean * (DOOR_HEIGHT + lintel / 2) - SKIN / 2], [DOOR_HALF * 2, lintel, WALL_THICKNESS - SKIN], bodyColor)
      if (lining && h - 0.25 - DOOR_HEIGHT > 0.02) {
        const up = (DOOR_HEIGHT + SKIN + h - 0.25) / 2
        inside.push({ shape: 'box', matrix: compose([px, y + up, z1 - lean * up - WALL_THICKNESS / 2 - SKIN - LINING / 2], [0, 0, 0], [DOOR_HALF * 2 - 2 * SKIN, h - 0.25 - DOOR_HEIGHT - SKIN, LINING]), color: lining, inside: true, dayColor: dayLining })
      }
      // A doorstep in the accent colour (the foot band going on across the door) runs from the room out over the slab and its glowing
      // edge, as high as the floor inside: the doorway shows a step, not white marble and a glowing line blown out to a white smear
      // (issue 350).
      // It starts where the floor inside stops, so the two tops meet edge to edge and never overlap. It is lit trim like the foot band,
      // so a yellow step is not khaki at night (issue 409).
      const stepFrom = pz + fd / 2 - FLOOR_INSET
      const stepTo = pz + fd / 2 + BASE_REACH + 0.1 + SKIN
      const stepFoot = 0.03
      slots.base.push({ shape: 'box', matrix: compose([px, y + (FLOOR_TOP + stepFoot) / 2, (stepFrom + stepTo) / 2], [0, 0, 0], [DOOR_HALF * 2 - 2 * SKIN, FLOOR_TOP - stepFoot, stepTo - stepFrom]), color: c.accent, trim: true })
      // A closed place has its door boarded: chrome planks nailed across the gap, a little crooked.
      if (place.state.closed) {
        const planks: [number, number][] = [[0.55, 0.05], [1.1, -0.06], [1.65, 0.04]]
        for (const [up, tiltPlank] of planks) slots.body.push({ shape: 'box', matrix: compose([px, y + up, z1 + 0.22], [0, 0, tiltPlank], [DOOR_HALF * 2 + 0.5, 0.26, 0.16]), color: c.chrome })
      }
    } else {
      wall(x0, x1, z1, false, -1, 'front', true)
    }
  }
  // A flat chrome roof over the top floor, its top 2 cm over the wall tops (1 cm over the top band) so no two tops share a plane.
  const top = taper(floors - 1)
  const roofTop = baseY + bodyH + 2 * SKIN
  add('body', 'box', [px, roofTop - 0.11, pz], [fw - 2 * INSET - 2 * top - 0.2, 0.22, fd - 2 * INSET - 2 * top - 0.2], c.chrome)

  // Front: the door wall as a window on the desktop. It rises above the roof as a false front: a title bar in the accent colour with
  // three small buttons and the place's name, and a glowing screen below it.
  const fh = frontHeight(bodyH)
  const fwid = frontWidth(fw)
  const frontZ = pz + fd / 2 - INSET - lean * bodyH + 0.1
  const panel = fh - bodyH
  let screen = 0
  let titleBar: BuildingModel['titleBar'] = null
  if (panel >= TITLE_BAR + 0.5) {
    // The panel reaches 2 cm down past the roof line and is 2 cm narrower on each side than the title bar, and the bar stands 2 cm
    // proud of it at the top and the back, so no face of one is in the plane of a face of the other (issue 337: the back showed the
    // fight as bits of text).
    add('front', 'box', [px, baseY + bodyH + panel / 2 - 2 * SKIN / 2, frontZ], [fwid - 4 * SKIN, panel + 2 * SKIN, 0.5], bodyColor)
    add('front', 'box', [px, baseY + fh - TITLE_BAR / 2 + SKIN, frontZ + 0.04], [fwid, TITLE_BAR + 2 * SKIN, 0.62], c.accent)
    for (let k = 0; k < 3; k++) add('front', 'box', [px + fwid / 2 - 0.55 - k * 0.6, baseY + fh - TITLE_BAR / 2, frontZ + 0.4], [0.4, 0.4, 0.3], c.marble)
    const nameW = Math.max(1, fwid - 2.6)
    // The whole name, on one line: the painter squeezes a long one into the bar, so it is never cut (issue 366).
    titleBar = { text: place.name.trim().replace(/\s+/g, ' ').toUpperCase(), position: [px - fwid / 2 + 0.3 + nameW / 2, baseY + fh - TITLE_BAR / 2, frontZ + 0.37], width: nameW, height: TITLE_BAR * 0.6 }
    const screenW = Math.max(1, fwid - 1.5)
    // The screen fills the panel under the title bar and, when that is too little for 16 percent of the front, runs down over the front wall.
    const barTop = fh - TITLE_BAR - 0.1
    const wanted = (0.16 * fh * fwid) / screenW
    const screenH = Math.min(barTop - DOOR_HEIGHT - 0.6, Math.max(0.6, panel - TITLE_BAR - 0.2, wanted))
    add('glow', 'box', [px, baseY + barTop - screenH / 2, frontZ + 0.05], [screenW, screenH, 0.55], c.glow, true)
    screen = screenW * screenH
  }

  // Crown and hero, by style. The crown stands on the front over the door and gives the outline; the hero is the one bold feature.
  const ch = crownHeight(bodyH, CROWN_SHARE[style])
  const crownY = baseY + fh
  const front0 = pz + fd / 2 - INSET - lean * bodyH
  let heroGlow = 0
  /**
   * The crown stands on the front's top, behind it, higher than the roof: a drum under it from the roof up to the crown's foot, so
   * from the side and behind it does not float as a plate over the roof (issue 364).
   */
  const drum = (at: [number, number], w: number, d: number, color: string, shape: Shape = 'box') => {
    const from = baseY + bodyH
    if (crownY - from > 0.05) add('crown', shape, [at[0], (from + crownY) / 2, at[1]], [w, crownY - from, d], color)
  }
  if (style === 'tower') {
    if (ch > 0.2) {
      add('crown', 'cone', [px, crownY + ch / 2, frontZ - 0.3 - CROWN_WIDTH / 2], [CROWN_WIDTH, ch, CROWN_WIDTH], c.glow, true)
      drum([px, frontZ - 0.3 - CROWN_WIDTH / 2], CROWN_WIDTH * 0.6, CROWN_WIDTH * 0.6, c.chrome)
    }
  } else if (style === 'timber') {
    // A pastel villa: a low chrome pyramid, and a porch of four thick white marble columns standing forward under a porch slab, clear of the door.
    if (ch > 0.2) {
      const w = Math.min(6, fwid * 0.5)
      add('crown', 'cone', [px, crownY + ch / 2, frontZ - 0.3 - w / 2], [w, ch, w], c.chrome)
      drum([px, frontZ - 0.3 - w / 2], w * 0.6, w * 0.6, c.chrome)
    }
    const inner = Math.max(DOOR_HALF + 1.2, fw * 0.18)
    const outer = Math.max(inner + 1.2, fw / 2 - 1)
    for (const x of [-outer, -inner, inner, outer]) add('hero', 'cylinder', [px + x, baseY + bodyH / 2, front0 + 1.5], [0.8, bodyH, 0.8], c.marble)
    add('hero', 'box', [px, baseY + bodyH + 0.2, front0 + 1.1], [outer * 2 + 1.8, 0.4, 3.0], c.marble)
  } else if (style === 'stone') {
    // A marble temple: a dome set back behind the front so the whole name shows, and one tall round arch round the door, 0.4 m out from the wall.
    if (ch > 0.2) {
      const r = Math.min(5, fwid * 0.5)
      add('crown', 'sphere', [px, crownY, frontZ - 0.4 - r / 2], [r, Math.min(ch * 2, r * 1.1), r], c.marble)
      drum([px, frontZ - 0.4 - r / 2], r * 0.6, r * 0.6, c.marble, 'cylinder')
    }
    const R = DOOR_HALF + 0.4
    const archZ = front0 + 0.4 + 0.3
    const springY = baseY + Math.max(DOOR_HEIGHT + 0.3, 2.6)
    for (const s2 of [-1, 1]) add('hero', 'box', [px + s2 * R, (baseY + springY) / 2, archZ], [0.6, springY - baseY, 0.6], c.marble)
    // The round top: eight short marble pieces on a semicircle, each turned to follow it.
    const pieces = 8
    for (let k = 0; k < pieces; k++) {
      const a = (Math.PI * (k + 0.5)) / pieces
      add('hero', 'box', [px + Math.cos(a) * R, springY + Math.sin(a) * R, archZ], [(Math.PI * R) / pieces + 0.15, 0.6, 0.6], c.marble, false, [0, 0, a - Math.PI / 2])
    }
  } else if (style === 'glass') {
    // A screen house: tinted see-through walls, a tall glowing screen beside the door from the foot band to the top band, and a flat
    // chrome lid that overhangs by 0.8 m with a neon edge.
    const w = Math.max(1.2, fw / 2 - DOOR_HALF - 0.3)
    const hh = Math.max(1, bodyH - 0.5)
    add('hero', 'box', [px - (DOOR_HALF + 0.1 + w / 2), baseY + 0.25 + hh / 2, front0 + 0.3], [w, hh, 0.5], c.glow, true)
    heroGlow = w * hh
    add('crown', 'box', [px, baseY + bodyH + 0.25, pz], [fw + 1.6, 0.5, fd + 1.6], c.chrome)
    // The neon edge sits 1 cm up inside the lid, so its underside is not in the plane of the lid's.
    add('crown', 'box', [px, baseY + bodyH + 0.05, pz], [fw + 1.7, 0.08, fd + 1.7], c.glow, true)
  } else {
    // An arcade: a pale shiny metal body, three stepped blocks each smaller than the one below, and a neon sign standing above the top step.
    let signY = crownY + 0.6
    if (ch > 0.2) {
      const step = ch / 3
      const widths = [Math.min(7, fwid * 0.55), Math.min(5, fwid * 0.4), Math.min(3, fwid * 0.25)]
      widths.forEach((w, k) => add('crown', 'box', [px, crownY + step * (k + 0.5), frontZ - 0.6], [w, step, 2.4 - k * 0.5], c.chrome))
      drum([px, frontZ - 1.05], widths[0]! * 0.8, 1.5, c.chrome)
      signY = crownY + ch + 0.6
    }
    add('hero', 'box', [px, Math.min(baseY + MAX_OUTLINE_HEIGHT - 0.5, signY), frontZ - 0.6], [Math.min(6, fwid * 0.5), 0.9, 0.35], c.glow, true)
  }

  const frontGlowArea = screen + heroGlow + frontWindows * WINDOW_SIZE[0] * WINDOW_SIZE[1]

  const instances = [...slots.base, ...slots.body, ...slots.front, ...slots.crown, ...slots.hero, ...slots.glow]
  return {
    slots,
    instances,
    front: { width: fwid, height: fh, area: fwid * fh },
    frontGlowArea,
    inside,
    insidePanes,
    outlineHeight: Math.max(fh + ch, bodyH + 1),
    titleBar,
  }
}
