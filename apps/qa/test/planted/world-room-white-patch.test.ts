import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { floorWhiteShare, nearWhiteShare } from '../../src/world/picture.ts'
import { judgeShot, PICTURE_LEVELS } from '../../src/world/pictures.ts'

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
const judge = (name: string, p: PNG, night = false) => judgeShot({ name, png: PNG.sync.write(p) }, { fixture: 'planted', night, file: 'x.png' })

// Grown Place 10 as issue 429 saw it: pink walls, a pale pink floor (245, 190, 235), and a patch of the floor by the door lit pure
// white (a sixth of the floor's half of the picture), fading into the floor over a few pixels as light does: too little of the
// whole picture for the room-wide near-white share.
const PALE_FLOOR: RGB = [245, 190, 235]
const fade = (x: number): RGB => {
  if (x >= 50) return [255, 255, 255]
  const t = Math.max(0, 1 - (50 - x) / 6)
  return [Math.round(245 + 10 * t), Math.round(190 + 54 * t), Math.round(235 + 9 * t)]
}
const patchRoom = png(60, 40, (x, y) => (y < 20 ? [240, 170, 225] : fade(x)))
// The same room with its floor all pale pink, one with a small white thing (a card) on the wall, and a picture from a doorway onto
// the white marble slab outside: white with crisp edges against the cyan grid, a thing that is white, not light.
const paleRoom = png(60, 40, (_x, y) => (y < 20 ? [240, 170, 225] : PALE_FLOOR))
const cardOnWall = png(60, 40, (x, y) => (y < 20 ? (x >= 20 && x < 40 && y >= 5 && y < 15 ? [255, 255, 255] : [240, 170, 225]) : PALE_FLOOR))
const marbleOutside = png(60, 40, (x, y) => (y < 20 ? [200, 190, 240] : y < 26 && x >= 5 && x < 55 ? [255, 255, 255] : [128, 255, 255]))

describe('no pure white patch on a room floor (issue 429)', () => {
  it('measures the share of glare in the lower half of a picture, where the floor is', () => {
    expect(floorWhiteShare(patchRoom)).toBeCloseTo(1 / 6, 2)
    expect(floorWhiteShare(paleRoom)).toBe(0)
    expect(floorWhiteShare(cardOnWall)).toBe(0)
    expect(floorWhiteShare(marbleOutside)).toBe(0)
    // The room-wide near-white share does not see the patch on its own.
    expect(nearWhiteShare(patchRoom)).toBeLessThan(PICTURE_LEVELS.roomNearWhite)
  })

  it('planted: a room whose floor has a pure white patch is a room-blown-out finding; a pale floor, or white on the wall, is not', () => {
    const found = judge('room:grown-place-10/main-room:3', patchRoom).filter((f) => f.id === 'world.room-blown-out')
    expect(found).toHaveLength(1)
    expect(found[0]!.severity).toBe('major')
    expect(found[0]!.what).toContain('pure white')
    expect(judge('room:grown-place-10/main-room:3', paleRoom).map((f) => f.id)).not.toContain('world.room-blown-out')
    expect(judge('room:grown-place-10/main-room:3', cardOnWall).map((f) => f.id)).not.toContain('world.room-blown-out')
    // Outside a room the check does not run.
    expect(judge('place-front:grown-place-10', patchRoom).map((f) => f.id)).not.toContain('world.room-blown-out')
  })

  it('a room both washed out and with a white patch is one finding, not two', () => {
    const both = png(60, 40, (x, y) => (y < 30 ? [197, 193, 192] : x >= 30 ? [255, 255, 255] : PALE_FLOOR))
    expect(judge('room:home/main:1', both).filter((f) => f.id === 'world.room-blown-out')).toHaveLength(1)
  })

  it('has a level that is a share of the floor', () => {
    expect(PICTURE_LEVELS.roomFloorWhite).toBeGreaterThan(0)
    expect(PICTURE_LEVELS.roomFloorWhite).toBeLessThan(0.1)
  })
})
