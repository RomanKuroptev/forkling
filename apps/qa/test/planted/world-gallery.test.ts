import { describe, expect, it } from 'vitest'
import type { SceneObject } from '../../src/world/open.ts'
import { galleryFindings } from '../../src/world/gallery.ts'

const tile = (work: string, extra: Partial<SceneObject> = {}): SceneObject => ({ id: `workshop/all-works/${work}`, kind: 'work', place: 'workshop', ref: `works/${work}`, exhibitKind: 'gallery', slot: 'gallery-wall', box: { min: [0, 1.5, 0], max: [0.8, 2.1, 0.01] }, visible: true, material: 'solid', shows: 'picture', ...extra })

describe('gallery wall tiles show their works (issues 291, 307; audit QW.2)', () => {
  it('find nothing when every tile shows a picture or a title', () => {
    expect(galleryFindings('test', [tile('a'), tile('b', { shows: 'title' })])).toEqual([])
  })

  it('planted: a wall of plain tiles is one major look finding for the wall', () => {
    const found = galleryFindings('test', [tile('a', { shows: 'nothing' }), tile('b', { shows: 'nothing' }), tile('c')])
    expect(found.map((f) => f.fingerprint)).toEqual(['world.gallery-blank|test|workshop/all-works'])
    expect(found[0]).toMatchObject({ severity: 'major', fixKind: 'look', where: 'places/workshop.json' })
    expect(found[0]!.what).toContain('2 tiles')
  })

  it('planted: a viewer that does not say what a tile shows counts as blank', () => {
    const silent = tile('old')
    delete silent.shows
    expect(galleryFindings('test', [silent]).map((f) => f.fingerprint)).toEqual(['world.gallery-blank|test|workshop/all-works'])
  })

  it('leaves alone a wall that is not drawn now and works on screens', () => {
    expect(galleryFindings('test', [tile('far', { visible: false, shows: 'nothing' }), tile('screen', { slot: 'screen', shows: 'nothing' })])).toEqual([])
  })
})
