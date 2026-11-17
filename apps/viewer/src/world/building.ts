import type { Kit, KitPalette, Place } from '@forkling/schema'
import { DOOR_HALF, placeCentre, toLandPlace } from '@forkling/sim'
import { floorHeight, type Instance, type Shape } from './kitBase.ts'
import { compose } from './matrix.ts'
import { COLORS } from './theme.ts'

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

const WALL_THICKNESS = 0.4
/** How far inside the footprint's edge a wall's middle stands (the body cannot walk on the outer 0.8 m). */
const INSET = 0.4
const DOOR_WIDTH = 2
const DOOR_HEIGHT = 2.2
/** Each floor of a tower stands this far in from the one below, on every side. */
const TAPER = 0.35
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
  /** Where the place's name is written on the title bar (the viewer paints the text): its middle, and its size. Null when the front has no bar. */
  titleBar: { text: string; position: [number, number, number]; width: number; height: number } | null
}

type Colors = { body: string; accent: string; glow: string; chrome: string; marble: string }

const colorsOf = (palette: KitPalette): Colors => ({
  body: palette.colors.wall,
  accent: palette.colors.accent,
  glow: palette.colors.glow,
  chrome: palette.colors.metal,
  marble: COLORS.white,
})

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

/** The six slots of a building, or nothing for a style that is not drawn this way yet. */
export function buildingModel(place: Place, kit: Kit, baseY: number): BuildingModel | null {
  const style = place.exterior.style
  if (!(style in CROWN_SHARE)) return null
  const palette = kit.palettes.find((p) => p.id === place.exterior.palette) ?? kit.palettes[0]!
  const c = colorsOf(palette)
  // The body is the palette's pastel wall, white marble (stone) or chrome (tin-shack).
  const bodyColor = style === 'stone' ? c.marble : style === 'tin-shack' ? c.chrome : c.body
  const [px, pz] = placeCentre(toLandPlace(place))
  const [fw, fd] = place.exterior.footprint
  const h = floorHeight(place)
  const floors = place.exterior.floors
  const bodyH = h * floors

  const slots: BuildingModel['slots'] = { base: [], body: [], front: [], crown: [], hero: [], glow: [] }
  const add = (slot: keyof BuildingModel['slots'], shape: Shape, at: [number, number, number], size: [number, number, number], color: string, glow = false, rot: [number, number, number] = [0, 0, 0]): void => {
    slots[slot].push({ shape, matrix: compose(at, rot, size), color, ...(glow ? { glow: true } : {}) })
  }

  // Base: a low marble slab, wider than the footprint, with a thin glowing edge.
  add('base', 'box', [px, baseY + BASE_HEIGHT / 2, pz], [fw + 2 * BASE_REACH, BASE_HEIGHT, fd + 2 * BASE_REACH], c.marble)
  add('base', 'box', [px, baseY + 0.025, pz], [fw + 2 * BASE_REACH + 0.2, 0.05, fd + 2 * BASE_REACH + 0.2], c.glow, true)

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
    const wall = (a: number, b: number, fixed: number, alongZ: boolean, dir: 1 | -1, windows: boolean, front = false, gap: 'none' | 'before' | 'after' = 'none') => {
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
      add('body', 'box', at(bodyMid, h / 2), size(bodyLen, h / Math.cos(tilt), WALL_THICKNESS), bodyColor, false, rot)
      if (f === 0) add('body', 'box', at(bodyMid, 0.125), size(bodyLen + 0.1, 0.25, WALL_THICKNESS + 0.12), c.accent, false, rot)
      if (f === floors - 1) add('body', 'box', at(bodyMid, h - 0.125), size(bodyLen + 0.1, 0.25, WALL_THICKNESS + 0.12), c.accent, false, rot)
      // The glowing band round the body (the hero), above the windows, on the top floor, on every side.
      if (style === 'tower' && f === floors - 1) add('hero', 'box', at(mid, ringUp, WALL_THICKNESS / 2 + 0.15), size(length + 1.1, RING_HEIGHT, 0.3), c.glow, true, rot)
      if (!windows) return
      const n = Math.floor(length / WINDOW_EVERY)
      if (front) frontWindows += n
      for (let k = 0; k < n; k++) {
        const along = a + (length * (k + 0.5)) / n
        const centre = at(along, h / 2)
        add('glow', 'box', centre, size(WINDOW_SIZE[0], WINDOW_SIZE[1], WALL_THICKNESS + 0.5), c.glow, true)
      }
    }
    wall(x0, x1, z0, false, 1, true)
    wall(z0, z1, x0, true, 1, true)
    wall(z0, z1, x1, true, -1, true)
    if (f === 0) {
      // The door is in the middle of the front (+z) wall, as wide a gap as the body's own world leaves, with a lintel over it.
      wall(x0, px - DOOR_HALF, z1, false, -1, true, true, 'after')
      wall(px + DOOR_HALF, x1, z1, false, -1, true, true, 'before')
      add('body', 'box', [px, y + DOOR_HEIGHT / 2, z1], [DOOR_WIDTH, DOOR_HEIGHT, 0.3], c.accent)
      // The band goes on over the door too, above it.
      if (style === 'tower' && floors === 1) add('hero', 'box', [px, y + ringUp * Math.cos(tilt), z1 - ringUp * lean + WALL_THICKNESS / 2 + 0.15], [DOOR_HALF * 2 + 1, RING_HEIGHT, 0.3], c.glow, true, [-tilt, 0, 0])
      const lintel = h - DOOR_HEIGHT
      if (lintel > 0.05) add('body', 'box', [px, y + DOOR_HEIGHT + lintel / 2, z1 - lean * (DOOR_HEIGHT + lintel / 2)], [DOOR_HALF * 2, lintel, WALL_THICKNESS], bodyColor)
      // A closed place has its door boarded: chrome planks nailed across the gap, a little crooked.
      if (place.state.closed) {
        const planks: [number, number][] = [[0.55, 0.05], [1.1, -0.06], [1.65, 0.04]]
        for (const [up, tiltPlank] of planks) slots.body.push({ shape: 'box', matrix: compose([px, y + up, z1 + 0.22], [0, 0, tiltPlank], [DOOR_HALF * 2 + 0.5, 0.26, 0.16]), color: c.chrome })
      }
    } else {
      wall(x0, x1, z1, false, -1, false, true)
    }
  }
  // A flat chrome roof over the top floor.
  const top = taper(floors - 1)
  add('body', 'box', [px, baseY + bodyH - 0.1, pz], [fw - 2 * INSET - 2 * top - 0.2, 0.2, fd - 2 * INSET - 2 * top - 0.2], c.chrome)

  // Front: the door wall as a window on the desktop. It rises above the roof as a false front: a title bar in the accent colour with
  // three small buttons and the place's name, and a glowing screen below it.
  const fh = frontHeight(bodyH)
  const fwid = frontWidth(fw)
  const frontZ = pz + fd / 2 - INSET - lean * bodyH + 0.1
  const panel = fh - bodyH
  let screen = 0
  let titleBar: BuildingModel['titleBar'] = null
  if (panel >= TITLE_BAR + 0.5) {
    add('front', 'box', [px, baseY + bodyH + panel / 2, frontZ], [fwid, panel, 0.5], bodyColor)
    add('front', 'box', [px, baseY + fh - TITLE_BAR / 2, frontZ + 0.05], [fwid, TITLE_BAR, 0.6], c.accent)
    for (let k = 0; k < 3; k++) add('front', 'box', [px + fwid / 2 - 0.55 - k * 0.6, baseY + fh - TITLE_BAR / 2, frontZ + 0.4], [0.4, 0.4, 0.3], c.marble)
    const nameW = Math.max(1, fwid - 2.6)
    titleBar = { text: place.name.toUpperCase().slice(0, 24), position: [px - fwid / 2 + 0.3 + nameW / 2, baseY + fh - TITLE_BAR / 2, frontZ + 0.37], width: nameW, height: TITLE_BAR * 0.6 }
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
  if (style === 'tower') {
    if (ch > 0.2) add('crown', 'cone', [px, crownY + ch / 2, frontZ], [CROWN_WIDTH, ch, CROWN_WIDTH], c.glow, true)
  } else if (style === 'timber') {
    // A pastel villa: a low chrome pyramid, and a porch of four white marble columns across the front, clear of the door.
    if (ch > 0.2) add('crown', 'cone', [px, crownY + ch / 2, frontZ], [Math.min(6, fwid * 0.5), ch, Math.min(6, fwid * 0.5)], c.chrome)
    const inner = Math.max(DOOR_HALF + 0.9, fw * 0.16)
    const outer = Math.max(inner + 1, fw / 2 - 1)
    for (const x of [-outer, -inner, inner, outer]) add('hero', 'cylinder', [px + x, baseY + bodyH / 2, front0 + 1.1], [0.7, bodyH, 0.7], c.marble)
    add('hero', 'box', [px, baseY + bodyH + 0.15, front0 + 0.9], [outer * 2 + 1.4, 0.3, 2.0], c.marble)
  } else if (style === 'stone') {
    // A marble temple: a dome, and one tall arch round the door.
    if (ch > 0.2) add('crown', 'sphere', [px, crownY, frontZ], [Math.min(5, fwid * 0.5), ch * 2, Math.min(5, fwid * 0.5)], c.marble)
    const archH = Math.min(bodyH - 0.1, Math.max(DOOR_HEIGHT + 0.3, 3.6))
    for (const s2 of [-1, 1]) add('hero', 'box', [px + s2 * (DOOR_HALF + 0.55), baseY + archH / 2, front0 + 0.5], [0.6, archH, 0.7], c.marble)
    add('hero', 'box', [px, baseY + archH + 0.3, front0 + 0.5], [DOOR_HALF * 2 + 1.7, 0.6, 0.7], c.marble)
  } else if (style === 'glass') {
    // A screen house: a flat chrome slab with a neon edge, and a screen that fills the front beside the door.
    if (ch > 0.2) {
      const slabW = Math.min(8, fwid * 0.6)
      add('crown', 'box', [px, crownY + 0.3, frontZ - 0.8], [slabW, 0.6, 3], c.chrome)
      add('crown', 'box', [px, crownY + 0.05, frontZ - 0.8], [slabW + 0.3, 0.08, 3.3], c.glow, true)
    }
    const w = Math.max(1.2, fw / 2 - DOOR_HALF - 1.6)
    const hh = Math.min(bodyH - 0.6, 2.4)
    add('hero', 'box', [px - (DOOR_HALF + 0.8 + w / 2), baseY + 0.4 + hh / 2, front0 + 0.3], [w, hh, 0.5], c.glow, true)
    heroGlow = w * hh
  } else {
    // An arcade: three stepped blocks, each smaller than the one below, and a neon sign on the roof.
    if (ch > 0.2) {
      const step = ch / 3
      const widths = [Math.min(7, fwid * 0.55), Math.min(5, fwid * 0.4), Math.min(3, fwid * 0.25)]
      widths.forEach((w, k) => add('crown', 'box', [px, crownY + step * (k + 0.5), frontZ - 0.6], [w, step, 2.4 - k * 0.5], c.chrome))
    }
    add('hero', 'box', [px, baseY + bodyH + 0.7, frontZ - 0.1], [Math.min(7, fwid * 0.5), 0.9, 0.35], c.glow, true)
  }

  const frontGlowArea = screen + heroGlow + frontWindows * WINDOW_SIZE[0] * WINDOW_SIZE[1]

  const instances = [...slots.base, ...slots.body, ...slots.front, ...slots.crown, ...slots.hero, ...slots.glow]
  return {
    slots,
    instances,
    front: { width: fwid, height: fh, area: fwid * fh },
    frontGlowArea,
    outlineHeight: Math.max(fh + ch, bodyH + 1),
    titleBar,
  }
}
