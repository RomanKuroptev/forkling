import { describe, expect, it } from 'vitest'
import type { SceneObject } from '../../src/world/open.ts'
import { doorwayFindings } from '../../src/world/doorway.ts'

const o = (id: string, kind: SceneObject['kind'], min: [number, number, number], max: [number, number, number], extra: Partial<SceneObject> = {}): SceneObject => ({ id, kind, place: 'home', box: { min, max }, visible: true, material: 'solid', ...extra })

/** Home's doorway at x 6.75 to 9.25, from just above the floor to the lintel, through the front wall and a step in. */
const door = o('home/door', 'door', [6.75, 0.15, 19.8], [9.25, 2.2, 21], { material: 'none' })
const clean = (): SceneObject[] => [
  door,
  o('home', 'place', [1, 0, 11], [15, 4, 21]),
  o('home/main', 'room', [3, 0, 12], [13, 3.2, 20]),
  o('home/main/0', 'part', [4.5, 0, 12.5], [6.5, 0.8, 13.5], { name: 'desk' }),
  o('home/main/5', 'part', [7, 0, 16], [9, 0.03, 18], { name: 'rug-round' }),
  o('home/main/9', 'part', [7.2, 0, 18.75], [8.8, 0.5, 19.25], { name: 'bench' }),
  o('home/sign', 'sign', [10.2, 0.9, 22.3], [12.2, 2.1, 22.3], { text: 'Home' }),
  o('home/title', 'label', [5, 2.7, 21.1], [9, 3.3, 21.1], { text: 'HOME' }),
  o('merge', 'merge', [7.8, 0, 20], [8.3, 0.5, 20.6], { place: undefined }),
]

describe('nothing stands in a doorway (issues 342, 345, 354; audit QW.2)', () => {
  it('find nothing when the doorway is clear, with Merge walking through and a bench beside it', () => {
    expect(doorwayFindings('test', clean())).toEqual([])
  })

  it("planted: a frame hung over the door, as in Home's, is a major look finding", () => {
    const found = doorwayFindings('test', [...clean(), o('home/main/8', 'part', [7.4, 1.6, 19.86], [8.6, 2.5, 19.94], { name: 'frame-large' })])
    expect(found.map((f) => f.fingerprint)).toEqual(['world.in-doorway|test|home/main/8'])
    expect(found[0]).toMatchObject({ severity: 'major', fixKind: 'look', where: 'places/home.json' })
    expect(found[0]!.what).toContain('frame-large')
  })

  it("planted: a door leaf standing in the gap, as in the Hillside Room's, and an exhibit in it", () => {
    const found = doorwayFindings('test', [...clean(), o('home/main/4', 'part', [7.4, 0, 20.2], [8.6, 2.2, 20.5], { name: 'door-wood' }), o('home/in-the-door', 'exhibit', [7.8, 1.9, 19.9], [8.2, 2.1, 19.95])])
    expect(found.map((f) => f.fingerprint).sort()).toEqual(['world.in-doorway|test|home/in-the-door', 'world.in-doorway|test|home/main/4'])
  })

  it('leaves alone a part that is not drawn now', () => {
    expect(doorwayFindings('test', [...clean(), o('home/main/8', 'part', [7.4, 1.6, 19.86], [8.6, 2.5, 19.94], { visible: false })])).toEqual([])
  })

  it('planted: a part left out of a doorway that holds an exhibit is a minor data finding; one that holds nothing is not', () => {
    const hidden = (holds: string[]) => o('home/main/8', 'part', [7.4, 1.6, 19.86], [8.6, 2.5, 19.94], { name: 'frame-large', visible: false, material: 'none', inDoorway: { holds } })
    expect(doorwayFindings('test', [...clean(), hidden([])])).toEqual([])
    const found = doorwayFindings('test', [...clean(), hidden(['canopy-note'])])
    expect(found.map((f) => f.fingerprint)).toEqual(['world.in-doorway-holds|test|home/main/8'])
    expect(found[0]).toMatchObject({ severity: 'minor', fixKind: 'data', where: 'places/home.json' })
    expect(found[0]!.what).toContain('canopy-note')
  })
})
