import { describe, expect, it } from 'vitest'
import { chunkAt, chunkCentre, createLand, toLandPlace } from '@forkling/sim'
import { makeFixtureWorld } from '@forkling/sim/fixture'
import { fogWalls, landMesh, pathRibbon, visibleChunks } from '../src/world/landGeometry.ts'

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

describe('a path drawn on the ground (spec 4.3: a 3 meter track)', () => {
  const flat = () => 2
  it('is a strip 3 meters wide along the line, a little above the ground', () => {
    const ribbon = pathRibbon([[0, 0], [32, 0]], flat, { width: 3, step: 2, lift: 0.05 })
    expect(ribbon.indices.length).toBe(16 * 6)
    for (let i = 0; i < ribbon.positions.length; i += 3) {
      expect(ribbon.positions[i + 1]!).toBeCloseTo(2.05, 6)
      expect(Math.abs(ribbon.positions[i + 2]!)).toBeCloseTo(1.5, 6)
    }
    const xs = [...new Set(Array.from({ length: ribbon.positions.length / 3 }, (_, k) => ribbon.positions[k * 3]!))].sort((a, b) => a - b)
    expect(xs[0]).toBe(0)
    expect(xs.at(-1)).toBe(32)
  })
  it('follows the ground height', () => {
    const slope = (x: number) => x * 0.1
    const ribbon = pathRibbon([[0, 0], [20, 0]], (x) => slope(x), { step: 2 })
    for (let i = 0; i < ribbon.positions.length; i += 3) expect(ribbon.positions[i + 1]!).toBeCloseTo(slope(ribbon.positions[i]!) + 0.05, 6)
  })
  it('turns corners', () => {
    const ribbon = pathRibbon([[0, 0], [10, 0], [10, 10]], flat, { step: 2 })
    expect(ribbon.indices.length).toBe(10 * 6)
  })
  it('leaves out the stretches inside a building', () => {
    const ribbon = pathRibbon([[0, 0], [32, 0]], flat, { step: 2, skip: (x) => x > 10 && x < 20 })
    expect(ribbon.indices.length).toBe(11 * 6)
    expect(pathRibbon([[0, 0], [32, 0]], flat, { step: 2, skip: () => true }).indices.length).toBe(0)
  })
  it('is empty for a path of one point', () => {
    expect(pathRibbon([[0, 0]], flat).indices.length).toBe(0)
    expect(pathRibbon([], flat).indices.length).toBe(0)
  })
})
