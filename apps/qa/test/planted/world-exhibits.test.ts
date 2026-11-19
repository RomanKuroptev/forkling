import { describe, expect, it } from 'vitest'
import { exhibitFindings } from '../../src/world/exhibits.ts'
import type { SceneObject } from '../../src/world/open.ts'

const entry = (id: string, extra: Partial<SceneObject> = {}): SceneObject => ({ id, kind: 'exhibit', place: id.split('/')[0]!, box: null, visible: true, material: 'solid', ...extra })

describe('no exhibit is a blank box (issues 347, 355)', () => {
  it('passes when every exhibit card shows words or a picture, and leaves the work screens to their own check', () => {
    const scene = [
      entry('home/quote', { exhibitKind: 'souvenir', card: { shows: 'text', text: 'Canopy (botany) · Leaf area index is a key measure.' } }),
      entry('home/image', { exhibitKind: 'souvenir', card: { shows: 'picture', text: '' } }),
      entry('workshop/plaque', { exhibitKind: 'plaque', card: { shows: 'title', text: 'On sand' } }),
      entry('workshop/a-work', { kind: 'work', exhibitKind: 'work' }),
      entry('workshop/a-project', { exhibitKind: 'project' }),
      entry('home', { kind: 'place' }),
    ]
    expect(exhibitFindings(scene, 'day-7')).toEqual([])
  })

  it('planted: a souvenir drawn with no card (the blank pink box) and a card with no words are each a major look finding', () => {
    const scene = [entry('home/canopy-botany-note', { exhibitKind: 'souvenir', name: 'How leaves stack' }), entry('home/sensor', { exhibitKind: 'souvenir', card: { shows: 'nothing', text: '' } }), entry('home/empty-words', { exhibitKind: 'souvenir', card: { shows: 'text', text: '  ' } })]
    const found = exhibitFindings(scene, 'day-7')
    expect(found.map((f) => f.fingerprint)).toEqual(['world.exhibit-blank|day-7|home/canopy-botany-note', 'world.exhibit-blank|day-7|home/sensor', 'world.exhibit-blank|day-7|home/empty-words'])
    expect(found.every((f) => f.severity === 'major' && f.fixKind === 'look' && f.where === 'places/home.json')).toBe(true)
    expect(found[0]!.what).toContain('no card')
  })
})
