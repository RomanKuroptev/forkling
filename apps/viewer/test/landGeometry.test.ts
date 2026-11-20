import { describe, expect, it } from 'vitest'
import { chunkAt, chunkCentre, createLand, toLandPlace } from '@forkling/sim'
import { makeFixtureWorld } from '@forkling/sim/fixture'
import { fogWalls, LAND_LIP, LAND_SEGMENTS, LAND_SIDE_DEPTH, landLip, landMesh, landSides, visibleChunks } from '../src/world/landGeometry.ts'

const fixture = makeFixtureWorld(1, 10)
const land = createLand(1, fixture.places.map(toLandPlace))
const single = createLand(1, [fixture.places[0]!].map(toLandPlace).map((p) => ({ ...p, offset: [0, 0] as [number, number] })))

describe('which chunks are drawn (spec 4.1: owned and edge chunks, never the fog)', () => {
  it('is one owned chunk and the 8 around it for a world of one place', () => {
    const chunks = visibleChunks(single)
    expect(chunks).toHaveLength(9)
    expect(chunks.filter((c) => c.owned)).toHaveLength(1)
  })
  it('never includes a fog chunk, and marks owned ones', () => {
    for (const c of visibleChunks(land)) expect(land.classify(c.chunk) === 'owned', JSON.stringify(c.chunk)).toBe(c.owned)
    for (const c of visibleChunks(land)) expect(land.classify(c.chunk)).not.toBe('fog')
  })
})

describe('the terrain mesh', () => {
  const mesh = landMesh(land, 4)
  const chunks = visibleChunks(land).length

  it('has a grid of triangles per chunk, with vertices on the land\'s own heights', () => {
    expect(mesh.indices.length).toBe(chunks * 4 * 4 * 6)
    expect(mesh.positions.length).toBe(chunks * 5 * 5 * 3)
    for (let i = 0; i < mesh.positions.length; i += 3 * 37) {
      expect(mesh.positions[i + 1]!).toBeCloseTo(land.heightAt(mesh.positions[i]!, mesh.positions[i + 2]!), 4)
    }
  })

  it('keeps every vertex inside a drawn chunk, and indices inside the vertex list', () => {
    const drawn = new Set(visibleChunks(land).map((c) => c.chunk.join(',')))
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const x = mesh.positions[i]!
      const z = mesh.positions[i + 2]!
      // On an edge or a corner the vertex belongs to up to four chunks; at least one of them must be drawn.
      const touching = [-1e-4, 1e-4].flatMap((dx) => [-1e-4, 1e-4].map((dz) => chunkAt(x + dx, z + dz).join(',')))
      expect(touching.some((c) => drawn.has(c)), `${x},${z}`).toBe(true)
    }
    expect(Math.max(...mesh.indices)).toBeLessThan(mesh.positions.length / 3)
  })

  it('has no seam: the vertices that two neighbouring chunks share are at the same height', () => {
    const byXZ = new Map<string, number>()
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const key = `${mesh.positions[i]!.toFixed(3)},${mesh.positions[i + 2]!.toFixed(3)}`
      const y = mesh.positions[i + 1]!
      if (byXZ.has(key)) expect(byXZ.get(key)!).toBeCloseTo(y, 6)
      byXZ.set(key, y)
    }
    expect(byXZ.size).toBeLessThan(mesh.positions.length / 3)
  })
})

