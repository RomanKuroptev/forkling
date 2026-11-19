import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { PNG } from 'pngjs'
import { worldFileList } from './fixtures.ts'

/** Left out of a fixture: the history, the old lives and the tick log, which no world check reads and which make it big. */
const SKIP = [/^\.git\//, /^\.github\//, /^archive\//, /^mind\/ticks\//, /^events\//]

/** Pictures wider than this are made this wide (keeping the shape), so a fixture stays near 2 MB. */
const MAX_WIDTH = 200
/** Pictures smaller than this are kept as they are. */
const KEEP_BYTES = 24_000

/** A smaller copy of a PNG: each new pixel is the average of the pixels it covers. */
export function shrinkPng(bytes: Buffer, maxWidth = MAX_WIDTH): Buffer {
  const src = PNG.sync.read(bytes)
  if (src.width <= maxWidth) return bytes
  const w = maxWidth
  const h = Math.max(1, Math.round((src.height * w) / src.width))
  const out = new PNG({ width: w, height: h })
  const sx = src.width / w
  const sy = src.height / h
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sum = [0, 0, 0, 0]
      let n = 0
      for (let yy = Math.floor(y * sy); yy < Math.min(src.height, Math.floor((y + 1) * sy)); yy++) {
        for (let xx = Math.floor(x * sx); xx < Math.min(src.width, Math.floor((x + 1) * sx)); xx++) {
          const i = (yy * src.width + xx) * 4
          for (let c = 0; c < 4; c++) sum[c]! += src.data[i + c]!
          n++
        }
      }
      const o = (y * w + x) * 4
      for (let c = 0; c < 4; c++) out.data[o + c] = Math.round(sum[c]! / Math.max(1, n))
    }
  }
  return PNG.sync.write(out)
}

/** Copies a world into `dest` (emptied first) without what fixtures leave out, with big pictures made small. */
export function trimWorld(src: string, dest: string): { files: number; bytes: number } {
  rmSync(dest, { recursive: true, force: true })
  let files = 0
  let bytes = 0
  for (const rel of worldFileList(src)) {
    if (SKIP.some((s) => s.test(rel))) continue
    const to = join(dest, rel)
    mkdirSync(dirname(to), { recursive: true })
    if (rel.toLowerCase().endsWith('.png') && statSync(join(src, rel)).size > KEEP_BYTES) {
      writeFileSync(to, shrinkPng(readFileSync(join(src, rel))))
    } else {
      copyFileSync(join(src, rel), to)
    }
    files++
    bytes += statSync(to).size
  }
  return { files, bytes }
}
