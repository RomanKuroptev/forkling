import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { contactSheet } from '../src/report/sheet.ts'

const solid = (w: number, h: number, rgb: [number, number, number]): Buffer => {
  const png = new PNG({ width: w, height: h })
  for (let i = 0; i < w * h; i++) png.data.set([...rgb, 255], i * 4)
  return PNG.sync.write(png)
}

describe('contactSheet', () => {
  it('tiles pictures into one PNG, in a grid, with red boxes where asked', () => {
    const out = contactSheet(
      [{ png: solid(10, 6, [0, 0, 255]) }, { png: solid(4, 4, [0, 255, 0]), boxes: [{ x: 0, y: 0, w: 4, h: 4 }] }, { png: solid(10, 6, [0, 0, 255]) }],
      { columns: 2, gap: 2 },
    )
    const png = PNG.sync.read(out)
    expect(out.subarray(1, 4).toString()).toBe('PNG')
    expect(png.width).toBe(2 + 10 + 2 + 4 + 2) // each column is as wide as its widest picture
    expect(png.height).toBe(2 + 6 + 2 + 6 + 2)
    const at = (x: number, y: number) => Array.from(png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 3))
    expect(at(2, 2)).toEqual([0, 0, 255])
    expect(at(14, 2)).toEqual([255, 0, 0]) // the box edge on the second picture
    expect(at(15, 3)).toEqual([0, 255, 0]) // inside the box
  })

  it('refuses an empty sheet', () => {
    expect(() => contactSheet([], { columns: 2 })).toThrow()
  })
})
