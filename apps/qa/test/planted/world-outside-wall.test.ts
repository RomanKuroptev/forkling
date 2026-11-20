import { describe, expect, it } from 'vitest'
import { OUTSIDE_WALL_COLOUR, geometryFindings, type GeometryInput } from '../../src/world/geometry.ts'
import type { SceneObject } from '../../src/world/open.ts'

const place = (outsideWall?: string): SceneObject => ({ id: 'home', kind: 'place', box: { min: [-6, 0, -5], max: [6, 4, 5] }, visible: true, material: 'solid', ...(outsideWall ? { outsideWall } : {}) })
const world = (o: SceneObject): GeometryInput => ({
  fixture: 'test',
  now: Date.parse('2026-11-26T13:00:00Z'),
  places: [],
  works: [],
  scene: [o],
  ground: () => ({ y: 0, chunk: 'owned' }),
  start: { eye: [0, 1.6, 25], yaw: Math.PI, pitch: 0, aspect: 1.6 },
})
const ids = (o: SceneObject) => geometryFindings(world(o)).map((f) => f.fingerprint)

describe('outside walls keep their colour in shade (look.md rule 2, audit QW.2)', () => {
  it("planted: Home's near-white mint wall of v0.19.0 (#eaffd6, grey under the porch) is a finding", () => {
    const f = geometryFindings(world(place('#eaffd6'))).find((x) => x.id === 'world.outside-wall-grey')
    expect(f?.severity).toBe('major')
    expect(f?.fingerprint).toBe('world.outside-wall-grey|test|home')
  })

  it('planted: a cream wall, in the warm hues look.md rule 3 forbids, is a finding even with colour', () => {
    expect(ids(place('#ffe0a0'))).toContain('world.outside-wall-grey|test|home')
  })

  it('passes a cool pastel with colour enough, and a place with no listed wall (all chrome)', () => {
    expect(OUTSIDE_WALL_COLOUR).toBeGreaterThan(0.15)
    expect(ids(place('#f5b8d2'))).not.toContain('world.outside-wall-grey|test|home')
    expect(ids(place('#c9c6ff'))).not.toContain('world.outside-wall-grey|test|home')
    expect(ids(place())).not.toContain('world.outside-wall-grey|test|home')
  })
})
