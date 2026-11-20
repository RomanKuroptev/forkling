import { describe, expect, it } from 'vitest'
import type { SceneObject } from '../../src/world/open.ts'
import { insideWallsFindings } from '../../src/world/inside-walls.ts'

const o = (id: string, kind: SceneObject['kind'], min: [number, number, number], max: [number, number, number], extra: Partial<SceneObject> = {}): SceneObject => ({ id, kind, place: 'home', box: { min, max }, visible: true, material: 'solid', ...extra })

/** Home on day-7: a 12 by 10 footprint from (2, 11) to (14, 21). Its outer 0.8 m is wall; the wall's outer face is 0.2 m in. */
const clean = (): SceneObject[] => [
  o('home', 'place', [1, 0, 10], [15, 4.5, 22], { place: undefined, footprint: { x0: 2, z0: 11, x1: 14, z1: 21 } }),
  o('home/main', 'room', [3, 0, 12], [13, 3.2, 20]),
  o('home/main/4', 'part', [12.4, 0, 15.8], [12.8, 2.2, 17.2], { name: 'shelf-tall' }),
  o('home/tidalcycles-saying', 'exhibit', [12.5, 0.4, 16], [12.7, 0.7, 16.4], { at: 'home/main/4/0' }),
  // A wall's own piece (a window part) stands in the wall line: it belongs there.
  o('home/main/11', 'part', [5, 1, 11.28], [6, 2, 11.52], { name: 'window-small' }),
  o('workshop', 'place', [20, 0, 10], [30, 4, 20], { place: undefined }),
]

describe('nothing pokes through an outer wall, and every room with exhibits has a way in (issues 339, 373; audit QW.2)', () => {
  it('find nothing in a house whose furniture and rooms stand inside its walls', () => {
    expect(insideWallsFindings('test', clean())).toEqual([])
  })

  it("planted: Tiny Patch's screen poking out of Home's back wall is a major look finding", () => {
    const found = insideWallsFindings('test', [...clean(), o('home/counter-room/1', 'part', [13.05, 1.2, 11.1], [13.95, 2, 11.3], { name: 'screen-small' }), o('home/screen-tiny-patch-mostly-empty', 'work', [13.1, 1.3, 11.05], [13.9, 1.9, 11.15], { at: 'home/counter-room/1/0', slot: 'screen' })])
    expect(found.map((f) => f.fingerprint).sort()).toEqual(['world.through-wall|test|home/counter-room/1', 'world.through-wall|test|home/screen-tiny-patch-mostly-empty'])
    expect(found[0]).toMatchObject({ severity: 'major', fixKind: 'look', where: 'places/home.json' })
    expect(found.find((f) => f.fingerprint.endsWith('/1'))!.what).toContain('screen-small')
  })

  it('a part that only reaches into the wall, not through it, is not a finding (it is hidden, not leaking)', () => {
    expect(insideWallsFindings('test', [...clean(), o('home/main/9', 'part', [13.2, 0, 15], [13.7, 1, 15.5], { name: 'plinth' })])).toEqual([])
  })

  it("planted: Home's 1 m Counter Room in the wall ring, with an exhibit in it, is a room no one can walk into", () => {
    const counter = o('home/counter-room', 'room', [13, 0, 11], [14, 3.2, 21])
    const found = insideWallsFindings('test', [...clean(), counter, o('home/skateboard', 'exhibit', [13.3, 1, 18], [13.6, 1.3, 18.1], { at: 'home/counter-room/2/0' })])
    expect(found.map((f) => f.fingerprint)).toEqual(['world.room-no-way-in|test|home/counter-room'])
    expect(found[0]).toMatchObject({ severity: 'minor', fixKind: 'data', where: 'places/home.json' })
    expect(found[0]!.what).toContain('home/skateboard')
    // The same room holding nothing is not a finding: nobody misses an empty corner.
    expect(insideWallsFindings('test', [...clean(), counter])).toEqual([])
    // Nor is it once its things stand out of the wall, in the house beside it, where a visitor sees and reaches them.
    expect(insideWallsFindings('test', [...clean(), counter, o('home/skateboard', 'exhibit', [12.95, 1, 18], [13.25, 1.3, 18.1], { at: 'home/counter-room/2/0' })])).toEqual([])
  })

  it('leaves alone a place the viewer gave no footprint, and things not drawn now', () => {
    expect(insideWallsFindings('test', [...clean(), o('workshop/main/0', 'part', [19, 0, 10], [21, 1, 11], { place: 'workshop', name: 'desk' })])).toEqual([])
    expect(insideWallsFindings('test', [...clean(), o('home/main/8', 'part', [7, 0, 10.5], [8, 1, 11.5], { name: 'desk', visible: false })])).toEqual([])
  })
})
