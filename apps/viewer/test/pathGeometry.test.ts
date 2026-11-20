import { createLand, toLandPlace } from '@forkling/sim'
import { makeFixtureWorld } from '@forkling/sim/fixture'
import { describe, expect, it } from 'vitest'
import { landMesh } from '../src/world/landGeometry.ts'
import { drawnHeightAt, drawnPaths, groundOf, pathRibbon, type DrawnGround } from '../src/world/pathGeometry.ts'
import type { IndexedMesh } from '../src/world/landGeometry.ts'

type P = readonly [number, number]

/** The triangles of a mesh, in x, z with their heights. */
function triangles(mesh: IndexedMesh) {
  const v = (i: number) => [mesh.positions[i * 3]!, mesh.positions[i * 3 + 1]!, mesh.positions[i * 3 + 2]!] as const
  type V = readonly [number, number, number]
  const out: [V, V, V][] = []
  for (let t = 0; t < mesh.indices.length; t += 3) out.push([v(mesh.indices[t]!), v(mesh.indices[t + 1]!), v(mesh.indices[t + 2]!)])
  return out
}

/** The highest drawn height of the mesh over a point, or null when no triangle covers it. */
function topAt(mesh: IndexedMesh, x: number, z: number): number | null {
  let top: number | null = null
  for (const [a, b, c] of triangles(mesh)) {
    const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2])
    if (Math.abs(d) < 1e-12) continue
    const l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d
    const l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d
    const l3 = 1 - l1 - l2
    if (l1 < -1e-7 || l2 < -1e-7 || l3 < -1e-7) continue
    const y = l1 * a[1] + l2 * b[1] + l3 * c[1]
    top = top === null ? y : Math.max(top, y)
  }
  return top
}

const flat: DrawnGround = { step: 2, vertexHeight: () => 2 }
/** A bumpy ground: every grid vertex at its own height, so a straight track across it would cut through the bumps. */
const bumpy: DrawnGround = { step: 2, vertexHeight: (x, z) => Math.sin(x * 1.7) * 0.6 + Math.cos(z * 2.3) * 0.5 + ((Math.round(x) * 7 + Math.round(z) * 13) % 5) * 0.15 }

describe('the drawn ground (the same triangles as the land mesh)', () => {
  it('is the vertex height on the grid, and agrees with the land mesh between the vertices', () => {
    expect(drawnHeightAt(bumpy, 4, 6)).toBeCloseTo(bumpy.vertexHeight(4, 6), 9)
    const land = createLand(3, makeFixtureWorld(3, 4).places.map(toLandPlace))
    const ground = groundOf(land, 16)
    const mesh = landMesh(land, 16)
    const [x0, z0] = [mesh.positions[0]!, mesh.positions[2]!]
    for (let k = 0; k < 40; k++) {
      const x = x0 + 0.37 + k * 0.71
      const z = z0 + 0.53 + ((k * 1.13) % 20)
      expect(drawnHeightAt(ground, x, z), `${x},${z}`).toBeCloseTo(topAt(mesh, x, z)!, 6)
    }
  })
})

describe('a path drawn on the ground (spec 4.3: a 3 meter track; issues 428, 433)', () => {
  it('lies flat a little above flat ground, 3 meters wide, end to end', () => {
    const mesh = pathRibbon([[0, 0], [32, 0]], flat, { width: 3, lift: 0.05 })
    expect(mesh.indices.length).toBeGreaterThan(0)
    for (let i = 0; i < mesh.positions.length; i += 3) {
      expect(mesh.positions[i + 1]!).toBeCloseTo(2.05, 6)
      expect(Math.abs(mesh.positions[i + 2]!)).toBeLessThanOrEqual(1.5 + 1e-9)
    }
    const xs = Array.from({ length: mesh.positions.length / 3 }, (_, k) => mesh.positions[k * 3]!)
    expect(Math.min(...xs)).toBeCloseTo(0, 9)
    expect(Math.max(...xs)).toBeCloseTo(32, 9)
  })

  it('has no hole and the ground never shows through it, however bumpy the ground', () => {
    const line: P[] = [[0.3, 0.2], [13.7, 5.1], [13.7, 19.4], [-4.2, 25.9]]
    const mesh = pathRibbon(line, bumpy, { lift: 0.05 })
    for (let s = 1; s < line.length; s++) {
      const [a, b] = [line[s - 1]!, line[s]!]
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      const [dx, dz] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len]
      for (let t = 0; t <= len; t += 0.25) {
        for (const off of [-1.4, -0.7, 0, 0.7, 1.4]) {
          const x = a[0] + dx * t + dz * off
          const z = a[1] + dz * t - dx * off
          const top = topAt(mesh, x, z)
          expect(top, `a hole at ${x.toFixed(2)},${z.toFixed(2)}`).not.toBeNull()
          expect(top! - drawnHeightAt(bumpy, x, z), `the ground over the path at ${x.toFixed(2)},${z.toFixed(2)}`).toBeCloseTo(0.05, 6)
        }
      }
    }
  })

  it('leaves no gap at the outside of a bend', () => {
    const mesh = pathRibbon([[0, 0], [10, 0], [10, 10]], flat, { width: 3 })
    for (const [x, z] of [[10.4, -0.4], [11, -1], [11.4, -1.4], [10.2, -1.3], [11.3, -0.2]] as const) expect(topAt(mesh, x, z), `${x},${z}`).not.toBeNull()
  })

  it('faces up everywhere', () => {
    for (const [a, b, c] of triangles(pathRibbon([[0, 0], [10, 0], [10, 10], [-3, 4]], bumpy))) {
      const e1 = [b[0] - a[0], b[2] - a[2]]
      const e2 = [c[0] - a[0], c[2] - a[2]]
      expect(e1[1]! * e2[0]! - e1[0]! * e2[1]!).toBeGreaterThan(0)
    }
  })

  it('is cut exactly at a building: nothing inside it, everything up to its wall', () => {
    const hole = { x0: 10, x1: 20, z0: -5, z1: 5 }
    const mesh = pathRibbon([[0, 0], [32, 0]], flat, { holes: [hole] })
    for (const tri of triangles(mesh)) {
      const cx = (tri[0]![0] + tri[1]![0] + tri[2]![0]) / 3
      expect(cx > 10 && cx < 20).toBe(false)
    }
    for (const x of [9.99, 20.01, 5, 25]) expect(topAt(mesh, x, 0.3), String(x)).not.toBeNull()
    expect(pathRibbon([[0, 0], [32, 0]], flat, { holes: [{ x0: -10, x1: 40, z0: -10, z1: 10 }] }).indices.length).toBe(0)
  })

  it('is empty for a path of one point', () => {
    expect(pathRibbon([[0, 0]], flat).indices.length).toBe(0)
    expect(pathRibbon([], flat).indices.length).toBe(0)
  })
})

describe('the paths of a world as the viewer draws them', () => {
  it('joins Home and the Workshop, which share a chunk, with a yard path (issue 434)', () => {
    const fixture = makeFixtureWorld(1, 3)
    const places = fixture.places
    const drawn = drawnPaths(places, createLand(1, places.map(toLandPlace)))
    const ends = drawn.map((p) => [p.from, p.to].sort().join('|'))
    expect(ends).toContain('home|workshop')
    for (const p of drawn) expect(p.mesh.indices.length, `${p.from}>${p.to}`).toBeGreaterThan(0)
  })
})
