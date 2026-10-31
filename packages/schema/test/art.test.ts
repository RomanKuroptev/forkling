import { describe, expect, it } from 'vitest'
import { Artifact, ARTIFACT_KINDS, ArtOutput, MAX_ARTIFACT_TEXT } from '../src/index.ts'

const base = { id: 'a-first-poem', title: 'First poem', skillLevel: 1, createdAt: '2026-11-03T15:00:00Z' }

describe('Artifact', () => {
  it('has a content shape for every kind', () => {
    const made = {
      writing: { text: 'The rock is warm.' },
      drawing: { svg: '<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="3"/></svg>' },
      melody: { bpm: 90, notes: [{ pitch: 'C4', beats: 1 }, { pitch: 'E4', beats: 0.5 }] },
      recipe: { ingredients: [{ name: 'produce', grams: 200 }], steps: ['Chop it.', 'Cook it.'] },
      broadcast: { script: 'Good evening, island.' },
      labnote: { question: 'Does clay float?', method: 'I dropped a cup in the pond.', result: 'It sank.' },
      photo: { image: 'photos/the-pond.jpg', caption: 'The pond at dusk.', opinion: 'Too wet, but pretty.', noticed: false },
      contraption: { objectId: 'marble-run', moved: true, maxTravel: 1.1, settled: true, notes: 'The marble rolled off the end.', opinion: 'Again.' },
      code: { project: 'gate-toy', idea: 'A toy of logic gates.', howItPlays: 'Click the switches.' },
    } as const
    expect(Object.keys(made).sort()).toEqual([...ARTIFACT_KINDS].sort())
    for (const kind of ARTIFACT_KINDS) expect(Artifact.safeParse({ ...base, kind, content: made[kind] }).success, kind).toBe(true)
  })

  it('rejects content that does not belong to its kind', () => {
    expect(Artifact.safeParse({ ...base, kind: 'melody', content: { text: 'hello' } }).success).toBe(false)
    expect(Artifact.safeParse({ ...base, kind: 'writing', content: { svg: '<svg/>' } }).success).toBe(false)
  })

  it('keeps the goal and the obsession it served', () => {
    const a = Artifact.parse({ ...base, kind: 'writing', content: { text: 'x' }, goalRef: 'today:2', obsessionRef: 'logic gates' })
    expect(a.goalRef).toBe('today:2')
    expect(a.obsessionRef).toBe('logic gates')
  })

  it('limits skill level to 0..10 and text to a sane length', () => {
    expect(Artifact.safeParse({ ...base, skillLevel: 11, kind: 'writing', content: { text: 'x' } }).success).toBe(false)
    expect(Artifact.safeParse({ ...base, kind: 'writing', content: { text: 'x'.repeat(MAX_ARTIFACT_TEXT + 1) } }).success).toBe(false)
  })

  it('keeps melodies short and their notes in range', () => {
    const notes = Array.from({ length: 65 }, () => ({ pitch: 'C4', beats: 1 }))
    expect(Artifact.safeParse({ ...base, kind: 'melody', content: { bpm: 90, notes } }).success).toBe(false)
    expect(Artifact.safeParse({ ...base, kind: 'melody', content: { bpm: 900, notes: [{ pitch: 'C4', beats: 1 }] } }).success).toBe(false)
    expect(Artifact.safeParse({ ...base, kind: 'melody', content: { bpm: 90, notes: [{ pitch: 'H9', beats: 1 }] } }).success).toBe(false)
  })
})

describe('ArtOutput', () => {
  it('is what the model returns for each kind: a title plus the content, flat', () => {
    expect(ArtOutput.writing.safeParse({ title: 'Warm', text: 'The rock is warm.' }).success).toBe(true)
    expect(ArtOutput.melody.safeParse({ title: 'Tune', bpm: 90, notes: [{ pitch: 'C4', beats: 1 }] }).success).toBe(true)
    expect(Object.keys(ArtOutput).sort()).toEqual([...ARTIFACT_KINDS].sort())
  })

  it('keeps a photo to a jpg under art/photos and its words short', () => {
    const photo = { image: 'photos/the-pond.jpg', caption: 'The pond.', opinion: 'Fine.', noticed: true }
    expect(Artifact.safeParse({ ...base, kind: 'photo', content: photo }).success).toBe(true)
    expect(Artifact.safeParse({ ...base, kind: 'photo', content: { ...photo, subjectId: 'water-bowl' } }).success).toBe(true)
    for (const image of ['../secret.jpg', 'photos/x.svg', 'https://evil.example/x.jpg', 'x.jpg', 'photos/a/b.jpg']) {
      expect(Artifact.safeParse({ ...base, kind: 'photo', content: { ...photo, image } }).success, image).toBe(false)
    }
    expect(Artifact.safeParse({ ...base, kind: 'photo', content: { ...photo, caption: 'x'.repeat(401) } }).success).toBe(false)
    expect(Artifact.safeParse({ ...base, kind: 'photo', content: { ...photo, opinion: 'x'.repeat(301) } }).success).toBe(false)
  })
})
