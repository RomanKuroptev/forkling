import { describe, expect, it } from 'vitest'
import { CHUNK_SIZE, createLand, toLandPlace } from '@forkling/sim'
import { makeFixtureWorld } from '@forkling/sim/fixture'
import { fogWalls, visibleChunks } from '../src/world/landGeometry.ts'
import { MIST_FADE_FAR, MIST_FADE_NEAR, mistColor, mistFade, mistPuffs } from '../src/world/mistGeometry.ts'
import { contrast } from '../src/world/signGeometry.ts'

const fixture = makeFixtureWorld(1, 10)
const land = createLand(1, fixture.places.map(toLandPlace))
const puffs = mistPuffs(land)
const walls = fogWalls(land)

/** The fog colours the environment sets: day, dusk and night (`Environment.tsx`). */
const DAY = '#bcd7e6'
const DUSK = '#e9a77c'
const NIGHT = '#1a2c52'

describe('the mist at the world\'s edge: soft puffs, not panels', () => {
  it('has puffs along every fog side, at least one for every 8 m of it', () => {
    const length = walls.reduce((n, w) => n + w.length, 0)
    expect(puffs.length).toBeGreaterThanOrEqual(Math.floor(length / 8))
    for (let wall = 0; wall < walls.length; wall++) expect(puffs.some((p) => p.wall === wall), `wall ${wall}`).toBe(true)
  })

  it('keeps every puff over drawn land or just beyond its edge, never out in the void', () => {
    const drawn = visibleChunks(land).map((c) => c.chunk)
    for (const p of puffs) {
      const near = drawn.some(([cx, cz]) => {
        const dx = Math.max(cx * CHUNK_SIZE - p.x, 0, p.x - (cx + 1) * CHUNK_SIZE)
        const dz = Math.max(cz * CHUNK_SIZE - p.z, 0, p.z - (cz + 1) * CHUNK_SIZE)
        return Math.hypot(dx, dz) <= 4
      })
      expect(near, `${p.x.toFixed(1)},${p.z.toFixed(1)}`).toBe(true)
    }
  })

  it('floats above the ground (a puff never sits in it) and no higher than 40 m over it', () => {
    for (const p of puffs) {
      const ground = land.heightAt(p.x, p.z)
      expect(p.y - ground, 'clear of the ground').toBeGreaterThanOrEqual(p.size * 0.3)
      expect(p.y - ground, 'not in the clouds').toBeLessThanOrEqual(40)
    }
  })

  it('is big and faint, so many overlap into a bank: sizes 14 to 26 m, opacity under 0.8 each', () => {
    for (const p of puffs) {
      expect(p.size).toBeGreaterThanOrEqual(14)
      expect(p.size).toBeLessThanOrEqual(26)
      expect(p.alpha).toBeGreaterThan(0.05)
      expect(p.alpha).toBeLessThan(0.8)
    }
  })

  it('is thicker towards the edge: the outer layer of a side is more opaque than its innermost', () => {
    const mean = (inset: number) => {
      const ofInset = puffs.filter((p) => walls[p.wall]!.inset === inset)
      return ofInset.reduce((n, p) => n + p.alpha, 0) / ofInset.length
    }
    const insets = [...new Set(walls.map((w) => w.inset))].sort((a, b) => a - b)
    expect(mean(insets[0]!)).toBeGreaterThan(mean(insets.at(-1)!))
  })

  it('does not lie in a plane: along most sides the puffs differ in depth and in height', () => {
    let loose = 0
    walls.forEach((wall, i) => {
      const own = puffs.filter((p) => p.wall === i)
      const across = own.map((p) => (wall.rotY === 0 ? p.z - wall.z : p.x - wall.x))
      const heights = own.map((p) => p.y - land.heightAt(p.x, p.z))
      if (Math.max(...across) - Math.min(...across) >= 2 && Math.max(...heights) - Math.min(...heights) >= 3) loose++
    })
    expect(loose / walls.length).toBeGreaterThanOrEqual(0.9)
  })

  it('is the same every time, and each puff is somewhere of its own', () => {
    expect(JSON.stringify(mistPuffs(land))).toBe(JSON.stringify(puffs))
    expect(new Set(puffs.map((p) => `${p.x.toFixed(2)},${p.z.toFixed(2)}`)).size).toBe(puffs.length)
  })

  it('is empty when nothing faces fog', () => {
    expect(mistPuffs(createLand(1, []))).toEqual([])
  })
})

describe('the mist fades out near the camera, so it never fills the screen', () => {
  it('is gone at the camera and whole by 12 m, rising smoothly between', () => {
    expect(mistFade(0)).toBe(0)
    expect(mistFade(MIST_FADE_NEAR)).toBe(0)
    expect(mistFade(MIST_FADE_FAR)).toBe(1)
    expect(mistFade(100)).toBe(1)
    let last = 0
    for (let d = 0; d <= 16; d += 0.5) {
      expect(mistFade(d)).toBeGreaterThanOrEqual(last)
      last = mistFade(d)
    }
  })
})

describe('the colour of the mist', () => {
  it('stands out from the sky at night (contrast at least 2.5), where a mist the colour of the fog would vanish', () => {
    expect(contrast(mistColor(NIGHT), NIGHT)).toBeGreaterThanOrEqual(2.5)
  })

  it('stays a little apart from the sky at dusk and by day, soft rather than stark', () => {
    expect(contrast(mistColor(DUSK), DUSK)).toBeGreaterThanOrEqual(1.1)
    expect(contrast(mistColor(DAY), DAY)).toBeGreaterThanOrEqual(1.1)
    expect(contrast(mistColor(DAY), DAY)).toBeLessThan(2)
  })

  it('is never the colour of the fog itself, and is lighter than it', () => {
    for (const fog of [DAY, DUSK, NIGHT, '#8896b0']) {
      expect(mistColor(fog)).not.toBe(fog)
      expect(contrast('#000000', mistColor(fog))).toBeGreaterThan(contrast('#000000', fog))
    }
  })
})
