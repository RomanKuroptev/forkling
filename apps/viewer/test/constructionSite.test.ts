import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Place, type Souvenir } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { makeFixtureWorld } from '@forkling/sim/fixture'
import { describe, expect, it } from 'vitest'
import { cardFaces, cardShows } from '../src/world/exhibitCards.ts'
import { exhibitInstances, exhibitSpots, SIGN_BOTTOM, signSpot } from '../src/world/exhibitGeometry.ts'
import { interiorParts, sceneInstances, signPostInstances } from '../src/world/kitGeometry.ts'
import { settledPlace } from '../src/world/insideWalls.ts'
import { WIREFRAME } from '../src/world/theme.ts'
import { wireframeInstances } from '../src/world/wireframe.ts'

/** The construction site, second pass (issues 426, 427, 330): no solid exhibit in the wire, a sign on its posts, every line once. */
const NOW = Date.parse('2026-11-26T13:00:00Z')
const building = (p: Place, style = p.exterior.style): Place => ({ ...p, exterior: { ...p.exterior, style }, state: { ...p.state, construction: { kind: 'expand', finishesAt: '2026-11-27T13:00:00Z' } } })
const hillside = settledPlace(Place.parse(JSON.parse(readFileSync(fileURLToPath(new URL('../../../test/fixtures/worlds/building/places/hillside-room-five-lamps.json', import.meta.url)), 'utf8'))), kit)
const withExhibits = makeFixtureWorld(1, 10).places.find((p) => p.exhibits.length > 0)!

type V = [number, number, number]
const ends = (m: ArrayLike<number>): [V, V] => [
  [m[12]! - m[0]! / 2, m[13]! - m[1]! / 2, m[14]! - m[2]! / 2],
  [m[12]! + m[0]! / 2, m[13]! + m[1]! / 2, m[14]! + m[2]! / 2],
]

/** Pairs of lines that run side by side closer than `gap` along more than `along` of their length: one edge drawn twice. */
function doubled(lines: [V, V][], gap = 0.05, along = 0.05): string[] {
  const out: string[] = []
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const [a, b] = lines[i]!
      const [c, d] = lines[j]!
      const u: V = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
      const v: V = [d[0] - c[0], d[1] - c[1], d[2] - c[2]]
      const lu = Math.hypot(...u)
      const lv = Math.hypot(...v)
      if (lu < 1e-6 || lv < 1e-6) continue
      const dir: V = [u[0] / lu, u[1] / lu, u[2] / lu]
      if (Math.abs((dir[0] * v[0] + dir[1] * v[1] + dir[2] * v[2]) / lv) < 0.999) continue
      const t = (p: V) => (p[0] - a[0]) * dir[0] + (p[1] - a[1]) * dir[1] + (p[2] - a[2]) * dir[2]
      const off = (p: V) => Math.hypot(p[0] - a[0] - t(p) * dir[0], p[1] - a[1] - t(p) * dir[1], p[2] - a[2] - t(p) * dir[2])
      const overlap = Math.min(lu, Math.max(t(c), t(d))) - Math.max(0, Math.min(t(c), t(d)))
      if (overlap > along && Math.max(off(c), off(d)) < gap) out.push(`${a.map((n) => n.toFixed(2))} along ${c.map((n) => n.toFixed(2))}`)
    }
  }
  return out
}

/** The wire of a place being built with its inside drawn, as the scene draws it. */
const wireOf = (p: Place) => {
  const inside = [...interiorParts(p, kit, 0).instances, ...exhibitSpots(p, kit, 0).flatMap((s) => exhibitInstances(s, kit.palettes[0]!.colors))]
  return wireframeInstances(p, kit, 0, NOW, false, inside)!.map((l) => ends(l.matrix))
}

describe('every edge of the wire is drawn once (issue 330)', () => {
  it('no two lines of the building fixture run side by side closer than 5 cm', () => {
    expect(doubled(wireOf(building(hillside)))).toEqual([])
  })

  it('nor in any style, inside and out', () => {
    for (const style of kit.styles) expect(doubled(wireOf(building(withExhibits, style.id))), style.id).toEqual([])
  })

  it('a wall drawn twice, its inner and outer face a wall thickness apart, is one set of lines', () => {
    const near = doubled(wireOf(building(hillside)), 0.26, 0.5)
    expect(near).toEqual([])
  })
})

describe('the site sign stands on its posts (issue 427)', () => {
  it('a place being built draws the sign post solid: two posts on the ground up to the board', () => {
    const p = building(hillside)
    const scene = sceneInstances([p], kit, { heightAt: () => 0, interiors: new Set(), nowMs: NOW })
    const [sx, , sz] = signSpot(p, 0).position
    const posts: [V, V][] = []
    for (let k = 0; k < scene.box.count; k++) {
      const m = [...scene.box.matrices.slice(k * 16, k * 16 + 16)]
      const h = Math.hypot(m[4]!, m[5]!, m[6]!)
      const [x, y, z] = [m[12]!, m[13]!, m[14]!]
      if (Math.abs(z - sz) < 0.3 && Math.abs(x - sx) < 1.5 && y - h / 2 < 0.02 && y + h / 2 >= SIGN_BOTTOM) posts.push([[x, y - h / 2, z], [x, y + h / 2, z]])
    }
    expect(posts.length).toBeGreaterThanOrEqual(2)
    expect(signPostInstances(p, kit, 0).length).toBeGreaterThanOrEqual(2)
  })
})

describe('no solid exhibit inside a place being built (issue 426)', () => {
  it('its exhibits are cyan lines, not solid pieces: the only solid things at the site are its sign and posts', () => {
    const p = building(withExhibits)
    const scene = sceneInstances([p], kit, { heightAt: () => 0, interiors: new Set([p.id]), nowMs: NOW })
    const cyan = WIREFRAME.pole
    const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    const want = [1, 3, 5].map((k) => Math.round(lin(Number.parseInt(cyan.slice(k, k + 2), 16) / 255) * 1000))
    let solid = 0
    for (const shape of ['box', 'sphere', 'cylinder', 'cone'] as const) {
      const s = scene[shape]
      for (let k = 0; k < s.count; k++) if ([0, 1, 2].some((c) => Math.round(s.colors[k * 3 + c]! * 1000) !== want[c])) solid++
    }
    expect(solid).toBe(signPostInstances(p, kit, 0).length)
  })

  it('their cards are drawn as wire: words only, no picture, until it is done', () => {
    const p = building(hillside)
    const image: Souvenir = { id: 'x', kind: 'image', content: 'https://upload.wikimedia.org/a.jpg', licence: 'CC BY-SA', credit: 'A. Person', why: 'w', topics: [], source: { url: 'https://en.wikipedia.org/wiki/A', title: 'A', fetchedAt: '2026-11-13T06:25:44.992Z' }, placedIn: p.id }
    const souvenirs = new Map(p.exhibits.map((e) => [e.ref!, image]))
    const spots = exhibitSpots(p, kit, 0)
    const wire = cardFaces(spots, souvenirs, 0, new Set([p.id]))
    expect(wire.length).toBe(3)
    for (const f of wire) {
      expect(f.content.wire).toBe(true)
      expect(f.content.picture).toBeNull()
      expect(cardShows(f.content).shows).not.toBe('picture')
      expect(cardShows(f.content).text).not.toBe('')
    }
    // Finished, the same cards show their pictures.
    for (const f of cardFaces(spots, souvenirs, 0)) {
      expect(f.content.wire).toBeFalsy()
      expect(f.content.shows).toBe('picture')
    }
  })
})
