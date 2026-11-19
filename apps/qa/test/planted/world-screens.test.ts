import { describe, expect, it } from 'vitest'
import type { SceneObject } from '../../src/world/open.ts'
import { screenFindings } from '../../src/world/screens.ts'

const screen = (id: string, extra: Partial<SceneObject> = {}): SceneObject => ({ id, kind: 'work', place: 'workshop', ref: `works/${id.split('/')[1]}`, exhibitKind: 'work', slot: 'screen', box: { min: [0, 0.3, 0], max: [0.8, 0.8, 0.03] }, visible: true, material: 'solid', shows: 'picture', ...extra })

describe('work screens show their work (issues 352, 341, 362; audit QW.2)', () => {
  it('find nothing when every screen shows a picture or a title', () => {
    expect(screenFindings('test', [screen('workshop/a'), screen('workshop/b', { shows: 'title' })])).toEqual([])
  })

  it('planted: a work screen drawn as a plain coloured panel is a major look finding', () => {
    const found = screenFindings('test', [screen('workshop/a'), screen('workshop/blank', { shows: 'nothing' })])
    expect(found.map((f) => f.fingerprint)).toEqual(['world.screen-blank|test|workshop/blank'])
    expect(found[0]).toMatchObject({ severity: 'major', fixKind: 'look' })
  })

  it('planted: a viewer that does not say what a screen shows counts as a blank screen', () => {
    const blank = screen('workshop/old')
    delete blank.shows
    expect(screenFindings('test', [blank]).map((f) => f.fingerprint)).toEqual(['world.screen-blank|test|workshop/old'])
  })

  it('leaves alone a screen that is not drawn now, a souvenir and a work in a frame', () => {
    expect(screenFindings('test', [screen('workshop/far', { visible: false, shows: 'nothing' }), screen('home/keep', { kind: 'exhibit', exhibitKind: 'souvenir', slot: 'shelf', shows: undefined }), screen('home/framed', { slot: 'frame', shows: undefined })])).toEqual([])
  })
})
