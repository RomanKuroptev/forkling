import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { middleLight } from '../../src/world/picture.ts'
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
const ids = (name: string, p: PNG, night: boolean) => judgeShot({ name, png: PNG.sync.write(p) }, { fixture: 'planted', night, file: 'x.png' }).map((f) => f.id)

// A room at noon as #405's look review saw the Workshop: a bright lilac ceiling and floor, and dull dark violet walls (105, 85, 135)
// in the middle of the picture.
const room = (wall: RGB) => png(40, 40, (_x, y) => (y < 12 ? [190, 170, 240] : y < 30 ? wall : [225, 215, 240]))
const dim = room([105, 85, 135])
const lilac = room([190, 160, 230])

describe('a room that is dim by day (#405 look review)', () => {
  it('measures the light of the middle band, where the walls are', () => {
    expect(middleLight(dim)).toBeLessThan(PICTURE_LEVELS.roomDayMiddle)
    expect(middleLight(lilac)).toBeGreaterThan(PICTURE_LEVELS.roomDayMiddle)
  })

  it('planted: a dim room by day is a finding; a lilac one is not; at night and outside a room the check does not run', () => {
    expect(ids('room:workshop/bench-room:n', dim, false)).toContain('world.room-too-dark')
    expect(ids('room:workshop/bench-room:n', lilac, false)).not.toContain('world.room-too-dark')
    expect(ids('room:workshop/bench-room:n', dim, true)).not.toContain('world.room-too-dark')
    expect(ids('place-front:workshop', dim, false)).not.toContain('world.room-too-dark')
  })
})
