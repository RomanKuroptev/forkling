import { PNG } from 'pngjs'

export type Box = { x: number; y: number; w: number; h: number }
export type Tile = { png: Buffer; boxes?: Box[] }

const BACKGROUND = [255, 255, 255, 255] as const
const RED = [255, 0, 0, 255] as const

// A contact sheet: pictures in a grid on white, changed areas boxed in red. Always PNG, never SVG.
export function contactSheet(tiles: readonly Tile[], opts: { columns: number; gap?: number }): Buffer {
  if (tiles.length === 0) throw new Error('a contact sheet needs at least one picture')
  const gap = opts.gap ?? 8
  const cols = Math.max(1, Math.min(opts.columns, tiles.length))
  const images = tiles.map((t) => ({ img: PNG.sync.read(t.png), boxes: t.boxes ?? [] }))
  const rows = Math.ceil(images.length / cols)
  const colW = Array.from({ length: cols }, (_, c) => Math.max(...images.filter((_, i) => i % cols === c).map((t) => t.img.width)))
  const rowH = Array.from({ length: rows }, (_, r) => Math.max(...images.slice(r * cols, r * cols + cols).map((t) => t.img.height)))
  const width = gap + colW.reduce((a, w) => a + w + gap, 0)
  const height = gap + rowH.reduce((a, h) => a + h + gap, 0)
  const out = new PNG({ width, height })
  for (let i = 0; i < width * height; i++) out.data.set(BACKGROUND, i * 4)

  const set = (x: number, y: number, rgba: readonly number[]) => {
    if (x >= 0 && y >= 0 && x < width && y < height) out.data.set(rgba, (y * width + x) * 4)
  }
  images.forEach(({ img, boxes }, i) => {
    const c = i % cols
    const r = Math.floor(i / cols)
    const ox = gap + colW.slice(0, c).reduce((a, w) => a + w + gap, 0)
    const oy = gap + rowH.slice(0, r).reduce((a, h) => a + h + gap, 0)
    for (let y = 0; y < img.height; y++)
      for (let x = 0; x < img.width; x++) set(ox + x, oy + y, Array.from(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)))
    for (const b of boxes) {
      for (let x = b.x; x < b.x + b.w; x++) {
        set(ox + x, oy + b.y, RED)
        set(ox + x, oy + b.y + b.h - 1, RED)
      }
      for (let y = b.y; y < b.y + b.h; y++) {
        set(ox + b.x, oy + y, RED)
        set(ox + b.x + b.w - 1, oy + y, RED)
      }
    }
  })
  return PNG.sync.write(out)
}
