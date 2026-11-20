import { describe, expect, it } from 'vitest'
import type { SceneObject } from '../../src/world/open.ts'
import { screenHeightFindings } from '../../src/world/screens.ts'

/** The Workshop on day-7: its bench room's floor is at y -1.9 (the land under it). */
const room = (): SceneObject => ({ id: 'workshop/bench-room', kind: 'room', place: 'workshop', box: { min: [19, -1.9, 11], max: [29, 1.6, 19] }, visible: true, material: 'solid' })
const screen = (id: string, low: number, extra: Partial<SceneObject> = {}): SceneObject => ({ id, kind: 'work', place: 'workshop', ref: `works/${id.split('/')[1]}`, exhibitKind: 'work', slot: 'screen', at: 'workshop/bench-room/4/0', box: { min: [20, low, 19.3], max: [20.8, low + 0.5, 19.33] }, visible: true, material: 'solid', shows: 'picture', ...extra })

describe('a work screen hangs at eye height (issue 431; audit QW.2)', () => {
  it('finds nothing when every screen panel is at least 1.1 m above its floor', () => {
    // Panel centre 1.5 m up: 1.25 to 1.75 above the floor at -1.9.
    expect(screenHeightFindings('test', [room(), screen('workshop/a', -0.65), screen('workshop/b', -1.9 + 0.85, { exhibitKind: 'project' })])).toEqual([])
  })

  it('planted: a work screen on a floor-standing monitor at knee height is a major look finding', () => {
    // The kit screen on the floor: its panel from 0.25 to 0.75 m up, centre 0.5 m.
    const found = screenHeightFindings('test', [room(), screen('workshop/a', -0.65), screen('workshop/knee', -1.9 + 0.25)])
    expect(found.map((f) => f.fingerprint)).toEqual(['world.screen-low|test|workshop/knee'])
    expect(found[0]).toMatchObject({ severity: 'major', fixKind: 'look', where: 'places/workshop.json' })
    expect(found[0]!.what).toContain('0.50 m')
  })

  it('leaves alone screens not drawn now, souvenirs, framed works, gallery tiles and screens whose room is not listed', () => {
    const low = -1.9 + 0.25
    expect(
      screenHeightFindings('test', [
        room(),
        screen('workshop/far', low, { visible: false }),
        screen('workshop/keep', low, { kind: 'exhibit', exhibitKind: 'souvenir' }),
        screen('workshop/framed', low, { slot: 'frame' }),
        screen('workshop/tile', low, { slot: 'gallery-wall', at: undefined }),
        screen('workshop/lost', low, { at: 'workshop/gone-room/1/0' }),
      ]),
    ).toEqual([])
  })
})
