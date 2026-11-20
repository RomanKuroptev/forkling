import { describe, expect, it } from 'vitest'
import { geometryFindings, type GeometryInput } from '../../src/world/geometry.ts'
import type { SceneObject } from '../../src/world/open.ts'

const o = (id: string, kind: SceneObject['kind'], min: [number, number, number], max: [number, number, number], extra: Partial<SceneObject> = {}): SceneObject => ({ id, kind, box: { min, max }, visible: true, material: 'solid', ...extra })

const world = (merge: SceneObject): GeometryInput => ({
  fixture: 'test',
  now: Date.parse('2026-11-26T13:00:00Z'),
  places: [],
  works: [],
  scene: [merge],
  ground: () => ({ y: 0, chunk: 'owned' }),
  start: { eye: [0, 1.6, 25], yaw: Math.PI, pitch: 0, aspect: 1.6 },
})
const ids = (merge: SceneObject) => geometryFindings(world(merge)).map((f) => f.fingerprint)

describe("Merge's body is drawn opaque (issue 455, audit QW.2)", () => {
  it('planted: a body with a see-through material is a major finding', () => {
    const found = geometryFindings(world(o('merge', 'merge', [0, 0, 8], [0.5, 0.9, 9], { material: 'glass' })))
    const f = found.find((x) => x.id === 'world.merge-see-through')
    expect(f?.severity).toBe('major')
    expect(f?.fingerprint).toBe('world.merge-see-through|test|merge')
  })

  it('passes a solid body', () => {
    expect(ids(o('merge', 'merge', [0, 0, 8], [0.5, 0.9, 9]))).not.toContain('world.merge-see-through|test|merge')
  })
})
