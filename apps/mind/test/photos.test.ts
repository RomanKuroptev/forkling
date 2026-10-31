import { describe, expect, it } from 'vitest'
import { MAX_PHOTOS_PER_DAY, MindState, WorldObject, type PhotoShot } from '@forkling/schema'
import { enqueueShot, noticedSubject, photosLeft, shotIdFor } from '../src/photos.ts'

const today = '2026-11-03'
const shot = (id: string): PhotoShot => ({ id, at: '2026-11-03T10:00:00Z', eye: [0, 0.2, 0], look: [1, 0.5, 1], why: 'photograph', reason: 'Nice.' })
const object = (id: string, x: number, z: number): WorldObject =>
  WorldObject.parse({ id, kind: 'rock', name: id, position: [x, 0, z], model: { parts: [{ shape: 'box', size: [1, 1, 1], at: [0, 0, 0], color: '#888888' }] }, reason: 'A rock.' })

describe('photosLeft', () => {
  it('has the whole day to spend when nothing was taken', () => {
    expect(photosLeft(MindState.parse({}), today)).toBe(MAX_PHOTOS_PER_DAY)
  })

  it('counts what was taken today', () => {
    expect(photosLeft(MindState.parse({ photos: { date: today, count: 5, queue: [] } }), today)).toBe(MAX_PHOTOS_PER_DAY - 5)
  })

  it('starts again on a new day', () => {
    expect(photosLeft(MindState.parse({ photos: { date: '2026-11-02', count: MAX_PHOTOS_PER_DAY, queue: [] } }), today)).toBe(MAX_PHOTOS_PER_DAY)
  })
})

describe('enqueueShot', () => {
  it('counts the frame and keeps the shot for the renderer', () => {
    const photos = enqueueShot(MindState.parse({}), shot('pond'), today)!
    expect(photos).toMatchObject({ date: today, count: 1 })
    expect(photos.queue.map((s) => s.id)).toEqual(['pond'])
  })

  it('adds to the queue already waiting today', () => {
    const state = MindState.parse({ photos: { date: today, count: 1, queue: [shot('a')] } })
    const photos = enqueueShot(state, shot('b'), today)!
    expect(photos.count).toBe(2)
    expect(photos.queue.map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('drops yesterday\'s count and leftover queue', () => {
    const state = MindState.parse({ photos: { date: '2026-11-02', count: 9, queue: [shot('old')] } })
    const photos = enqueueShot(state, shot('new'), today)!
    expect(photos).toMatchObject({ date: today, count: 1 })
    expect(photos.queue.map((s) => s.id)).toEqual(['new'])
  })

  it('refuses the frame after the daily limit', () => {
    const state = MindState.parse({ photos: { date: today, count: MAX_PHOTOS_PER_DAY, queue: [] } })
    expect(enqueueShot(state, shot('late'), today)).toBeNull()
  })
})

describe('shotIdFor', () => {
  it('names the frame after its subject, or the view', () => {
    expect(shotIdFor('water-bowl', new Set())).toBe('water-bowl')
    expect(shotIdFor(undefined, new Set())).toBe('view')
  })

  it('never reuses an id', () => {
    expect(shotIdFor('pond', new Set(['pond', 'pond-2']))).toBe('pond-3')
  })

  it('keeps ids to what a file name and an artifact id allow', () => {
    expect(shotIdFor('Weird Name!', new Set())).toBe('weird-name')
  })
})

describe('noticedSubject', () => {
  const objects = [object('near', 3, 0), object('far', 40, 0), object('known', 1, 0), object('nearer', 2, 0)]
  const base = { objects, known: new Set(['known']), pos: { x: 0, z: 0 }, range: 12 }

  it('picks the nearest thing it has not met, within sight', () => {
    expect(noticedSubject(base)?.id).toBe('nearer')
  })

  it('ignores things it has already met and things too far away', () => {
    expect(noticedSubject({ ...base, known: new Set(['known', 'near', 'nearer']) })).toBeNull()
  })

  it('is null when there is nothing new', () => {
    expect(noticedSubject({ ...base, known: new Set(objects.map((o) => o.id)) })).toBeNull()
  })

  it('ignores things it holds', () => {
    const held = WorldObject.parse({ ...object('held', 0.5, 0), state: { held: true } })
    expect(noticedSubject({ ...base, objects: [held], known: new Set() })).toBeNull()
  })
})

describe('the prompt about seeing', () => {
  it('tells the mind a photograph is a picture through its own eyes, with no topic to set', async () => {
    const { buildSystem } = await import('../src/prompts.ts')
    const { loadSpecies } = await import('../src/species.ts')
    const cat = loadSpecies('cat')
    const system = buildSystem({ pack: cat.pack, name: 'Merge', speciesPersona: cat.persona, persona: '' })
    const line = system.split('\n').find((l) => l.startsWith('- photograph:'))!
    expect(line).toContain('takes a picture through your own eyes')
    expect(line).not.toContain('set topic')
    expect(system).toContain('about twelve a day')
  })
})
