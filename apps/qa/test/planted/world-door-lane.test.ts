import { describe, expect, it } from 'vitest'
import type { SceneObject } from '../../src/world/open.ts'
import { doorLaneFindings } from '../../src/world/door-lane.ts'

const o = (id: string, kind: SceneObject['kind'], min: [number, number, number], max: [number, number, number], extra: Partial<SceneObject> = {}): SceneObject => ({ id, kind, place: 'home', box: { min, max }, visible: true, material: 'solid', ...extra })

/** Home as drawn on the live world: its doorway at x 6.75 to 9.25, its main room from z 12 to 20 (middle z 16). */
const clean = (): SceneObject[] => [
  o('home', 'place', [2, 0, 11], [14, 4, 21]),
  o('home/door', 'door', [6.75, 0.15, 19.8], [9.25, 2.2, 21], { material: 'none' }),
  o('home/main', 'room', [3, 0, 12], [13, 3.2, 20]),
  o('home/main/0', 'part', [4.7, 0, 12.4], [6.3, 0.8, 13.2], { name: 'desk' }),
  o('home/main/5', 'part', [7, 0, 16], [9, 0.03, 18], { name: 'rug-round' }),
  // The bench drawn aside, out of the way in.
  o('home/main/9', 'part', [9.35, 0, 18.75], [10.95, 0.5, 19.25], { name: 'bench' }),
  o('home/main/8', 'part', [7.4, 1.6, 19.86], [8.6, 2.5, 19.94], { name: 'frame-large', visible: false, material: 'none', inDoorway: { holds: [] } }),
]

describe('a clear walk from the door to the middle of the room (issue 451; audit QW.2)', () => {
  it('finds nothing when the way in is clear: a rug on it is walked over, a bench beside it is not in the way', () => {
    expect(doorLaneFindings('test', clean())).toEqual([])
  })

  it("planted: Home's bench square across the way in a step inside the door, as the live world had it, is a major look finding", () => {
    const scene = clean().map((x) => (x.id === 'home/main/9' ? { ...x, box: { min: [7.2, 0, 18.75] as [number, number, number], max: [8.8, 0.5, 19.25] as [number, number, number] } } : x))
    const found = doorLaneFindings('test', scene)
    expect(found.map((f) => f.fingerprint)).toEqual(['world.door-lane|test|home/main/9'])
    expect(found[0]).toMatchObject({ severity: 'major', fixKind: 'look' })
    expect(found[0]!.what).toContain('bench')
  })

  it('planted: a table near the middle of the room, in line with the door, blocks the walk too; one beyond the middle does not', () => {
    const near = doorLaneFindings('test', [...clean(), o('home/main/10', 'part', [7.5, 0, 16.2], [8.5, 0.75, 17], { name: 'table' })])
    expect(near.map((f) => f.fingerprint)).toEqual(['world.door-lane|test|home/main/10'])
    expect(doorLaneFindings('test', [...clean(), o('home/main/10', 'part', [7.5, 0, 14], [8.5, 0.75, 15.5], { name: 'table' })])).toEqual([])
  })

  it('leaves out a place drawn as wire (being built): its walls are lines, nothing stops a walk there', () => {
    const scene = [...clean().map((x) => (x.id === 'home' ? { ...x, material: 'wireframe' as const } : x)), o('home/main/10', 'part', [7.5, 0, 17], [8.5, 0.75, 18], { name: 'table' })]
    expect(doorLaneFindings('test', scene)).toEqual([])
  })
})
