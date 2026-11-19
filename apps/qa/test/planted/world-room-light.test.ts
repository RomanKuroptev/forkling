import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { muddyShare, nearWhiteShare } from '../../src/world/picture.ts'
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
const shot = (name: string, p: PNG) => ({ name, png: PNG.sync.write(p) })
const ids = (name: string, p: PNG, night: boolean) => judgeShot(shot(name, p), { fixture: 'planted', night, file: 'x.png' }).map((f) => f.id)

// A room as issue 358 saw it: grey-white walls (197, 193, 192) over most of the picture, a pink floor below.
const blownRoom = png(40, 30, (_x, y) => (y < 20 ? [197, 193, 192] : [236, 188, 230]))
// The same room with coloured walls: a pink from the palette's trim, a lilac floor.
const colouredRoom = png(40, 30, (_x, y) => (y < 20 ? [230, 150, 210] : [200, 170, 240]))
// Night as issue 361 saw it: khaki walls (138, 149, 136) and brown trim (147, 92, 45), over a purple sky.
const muddyNight = png(40, 30, (_x, y) => (y < 8 ? [40, 20, 90] : y < 10 ? [147, 92, 45] : [138, 149, 136]))
// Night in the look: deep purple, lilac walls lit by warm lamps, a pink glow.
const goodNight = png(40, 30, (_x, y) => (y < 8 ? [40, 20, 90] : y < 20 ? [150, 110, 200] : [255, 154, 216]))

describe('room light and night colour (issues 358, 361)', () => {
  it('measures near white and muddy shares', () => {
    expect(nearWhiteShare(blownRoom)).toBeGreaterThan(0.6)
    expect(nearWhiteShare(colouredRoom)).toBe(0)
    expect(muddyShare(muddyNight)).toBeGreaterThan(0.7)
    expect(muddyShare(goodNight)).toBe(0)
    // Bright orange and lemon are look colours, not mud.
    expect(muddyShare(png(10, 10, (x) => (x < 5 ? [255, 159, 67] : [255, 242, 122])))).toBe(0)
  })

  it('planted: a washed-out room is a finding; a coloured room is not; outside a room the check does not run', () => {
    expect(ids('room:home/main:n', blownRoom, false)).toContain('world.room-blown-out')
    expect(ids('room:home/main:n', colouredRoom, false)).not.toContain('world.room-blown-out')
    expect(ids('place-front:home', blownRoom, false)).not.toContain('world.room-blown-out')
  })

  it('planted: a brown and khaki night picture is a finding; a lilac and pink one is not; by day the check does not run', () => {
    expect(ids('room:home/main:n', muddyNight, true)).toContain('world.night-muddy')
    expect(ids('room:home/main:n', goodNight, true)).not.toContain('world.night-muddy')
    expect(ids('room:home/main:n', muddyNight, false)).not.toContain('world.night-muddy')
  })

  it('has levels that are shares of the picture', () => {
    expect(PICTURE_LEVELS.roomNearWhite).toBeGreaterThan(0)
    expect(PICTURE_LEVELS.roomNearWhite).toBeLessThan(1)
    expect(PICTURE_LEVELS.nightMuddy).toBeGreaterThan(0)
    expect(PICTURE_LEVELS.nightMuddy).toBeLessThan(1)
  })
})
