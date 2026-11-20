import { describe, expect, it } from 'vitest'
import { pathFindings, type DrawnPathMesh, type PathPlace } from '../../src/world/paths.ts'

// Planted paths for the three path checks (issues 428, 433, 434). Two places, Home and the Hillside Room, 30 m apart, joined by a
// straight path along x = 0 from z 5 (Home's door) to z 25 (the Hillside Room's door); the ground is flat at 0 unless planted.

const home: PathPlace = { id: 'home', chunk: [0, 0], x0: -5, x1: 5, z0: -5, z1: 5 }
const hill: PathPlace = { id: 'hill', chunk: [0, 1], x0: -5, x1: 5, z0: 25, z1: 35 }
const workshop: PathPlace = { id: 'workshop', chunk: [0, 0], x0: 10, x1: 20, z0: -5, z1: 5 }

/** A flat strip from z0 to z1, 3 m wide along x = 0, at height y, cut into 1 m squares (two triangles each, facing up). */
function strip(from: string, to: string, z0: number, z1: number, y = 0.05, leaveOut: (z: number) => boolean = () => false): DrawnPathMesh {
  const positions: number[] = []
  const indices: number[] = []
  for (let z = z0; z < z1; z++) {
    if (leaveOut(z)) continue
    const b = positions.length / 3
    positions.push(-1.5, y, z, 1.5, y, z, -1.5, y, z + 1, 1.5, y, z + 1)
    indices.push(b, b + 2, b + 1, b + 1, b + 2, b + 3)
  }
  return { from, to, kind: 'founding', line: [[0, z0], [0, z1]], positions, indices }
}

const flat = () => 0

describe('the path checks (QW.2)', () => {
  it('finds nothing for a whole path lying above the ground, between two places', () => {
    expect(pathFindings('test', { places: [home, hill], paths: [strip('hill', 'home', 5, 25)] }, flat)).toEqual([])
  })

  it('finds a hole in the path (issue 433)', () => {
    const found = pathFindings('test', { places: [home, hill], paths: [strip('hill', 'home', 5, 25, 0.05, (z) => z === 18)] }, flat)
    expect(found.map((f) => f.fingerprint)).toEqual(['world.path-hole|test|hill+home'])
    expect(found[0]!.what).toContain('z 18')
  })

  it('finds the ground poking up through the path on a rise (issue 428)', () => {
    const bump = (x: number, z: number) => (Math.abs(z - 12) < 1 && Math.abs(x) < 1 ? 0.2 : 0)
    const found = pathFindings('test', { places: [home, hill], paths: [strip('hill', 'home', 5, 25)] }, bump)
    expect(found.map((f) => f.fingerprint)).toEqual(['world.ground-over-path|test|hill+home'])
    expect(found[0]!.what).toContain('0.15 m above the path')
  })

  it('finds a path lying in the ground, flickering with it', () => {
    const found = pathFindings('test', { places: [home, hill], paths: [strip('hill', 'home', 5, 25, 0.002)] }, flat)
    expect(found.map((f) => f.id)).toEqual(['world.ground-over-path'])
  })

  it('finds a place no path leads to, and says it shares a chunk (issue 434)', () => {
    const found = pathFindings('test', { places: [home, hill, workshop], paths: [strip('hill', 'home', 5, 25)] }, flat)
    expect(found.map((f) => f.fingerprint)).toEqual(['world.place-no-path|test|workshop'])
    expect(found[0]!.what).toContain('shares its chunk 0, 0 with home')
  })

  it('finds a path that is listed but not drawn, and a place joined only to a place cut off from Home', () => {
    const empty: DrawnPathMesh = { ...strip('hill', 'home', 5, 25), positions: [], indices: [] }
    const found = pathFindings('test', { places: [home, hill], paths: [empty] }, flat)
    expect(found.map((f) => f.id).sort()).toEqual(['world.path-hole', 'world.place-no-path'])
  })

  it('does not count the inside of a building, or a world of one place', () => {
    // The path runs on into Home's footprint, where nothing is drawn; that is the building's floor, not a hole.
    const into = { ...strip('hill', 'home', 5, 25), line: [[0, -3], [0, 25]] as [number, number][] }
    expect(pathFindings('test', { places: [home, hill], paths: [into] }, flat)).toEqual([])
    expect(pathFindings('test', { places: [home], paths: [] }, flat)).toEqual([])
  })
})