describe('the fog at the world\'s edge', () => {
  const edgeOnly = (l: Parameters<typeof fogWalls>[0]) => fogWalls(l).filter((w) => w.inset === 0)
  it('stands on every side of a drawn chunk that faces fog: 12 sides for a world of one place, in 4 layers each', () => {
    expect(edgeOnly(single)).toHaveLength(12)
    expect(fogWalls(single)).toHaveLength(12 * 4)
  })
  it('thickens inward: each layer is further into the edge chunk, so the ground fades into the fog and does not end in a line', () => {
    const insets = [...new Set(fogWalls(single).map((w) => w.inset))].sort((a, b) => a - b)
    expect(insets).toHaveLength(4)
    expect(insets[0]).toBe(0)
    expect(insets.at(-1)!).toBeLessThan(32)
    for (const wall of fogWalls(land).filter((w) => w.inset > 0)) {
      // Both sides of an inner layer are the same drawn chunk: it is inside the edge chunk, not past it.
      const nx = wall.rotY === 0 ? 0 : 1
      const nz = wall.rotY === 0 ? 1 : 0
      const a = chunkAt(wall.x + nx, wall.z + nz)
      const b = chunkAt(wall.x - nx, wall.z - nz)
      expect(a.join(',')).toBe(b.join(','))
      expect(land.classify(a)).not.toBe('fog')
    }
  })
  it('stands exactly between a drawn chunk and a fog chunk, along the chunk edge', () => {
    for (const wall of edgeOnly(land)) {
      const nx = wall.rotY === 0 ? 0 : 1
      const nz = wall.rotY === 0 ? 1 : 0
      const a = chunkAt(wall.x + nx * 1, wall.z + nz * 1)
      const b = chunkAt(wall.x - nx * 1, wall.z - nz * 1)
      const classes = [land.classify(a), land.classify(b)].sort()
      expect(classes, JSON.stringify(wall)).toContain('fog')
      expect(classes.some((c) => c !== 'fog')).toBe(true)
      expect(wall.length).toBe(32)
    }
  })
  it('has no wall between two drawn chunks', () => {
    const walls = fogWalls(land).filter((w) => w.inset === 0)
    const keys = new Set(walls.map((w) => `${w.x},${w.z},${w.rotY}`))
    expect(keys.size).toBe(walls.length)
    for (const c of visibleChunks(land)) {
      const [cx, cz] = chunkCentre(c.chunk)
      for (const [dx, dz, rot] of [[16, 0, 1], [-16, 0, 1], [0, 16, 0], [0, -16, 0]] as const) {
        const neighbour = chunkAt(cx + dx * 2, cz + dz * 2)
        const faces = land.classify(neighbour)
        expect(keys.has(`${cx + dx},${cz + dz},${rot === 1 ? Math.PI / 2 : 0}`), `${c.chunk} ${dx},${dz}`).toBe(faces === 'fog')
      }
    }
  })
})

