import type { Kit, Place } from '@forkling/schema'
import { SIGN_BOTTOM, SIGN_H, SIGN_W, signSpot } from './exhibitGeometry.ts'

/**
 * What a place's sign says and how it is painted, as plain data so it can be tested without a renderer. The board shows the place's
 * name in large type and, below it, the sign text a tend can rewrite (`exterior.sign`). The words are laid out in a "design cell"
 * of 512 by 236 pixels; the atlas scales it onto each sign's own smaller cell.
 */
export const SIGN_CELL = { w: 512, h: 236 } as const

/** Room kept clear at each side of the cell, in design pixels. */
export const SIGN_PAD = 24
const PAD = SIGN_PAD
/** Room kept clear above and below the words. */
const VERTICAL_PAD = 16
const NAME_SIZES = [64, 56, 48, 42, 38, 36]
const TEXT_SIZES = [34, 32, 30, 28]
/** How wide a character of the sign's bold sans is, as a share of its size: an estimate that errs wide, so words never run off. */
const CHAR_WIDTH = 0.58

/** How wide a line would be, in design pixels. The browser fits the real width again when it paints. */
export const textWidth = (text: string, px: number): number => text.length * px * CHAR_WIDTH

export interface SignOp {
  text: string
  /** `name` is the place's name; `text` is its sign text. */
  role: 'name' | 'text'
  /** The size of the letters, in design pixels. */
  px: number
  /** The baseline, down from the top of the cell. Lines are centred across it. */
  y: number
  bold: boolean
}

export interface SignLayout {
  name: string[]
  text: string[]
  ops: SignOp[]
}

const squash = (s: string) => s.trim().replace(/\s+/g, ' ')

