import { describe, expect, it } from 'vitest'
import { geometryFindings, type GeometryInput } from '../../src/world/geometry.ts'
import type { SceneObject } from '../../src/world/open.ts'

/**
 * The construction site (issues 329, 331): a place being built is wireframe inside too, and its sign names it and says it is being
 * built. Planted: a furnished room in a wire shell, a sign that says nothing of the building, and a building place with no sign.
 */
const NOW = Date.parse('2026-11-26T13:00:00Z')
const o = (id: string, kind: SceneObject['kind'], min: [number, number, number], max: [number, number, number], extra: Partial<SceneObject> = {}): SceneObject => ({ id, kind, box: { min, max }, visible: true, material: 'solid', ...extra })
const building = { construction: { kind: 'expand', finishesAt: '2026-11-27T12:00:00Z' }, closed: null }

/** One place being built, drawn right: wire outside and in, its sign naming it and saying how long is left. */
function site(): GeometryInput {
  return {
    fixture: 'test',
    now: NOW,
    places: [{ id: 'lab', name: 'Lamp Lab', exterior: { sign: 'LAMPS', footprint: [8, 8] }, state: building }] as never,
    works: [],
    scene: [
      o('lab', 'place', [-4, 0, -4], [4, 4, 4], { material: 'wireframe' }),
      o('lab/main', 'room', [-3.5, 0, -3.5], [3.5, 3, 3.5], { place: 'lab', material: 'wireframe' }),
      o('lab/sign', 'sign', [2, 0.9, 5], [4.6, 2.1, 5], { place: 'lab', text: 'Lamp Lab Building · ready in about 23 h' }),
      o('merge', 'merge', [0, 0, 8], [0.5, 0.9, 9]),
    ],
    ground: () => ({ y: 0, chunk: 'owned' }),
    start: { eye: [0, 1.6, 25], yaw: Math.PI, pitch: 0, aspect: 1.6 },
  }
}

const ids = (input: GeometryInput) => geometryFindings(input).map((f) => f.fingerprint)

describe('the construction site checks', () => {
  it('find nothing at a site drawn right', () => {
    expect(geometryFindings(site())).toEqual([])
  })

  it('planted: a finished, furnished room standing inside the wire shell is a major finding', () => {
    const w = site()
    w.scene[1] = { ...w.scene[1]!, material: 'solid' }
    const found = geometryFindings(w).find((f) => f.fingerprint === 'world.wireframe-state|test|lab/main')
    expect(found?.severity).toBe('major')
  })

  it('planted: the sign of a place being built says nothing of it', () => {
    const w = site()
    w.scene[2] = { ...w.scene[2]!, text: 'Lamp Lab LAMPS' }
    expect(ids(w)).toContain('world.site-sign|test|lab')
  })

  it('planted: a place being built with no sign at all', () => {
    const w = site()
    w.scene.splice(2, 1)
    expect(ids(w)).toContain('world.site-sign|test|lab')
  })

  it('planted: a sign that does not name the place being built', () => {
    const w = site()
    w.scene[2] = { ...w.scene[2]!, text: 'Building · ready in about 23 h' }
    expect(ids(w)).toContain('world.site-sign|test|lab')
  })
})