describe('the side of the land (issue 454: the walk stops at the end of the land, so the end must show)', () => {
  const sides = landSides(land)
  const tris = sides.positions.length / 9
  const at = (m: { positions: Float32Array }, k: number) => [m.positions[k * 3]!, m.positions[k * 3 + 1]!, m.positions[k * 3 + 2]!] as const

  it('is drawn: triangles with a tone for each vertex, a bright band at the top and the side under it', () => {
    expect(tris).toBeGreaterThan(0)
    expect(sides.tone.length).toBe(sides.positions.length / 3)
    expect(new Set(sides.tone)).toEqual(new Set([0, 1]))
  })

  it('has a bright strip on top along the end, lifted off the ground and facing up, so it shows from where the walk stops', () => {
    const lip = landLip(land)
    expect(lip.length).toBeGreaterThan(0)
    for (let k = 0; k < lip.length / 3; k++) {
      const [x, y, z] = [lip[k * 3]!, lip[k * 3 + 1]!, lip[k * 3 + 2]!]
      expect(y).toBeGreaterThan(land.heightAt(x, z))
      const near = [-LAND_LIP.width - 0.01, LAND_LIP.width + 0.01].flatMap((dx) => [-LAND_LIP.width - 0.01, LAND_LIP.width + 0.01].map((dz) => land.classify(chunkAt(x + dx, z + dz))))
      expect(near, `${x},${z}`).toContain('fog')
    }
    for (let t = 0; t < lip.length / 9; t++) {
      const p = (k: number, c: number) => lip[t * 9 + k * 3 + c]!
      const ny = (p(1, 2) - p(0, 2)) * (p(2, 0) - p(0, 0)) - (p(1, 0) - p(0, 0)) * (p(2, 2) - p(0, 2))
      expect(ny, `triangle ${t}`).toBeGreaterThan(0)
    }
    // The visitor stops EDGE_MARGIN (1 m) in, so the strip is between the visitor and the end.
    expect(LAND_LIP.width).toBeLessThan(1)
  })

  it('stands where the walk stops: every vertex is on a border between a drawn chunk and the fog', () => {
    for (let k = 0; k < sides.positions.length / 3; k++) {
      const [x, , z] = at(sides, k)
      const near = [-0.5, 0.5].flatMap((dx) => [-0.5, 0.5].map((dz) => land.classify(chunkAt(x + dx, z + dz))))
      expect(near, `${x},${z}`).toContain('fog')
      expect(near.some((c) => c !== 'fog'), `${x},${z}`).toBe(true)
    }
  })

  it('meets the top of the land without a gap and reaches LAND_SIDE_DEPTH below it, so the land reads as a slab', () => {
    for (let k = 0; k < sides.positions.length / 3; k++) {
      const [x, y, z] = at(sides, k)
      expect(y).toBeLessThanOrEqual(land.heightAt(x, z) + 1e-4)
    }
    // Each triangle's top corner is on the land's own height, and its lowest at least LAND_SIDE_DEPTH under the edge's top.
    const tops = new Set<string>()
    for (let k = 0; k < sides.positions.length / 3; k++) {
      const [x, y, z] = at(sides, k)
      if (Math.abs(y - land.heightAt(x, z)) < 1e-4) tops.add(`${x},${z}`)
    }
    expect(tops.size).toBeGreaterThan(0)
    const ys = Array.from({ length: sides.positions.length / 3 }, (_, k) => at(sides, k)[1])
    expect(Math.min(...ys)).toBeLessThanOrEqual(Math.min(...[...tops].map((t) => land.heightAt(...(t.split(',').map(Number) as [number, number])))) - LAND_SIDE_DEPTH + 1e-4)
  })

  it('faces out, towards the fog, so it is seen from outside the land', () => {
    for (let t = 0; t < tris; t++) {
      const [a, b, c] = [at(sides, t * 3), at(sides, t * 3 + 1), at(sides, t * 3 + 2)]
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
      const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
      const nx = e1[1]! * e2[2]! - e1[2]! * e2[1]!
      const nz = e1[0]! * e2[1]! - e1[1]! * e2[0]!
      const len = Math.hypot(nx, nz)
      const mx = (a[0] + b[0] + c[0]) / 3
      const mz = (a[2] + b[2] + c[2]) / 3
      expect(land.classify(chunkAt(mx + (nx / len) * 0.5, mz + (nz / len) * 0.5)), `triangle ${t}`).toBe('fog')
      expect(land.classify(chunkAt(mx - (nx / len) * 0.5, mz - (nz / len) * 0.5)), `triangle ${t}`).not.toBe('fog')
    }
  })

  it('runs along every border that faces fog and no other: 12 for a world of one place', () => {
    const per = landSides(single).positions.length / 9 / LAND_SEGMENTS
    expect(per % 12).toBe(0)
    expect(landSides(single).positions.length / 9).toBe(12 * LAND_SEGMENTS * (per / 12))
    expect(fogWalls(single).filter((w) => w.inset === 0)).toHaveLength(12)
  })
})

// The paths on the ground are tested in pathGeometry.test.ts.

describe('a staked plot is drawn as land (W6 slice 8)', () => {
  it('is among the visible chunks, as edge land, when a request has staked it', () => {
    const home = { id: 'home', chunk: [0, 0] as [number, number], footprint: [12, 10] as [number, number], tags: ['home'] }
    const plain = visibleChunks(createLand(1, [home]))
    const withPlot = visibleChunks(createLand(1, [home], [[5, 5]]))
    expect(plain.some((v) => v.chunk[0] === 5 && v.chunk[1] === 5)).toBe(false)
    const plot = withPlot.find((v) => v.chunk[0] === 5 && v.chunk[1] === 5)
    expect(plot).toBeDefined()
    expect(plot!.owned).toBe(false)
    expect(withPlot.length).toBe(plain.length + 1)
  })

  it('is found even when it touches only another plot, outside the box round the places', () => {
    const home = { id: 'home', chunk: [0, 0] as [number, number], footprint: [12, 10] as [number, number], tags: ['home'] }
    const chain = visibleChunks(createLand(1, [home], [[1, 0], [2, 0], [3, 0]]))
    expect(chain.some((v) => v.chunk[0] === 3 && v.chunk[1] === 0)).toBe(true)
  })
})
