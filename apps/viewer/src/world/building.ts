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

const WALL_THICKNESS = 0.4
/** How far inside the footprint's edge a wall's middle stands (the body cannot walk on the outer 0.8 m). */
const INSET = 0.4
const DOOR_WIDTH = 2
const DOOR_HEIGHT = 2.2
/** Each floor of a tower stands this far in from the one below, on every side: it narrows a little as it rises. */
const TAPER = 0.35

export interface BuildingModel {
  slots: { base: Instance[]; body: Instance[]; front: Instance[]; crown: Instance[]; hero: Instance[]; glow: Instance[] }
  instances: Instance[]
  /** The front: its width and height, and its area in square meters (the wall it is in the plane of, up to the top of the false front). */
  front: { width: number; height: number; area: number }
  /** The area of lit surface that faces the front, in square meters: the glowing windows in the front wall and the screen on the false front. */
  frontGlowArea: number
  /** The highest point of the outline above the ground slab's bottom. */
  outlineHeight: number
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
 * How tall the crown stands on the roof, in meters. It is behind the front, so to give the outline its tip must rise above the front by
 * half the body (a third to two thirds); the clamp cuts it to the 12 m limit.
 */
export function crownHeight(bodyHeight: number): number {
  const tip = Math.min(MAX_OUTLINE_HEIGHT, frontHeight(bodyHeight) + bodyHeight * 0.5)
  return Math.max(0, tip - bodyHeight)
}

/** The width of the front: the whole building, or the middle 8 m of one wider than 16 m. */
export const frontWidth = (footprintWidth: number): number => (footprintWidth > WIDE_BUILDING ? NARROW_FRONT : footprintWidth)

/** The six slots of a building, or nothing for a style that is not drawn this way yet. */
export function buildingModel(place: Place, kit: Kit, baseY: number): BuildingModel | null {
  if (place.exterior.style !== 'tower') return null
  const palette = kit.palettes.find((p) => p.id === place.exterior.palette) ?? kit.palettes[0]!
  const c = colorsOf(palette)
  const [px, pz] = placeCentre(toLandPlace(place))
  const [fw, fd] = place.exterior.footprint
  const h = floorHeight(place)
  const floors = place.exterior.floors
  const bodyH = h * floors

  const slots: BuildingModel['slots'] = { base: [], body: [], front: [], crown: [], hero: [], glow: [] }
  const add = (slot: keyof BuildingModel['slots'], shape: Shape, at: [number, number, number], size: [number, number, number], color: string, glow = false): void => {
    slots[slot].push({ shape, matrix: compose(at, [0, 0, 0], size), color, ...(glow ? { glow: true } : {}) })
  }

  // Base: a low marble slab, wider than the footprint, with a thin glowing edge.
  add('base', 'box', [px, baseY + BASE_HEIGHT / 2, pz], [fw + 2 * BASE_REACH, BASE_HEIGHT, fd + 2 * BASE_REACH], c.marble)
  add('base', 'box', [px, baseY + 0.025, pz], [fw + 2 * BASE_REACH + 0.2, 0.05, fd + 2 * BASE_REACH + 0.2], c.glow, true)

  // Body: smooth wall panels on every floor, each floor a little narrower than the one below, with few big glowing windows.
  let frontWindows = 0
  const taper = (f: number) => Math.min(TAPER * f, Math.min(fw, fd) / 4)
  for (let f = 0; f < floors; f++) {
    const y = baseY + f * h
    const t = taper(f)
    const x0 = px - fw / 2 + INSET + t
    const x1 = px + fw / 2 - INSET - t
    const z0 = pz - fd / 2 + INSET + t
    const z1 = pz + fd / 2 - INSET - t
    const wall = (a: number, b: number, fixed: number, alongZ: boolean, windows: boolean, front = false) => {
      const length = b - a
      if (length < 0.5) return
      const mid = (a + b) / 2
      const at = (along: number, up: number): [number, number, number] => (alongZ ? [fixed, y + up, along] : [along, y + up, fixed])
      const size = (length: number, up: number, thick: number): [number, number, number] => (alongZ ? [thick, up, length] : [length, up, thick])
      add('body', 'box', at(mid, h / 2), size(length, h, WALL_THICKNESS), c.body)
      if (f === 0) add('body', 'box', at(mid, 0.125), size(length + 0.1, 0.25, WALL_THICKNESS + 0.12), c.accent)
      if (f === floors - 1) add('body', 'box', at(mid, h - 0.125), size(length + 0.1, 0.25, WALL_THICKNESS + 0.12), c.accent)
      if (!windows) return
      const n = Math.floor(length / WINDOW_EVERY)
      if (front) frontWindows += n
      for (let k = 0; k < n; k++) add('glow', 'box', at(a + (length * (k + 0.5)) / n, h / 2), size(WINDOW_SIZE[0], WINDOW_SIZE[1], WALL_THICKNESS + 0.5), c.glow, true)
    }
    wall(x0, x1, z0, false, true)
    wall(z0, z1, x0, true, true)
    wall(z0, z1, x1, true, true)
    if (f === 0) {
      // The door is in the middle of the front (+z) wall, as wide a gap as the body's own world leaves, with a lintel over it.
      wall(x0, px - DOOR_HALF, z1, false, true, true)
      wall(px + DOOR_HALF, x1, z1, false, true, true)
      add('body', 'box', [px, y + DOOR_HEIGHT / 2, z1], [DOOR_WIDTH, DOOR_HEIGHT, 0.3], c.accent)
      const lintel = h - DOOR_HEIGHT
      if (lintel > 0.05) add('body', 'box', [px, y + DOOR_HEIGHT + lintel / 2, z1], [DOOR_HALF * 2, lintel, WALL_THICKNESS], c.body)
      // A closed place has its door boarded: chrome planks nailed across the gap, a little crooked.
      if (place.state.closed) {
        const planks: [number, number][] = [[0.55, 0.05], [1.1, -0.06], [1.65, 0.04]]
        for (const [up, tilt] of planks) slots.body.push({ shape: 'box', matrix: compose([px, y + up, z1 + 0.22], [0, 0, tilt], [DOOR_HALF * 2 + 0.5, 0.26, 0.16]), color: c.chrome })
      }
    } else {
      wall(x0, x1, z1, false, false, true)
    }
  }
  // A flat chrome roof over the top floor.
  const top = taper(floors - 1)
  add('body', 'box', [px, baseY + bodyH - 0.1, pz], [fw - 2 * INSET - 2 * top + WALL_THICKNESS, 0.2, fd - 2 * INSET - 2 * top + WALL_THICKNESS], c.chrome)

  // Front: the door wall as a window on the desktop. It rises above the roof as a false front: a title bar in the accent colour with
  // three small buttons, and a glowing screen below it.
  const fh = frontHeight(bodyH)
  const fwid = frontWidth(fw)
  const frontZ = pz + fd / 2 - INSET + 0.1
  const panel = fh - bodyH
  let screen = 0
  if (panel >= TITLE_BAR + 0.5) {
    add('front', 'box', [px, baseY + bodyH + panel / 2, frontZ], [fwid, panel, 0.5], c.body)
    add('front', 'box', [px, baseY + fh - TITLE_BAR / 2, frontZ + 0.05], [fwid, TITLE_BAR, 0.6], c.accent)
    for (let k = 0; k < 3; k++) add('front', 'box', [px + fwid / 2 - 0.55 - k * 0.6, baseY + fh - TITLE_BAR / 2, frontZ + 0.4], [0.4, 0.4, 0.3], c.marble)
    const screenW = Math.max(1, fwid - 1.5)
    // The screen fills the panel under the title bar and, when that is too little for 16 percent of the front, runs down over the front wall.
    const barTop = fh - TITLE_BAR - 0.1
    const wanted = (0.16 * fh * fwid) / screenW
    const screenH = Math.min(barTop - DOOR_HEIGHT - 0.6, Math.max(0.6, panel - TITLE_BAR - 0.2, wanted))
    add('glow', 'box', [px, baseY + barTop - screenH / 2, frontZ + 0.05], [screenW, screenH, 0.55], c.glow, true)
    screen = screenW * screenH
  }
  // The windows in the front wall face the same way.
  const frontGlowArea = screen + frontWindows * WINDOW_SIZE[0] * WINDOW_SIZE[1]

  // Crown: a glowing pyramid tip on the roof behind the front.
  const ch = crownHeight(bodyH)
  if (ch > 0.2) {
    // It stands right behind the front, so its tip is seen above the front's top and not hidden behind it.
    const r = Math.max(1.5, Math.min(fw, fd) * 0.3 - top)
    add('crown', 'cone', [px, baseY + bodyH + ch / 2, frontZ - 0.3 - r], [r * 2, ch, r * 2], c.glow, true)
  }

  // Hero: one glowing ring around the tower, above the door.
  const ringY = baseY + Math.min(bodyH - 0.5, Math.max(DOOR_HEIGHT + 0.4, bodyH * 0.65))
  const t1 = taper(Math.min(floors - 1, Math.floor((ringY - baseY) / h)))
  const hx = fw / 2 - INSET - t1 + WALL_THICKNESS / 2 + 0.2
  const hz = fd / 2 - INSET - t1 + WALL_THICKNESS / 2 + 0.2
  const RING = MIN_THICKNESS + 0.01
  add('hero', 'box', [px, ringY, pz - hz], [2 * hx + RING, RING, RING], c.glow, true)
  add('hero', 'box', [px - hx, ringY, pz], [RING, RING, 2 * hz + RING], c.glow, true)
  add('hero', 'box', [px + hx, ringY, pz], [RING, RING, 2 * hz + RING], c.glow, true)
  if (ringY - baseY > DOOR_HEIGHT + 0.1) add('hero', 'box', [px, ringY, pz + hz], [2 * hx + RING, RING, RING], c.glow, true)
  else {
    for (const s of [-1, 1]) add('hero', 'box', [px + (s * (hx + DOOR_HALF)) / 2, ringY, pz + hz], [hx - DOOR_HALF + RING, RING, RING], c.glow, true)
  }

  const instances = [...slots.base, ...slots.body, ...slots.front, ...slots.crown, ...slots.hero, ...slots.glow]
  return {
    slots,
    instances,
    front: { width: fwid, height: fh, area: fwid * fh },
    frontGlowArea,
    outlineHeight: Math.max(fh, bodyH + ch),
  }
}
