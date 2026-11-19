import type { PNG } from 'pngjs'
import type { Box } from '../report/sheet.ts'

/** Measures on one world picture (audit spec 7.3, 7.4). Pure: pixels in, numbers out. */

const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b

/** The mean light (0 to 255) and its spread (the standard deviation): a blank picture has almost none. */
export function pictureStats(p: PNG): { light: number; spread: number } {
  let sum = 0
  let sq = 0
  const n = p.width * p.height
  for (let i = 0; i < p.data.length; i += 4) {
    const l = lum(p.data[i]!, p.data[i + 1]!, p.data[i + 2]!)
    sum += l
    sq += l * l
  }
  const light = sum / n
  return { light, spread: Math.sqrt(Math.max(0, sq / n - light * light)) }
}

const hex = (h: string): [number, number, number] => {
  const n = Number.parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * The share of pixels near a colour of the look's palette, or near that colour mixed by the light and the mist (towards the
 * mists, the deep shade or white): within `tolerance` of the line between them.
 */
export function paletteShare(p: PNG, palette: readonly string[], tolerance = 40): number {
  const cols = palette.map(hex)
  const pairs: [number[], number[]][] = []
  // Each colour as it is, and as light, mist and shade mix it: towards the day mist, the night mist, the deep shadow and white.
  const mixes = ['#ffd6f1', '#b48cff', '#2b0b5e', '#ffffff'].map(hex)
  for (const c of cols) for (const m of [c, ...mixes]) pairs.push([c, m])
  const cache = new Map<number, boolean>()
  let near = 0
  const n = p.width * p.height
  for (let i = 0; i < p.data.length; i += 4) {
    // Colours in steps of 8, so a picture of a few hundred thousand pixels needs only a few thousand distance sums.
    const key = ((p.data[i]! >> 3) << 10) | ((p.data[i + 1]! >> 3) << 5) | (p.data[i + 2]! >> 3)
    let ok = cache.get(key)
    if (ok === undefined) {
      const c = [p.data[i]!, p.data[i + 1]!, p.data[i + 2]!]
      ok = pairs.some(([a, b]) => {
        const ab = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!]
        const len = ab[0]! ** 2 + ab[1]! ** 2 + ab[2]! ** 2
        const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((c[0]! - a[0]!) * ab[0]! + (c[1]! - a[1]!) * ab[1]! + (c[2]! - a[2]!) * ab[2]!) / len))
        return Math.hypot(c[0]! - (a[0]! + t * ab[0]!), c[1]! - (a[1]! + t * ab[1]!), c[2]! - (a[2]! + t * ab[2]!)) <= tolerance
      })
      cache.set(key, ok)
    }
    if (ok) near++
  }
  return near / n
}

/** Flicker is judged in squares of this many pixels; a square where more than `PATCH` of the pixels jump is a fighting patch. */
const BLOCK = 16
const PATCH = 0.25

/**
 * Flicker (two surfaces fighting): pixels that jump by more than `jump` in a channel between two pictures taken with the
 * camera moved 1 mm, counted only in patches. Moving the camera also shifts every edge by a pixel, but that is thin lines,
 * never a patch. Returns the share of the picture in fighting patches and the box around them.
 */
export function flicker(a: PNG, b: PNG, jump = 64): { share: number; box: Box | null } {
  let patched = 0
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let by = 0; by < a.height; by += BLOCK) {
    for (let bx = 0; bx < a.width; bx += BLOCK) {
      let n = 0
      let size = 0
      for (let y = by; y < Math.min(a.height, by + BLOCK); y++) {
        for (let x = bx; x < Math.min(a.width, bx + BLOCK); x++) {
          const i = (y * a.width + x) * 4
          size++
          if (Math.max(Math.abs(a.data[i]! - b.data[i]!), Math.abs(a.data[i + 1]! - b.data[i + 1]!), Math.abs(a.data[i + 2]! - b.data[i + 2]!)) > jump) n++
        }
      }
      if (n / size <= PATCH) continue
      patched += size
      x0 = Math.min(x0, bx)
      y0 = Math.min(y0, by)
      x1 = Math.max(x1, Math.min(a.width, bx + BLOCK) - 1)
      y1 = Math.max(y1, Math.min(a.height, by + BLOCK) - 1)
    }
  }
  return { share: patched / (a.width * a.height), box: patched ? { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 } : null }
}