/** Words onto lines of at most `max` characters; a word longer than a line is broken, so nothing runs off the board. */
function wrap(text: string, max: number): string[] {
  const lines: string[] = []
  let line = ''
  for (let word of squash(text).split(' ')) {
    if (word === '') continue
    while (word.length > max) {
      if (line) lines.push(line)
      line = ''
      lines.push(word.slice(0, max))
      word = word.slice(max)
    }
    if (line === '') line = word
    else if (line.length + 1 + word.length <= max) line += ` ${word}`
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

const maxChars = (px: number) => Math.max(1, Math.floor((SIGN_CELL.w - 2 * PAD) / (px * CHAR_WIDTH)))
/** Two lines at most: what does not fit at the smallest size is cut, with a dot. */
const cut = (lines: string[], max: number): string[] => (lines.length <= 2 ? lines : [lines[0]!, `${lines[1]!.slice(0, Math.max(0, max - 1))}…`])

/**
 * The name and the sign text of a place laid out on its board: the largest type that puts the whole name on at most two lines
 * and the whole sign text below it on at most two smaller ones, all inside the cell. Text is plain characters, never markup.
 */
export function signLayout(place: Place): SignLayout {
  const nameText = squash(place.name)
  const signText = squash(place.exterior.sign)
  const room = SIGN_CELL.h - 2 * VERTICAL_PAD
  let chosen: { namePx: number; name: string[]; textPx: number; text: string[] } | undefined
  for (const namePx of NAME_SIZES) {
    const name = wrap(nameText, maxChars(namePx))
    if (name.length > 2) continue
    const nameHeight = name.length * namePx * 1.12
    if (signText === '') {
      if (nameHeight <= room) {
        chosen = { namePx, name, textPx: 0, text: [] }
        break
      }
      continue
    }
    for (const textPx of TEXT_SIZES.filter((px) => px <= namePx - 4)) {
      const text = wrap(signText, maxChars(textPx))
      if (text.length > 2) continue
      if (nameHeight + 14 + text.length * textPx * 1.15 <= room) {
        chosen = { namePx, name, textPx, text }
        break
      }
    }
    if (chosen) break
  }
  if (!chosen) {
    const namePx = NAME_SIZES.at(-1)!
    const textPx = TEXT_SIZES.at(-1)!
    chosen = { namePx, name: cut(wrap(nameText, maxChars(namePx)), maxChars(namePx)), textPx, text: signText === '' ? [] : cut(wrap(signText, maxChars(textPx)), maxChars(textPx)) }
  }
  const { namePx, name, textPx, text } = chosen
  const total = name.length * namePx * 1.12 + (text.length > 0 ? 14 + text.length * textPx * 1.15 : 0)
  let top = (SIGN_CELL.h - total) / 2
  const ops: SignOp[] = []
  for (const line of name) {
    ops.push({ text: line, role: 'name', px: namePx, y: top + namePx, bold: true })
    top += namePx * 1.12
  }
  if (text.length > 0) top += 14
  for (const line of text) {
    ops.push({ text: line, role: 'text', px: textPx, y: top + textPx, bold: false })
    top += textPx * 1.15
  }
  return { name, text, ops }
}

const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
const toHex = (rgb: number[]) => `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`
const luminance = (hex: string) => {
  const [r, g, b] = [0, 1, 2].map((i) => {
    const c = channel(hex, i) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

/** The contrast between two `#rrggbb` colours the way WCAG measures it: 1 for none, 21 for black on white. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

const CREAM = '#f6efdc'
const INK = '#241a12'

/** The colours a sign is painted in: the palette's wood, darkened until cream (or ink) letters read on it at 4.5 to 1 or better. */
export function signColors(wood: string): { bg: string; fg: string } {
  for (let step = 0; step <= 10; step++) {
    const bg = toHex([0, 1, 2].map((i) => channel(wood, i) * (1 - step * 0.09)))
    const fg = contrast(bg, CREAM) >= contrast(bg, INK) ? CREAM : INK
    if (contrast(bg, fg) >= 4.5) return { bg, fg }
  }
  return { bg: '#2a1f16', fg: CREAM }
}

export interface SignBoard {
  id: string
  /** The middle of the board's face, in the world. */
  position: [number, number, number]
  size: [number, number]
  layout: SignLayout
  colors: { bg: string; fg: string }
}

/** How far in front of the board's slab its painted face stands, so the two never fight. */
const FACE = 0.06

/** One board for each place: where it stands (by the door, facing the path), what it says and the colours it is painted in. */
export function signBoards(places: readonly Place[], baseOf: (place: Place) => number, kit: Kit): SignBoard[] {
  return places.map((place) => {
    const spot = signSpot(place, baseOf(place)).position
    const palette = kit.palettes.find((p) => p.id === place.exterior.palette) ?? kit.palettes[0]!
    return {
      id: place.id,
      position: [spot[0], spot[1] + SIGN_BOTTOM + SIGN_H / 2, spot[2] + FACE],
      size: [SIGN_W, SIGN_H],
      layout: signLayout(place),
      colors: signColors(palette.colors.wood),
    }
  })
}

/** One texture holds every sign. Each sign has a cell of 256 by 118 pixels (half the design cell), eight to a row. */
const ATLAS_CELL = { w: 256, h: 118 } as const
const ATLAS_COLUMNS = 8

export interface AtlasCell {
  x: number
  y: number
  /** Where the cell is in the texture, as texture coordinates (v counts up from the bottom, as three.js has it). */
  u0: number
  v0: number
  u1: number
  v1: number
}

export function atlasLayout(count: number): { cols: number; rows: number; width: number; height: number; cellW: number; cellH: number; scale: number; cell: (i: number) => AtlasCell } {
  const cols = Math.min(ATLAS_COLUMNS, Math.max(1, count))
  const rows = Math.max(1, Math.ceil(count / cols))
  const width = cols * ATLAS_CELL.w
  const height = rows * ATLAS_CELL.h
  return {
    cols,
    rows,
    width,
    height,
    cellW: ATLAS_CELL.w,
    cellH: ATLAS_CELL.h,
    scale: ATLAS_CELL.w / SIGN_CELL.w,
    cell(i) {
      const x = (i % cols) * ATLAS_CELL.w
      const y = Math.floor(i / cols) * ATLAS_CELL.h
      return { x, y, u0: x / width, u1: (x + ATLAS_CELL.w) / width, v0: 1 - (y + ATLAS_CELL.h) / height, v1: 1 - y / height }
    },
  }
}
