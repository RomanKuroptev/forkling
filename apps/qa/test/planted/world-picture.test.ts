import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { flicker, paletteShare, pictureStats } from '../../src/world/picture.ts'

type RGB = [number, number, number]
const png = (w: number, h: number, paint: (x: number, y: number) => RGB): PNG => {
  const p = new PNG({ width: w, height: h })
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4
    const [r, g, b] = paint(x, y)
    p.data[i] = r
    p.data[i + 1] = g
    p.data[i + 2] = b
    p.data[i + 3] = 255
  }
  return p
}
const PALETTE = ['#7fe3d8', '#ff3fa4', '#2b0b5e', '#ffd6f1']

describe('picture measures (audit spec 7.3, 7.4)', () => {
  it('planted: a blank picture has no spread; a world picture has', () => {
    expect(pictureStats(png(40, 30, () => [120, 120, 120])).spread).toBeLessThan(1)
    expect(pictureStats(png(40, 30, (x, y) => (x < 20 ? [127, 227, 216] : y < 15 ? [255, 63, 164] : [43, 11, 94]))).spread).toBeGreaterThan(20)
  })
  it('planted: too dark and too bright show in the mean light', () => {
    expect(pictureStats(png(10, 10, () => [3, 2, 5])).light).toBeLessThan(10)
    expect(pictureStats(png(10, 10, () => [252, 253, 250])).light).toBeGreaterThan(245)
  })
  it('planted: a brown and grey picture is off the palette; a pastel one is on it', () => {
    expect(paletteShare(png(20, 20, () => [120, 80, 40]), PALETTE)).toBeLessThan(0.1)
    expect(paletteShare(png(20, 20, (x) => (x < 10 ? [127, 227, 216] : [255, 214, 241])), PALETTE)).toBeGreaterThan(0.9)
  })
  it('planted: a patch that changes between two pictures 1 mm apart is flicker, boxed', () => {
    const a = png(48, 48, () => [200, 100, 200])
    const b = png(48, 48, (x, y) => (x >= 16 && x < 32 && y >= 16 && y < 32 && (x + y) % 2 === 0 ? [20, 200, 20] : [200, 100, 200]))
    const f = flicker(a, b)
    expect(f.share).toBeGreaterThan(0.1)
    expect(f.box).toEqual({ x: 16, y: 16, w: 16, h: 16 })
    expect(flicker(a, a).share).toBe(0)
  })
  it('an edge that moves by a pixel is not flicker', () => {
    const a = png(48, 48, (x) => (x < 24 ? [200, 100, 200] : [20, 20, 120]))
    const b = png(48, 48, (x) => (x < 25 ? [200, 100, 200] : [20, 20, 120]))
    expect(flicker(a, b).share).toBe(0)
  })
})
