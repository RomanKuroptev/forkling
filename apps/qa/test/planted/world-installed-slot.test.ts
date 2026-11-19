import { describe, expect, it } from 'vitest'
import { geometryFindings, type GeometryInput } from '../../src/world/geometry.ts'
import type { SceneObject } from '../../src/world/open.ts'

const o = (id: string, kind: SceneObject['kind'], extra: Partial<SceneObject> = {}): SceneObject => ({ id, kind, box: { min: [7, 1, -4], max: [8, 1.5, -3.9] }, visible: true, material: 'solid', ...extra })

/** One shelved work whose file says it hangs on the Workshop's first screen, and the scene entries given. */
function world(scene: SceneObject[]): GeometryInput {
  return {
    fixture: 'test',
    now: Date.parse('2026-11-26T13:00:00Z'),
    places: [],
    works: [{ id: 'w1', status: 'shelf', installedIn: 'workshop/bench/4/0' }] as never,
    scene,
    ground: () => ({ y: 0, chunk: 'owned' }),
    start: { eye: [0, 1.6, 25], yaw: Math.PI, pitch: 0, aspect: 1.6 },
  }
}
const found = (scene: SceneObject[]) => geometryFindings(world(scene)).map((f) => f.fingerprint)
const tile = o('workshop/all-works/w1', 'work', { place: 'workshop', ref: 'works/w1', exhibitKind: 'gallery', slot: 'gallery-wall', shows: 'picture' })

describe('a work is installed where its file says, not just somewhere with its ref (issue 307 follow-up)', () => {
  it('planted: a work on the gallery wall but not on its screen is not installed', () => {
    expect(found([tile])).toContain('world.work-not-installed|test|w1')
  })

  it('planted: a work on another slot of the same place is not installed', () => {
    expect(found([tile, o('workshop/screen-w1', 'work', { place: 'workshop', ref: 'works/w1', slot: 'screen', at: 'workshop/bench/5/0' })])).toContain('world.work-not-installed|test|w1')
  })

  it('a work on its own slot is installed, and its tile on the wall still counts it as shown', () => {
    const f = found([tile, o('workshop/screen-w1', 'work', { place: 'workshop', ref: 'works/w1', slot: 'screen', at: 'workshop/bench/4/0' })])
    expect(f).not.toContain('world.work-not-installed|test|w1')
    expect(f.some((x) => x.startsWith('world.work-shown'))).toBe(false)
  })

  it('a work only on the wall still counts as shown', () => {
    expect(found([tile]).some((x) => x.startsWith('world.work-shown'))).toBe(false)
  })
})
