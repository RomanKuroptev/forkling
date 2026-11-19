import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { wallBand } from '../../src/world/picture.ts'
import { judgeShot } from '../../src/world/pictures.ts'

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
const ids = (name: string, p: PNG, ctx: { night?: boolean; wall?: string }) =>
  judgeShot({ name, png: PNG.sync.write(p) }, { fixture: 'planted', night: ctx.night ?? false, file: 'x.png', ...(ctx.wall ? { wall: ctx.wall } : {}) }).map((f) => f.id)

// A room at noon: a lilac ceiling, the walls across the middle with a blue window in them, a pale floor.
const room = (wall: RGB) => png(40, 40, (x, y) => (y < 12 ? [170, 150, 230] : y < 30 ? (x >= 10 && x < 16 ? [100, 190, 230] : wall) : [230, 220, 240]))
const SLATE = '#c9c6ff'
const MEADOW = '#eaffd6'

describe('the walls of a room by day against the palette wall (#405 final look review)', () => {
  it('reads the walls from the middle band, with a window in front of them counting for little', () => {
    const band = wallBand(room([200, 196, 250]))
    expect(band.value).toBeGreaterThan(0.95)
    expect(band.saturation).toBeGreaterThan(0.18)
  })

  it('planted: the grey-mauve Workshop of #405 (passed the mean light check, still dim) is a finding against slate', () => {
    // A grey-mauve back wall, as in after-3 of the second try: light enough on average, but much darker and greyer than slate.
    expect(ids('room:workshop/bench-room:n', room([150, 140, 165]), { wall: SLATE })).toContain('world.room-wall-colour')
  })

  it('planted: Home before #405, grey-white walls in a meadow place, is a finding (greyer than the palette wall)', () => {
    expect(ids('room:home/main:n', room([197, 193, 192]), { wall: MEADOW })).toContain('world.room-wall-colour')
  })

  it('passes pastel walls near the palette wall, and does not run at night, outside a room, or without a wall colour', () => {
    expect(ids('room:workshop/bench-room:n', room([187, 182, 243]), { wall: SLATE })).not.toContain('world.room-wall-colour')
    expect(ids('room:home/main:n', room([245, 184, 210]), { wall: MEADOW })).not.toContain('world.room-wall-colour')
    expect(ids('room:workshop/bench-room:n', room([60, 50, 90]), { wall: SLATE, night: true })).not.toContain('world.room-wall-colour')
    expect(ids('place-front:workshop', room([150, 140, 165]), { wall: SLATE })).not.toContain('world.room-wall-colour')
    expect(ids('room:workshop/bench-room:n', room([150, 140, 165]), {})).not.toContain('world.room-wall-colour')
  })
})
