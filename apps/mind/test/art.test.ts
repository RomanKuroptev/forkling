import { describe, expect, it } from 'vitest'
import { Artifact, Interests, type TemperamentRoll } from '@forkling/schema'
import { artifactFrom, buildArtUser, MAX_ARTIFACTS_PER_DAY } from '../src/art.ts'

const meta = { skillLevel: 2, goalRef: 'today:1', obsessionRef: 'logic gates', nowIso: '2026-11-03T15:00:00Z', takenIds: new Set<string>() }

describe('artifactFrom', () => {
  it('turns a poem into an artifact with an id from its title, the skill it was made at, and what it served', () => {
    const a = artifactFrom('writing', { title: 'The Sunny Rock!', text: 'It is warm.' }, meta)!
    expect(Artifact.safeParse(a).success).toBe(true)
    expect(a).toMatchObject({ id: 'the-sunny-rock', kind: 'writing', title: 'The Sunny Rock!', skillLevel: 2, goalRef: 'today:1', obsessionRef: 'logic gates', createdAt: meta.nowIso })
  })

  it('never reuses an id', () => {
    const taken = new Set(['the-sunny-rock', 'the-sunny-rock-2'])
    expect(artifactFrom('writing', { title: 'The sunny rock', text: 'x' }, { ...meta, takenIds: taken })!.id).toBe('the-sunny-rock-3')
  })

  it('falls back on the kind when the title has no letters', () => {
    expect(artifactFrom('writing', { title: '???', text: 'x' }, meta)!.id).toBe('writing')
  })

  it('cleans a drawing, and makes nothing of one with nothing safe in it', () => {
    const a = artifactFrom('drawing', { title: 'Hill', svg: '<svg viewBox="0 0 10 10" onload="x()"><script>x()</script><circle cx="5" cy="5" r="2"/></svg>' }, meta)!
    expect(a.kind === 'drawing' && a.content.svg).toBe('<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="2"/></svg>')
    expect(artifactFrom('drawing', { title: 'Hill', svg: '<script>x()</script>' }, meta)).toBeNull()
  })

  it('keeps a melody playable: bpm in range, good notes only, not too long', () => {
    const notes = [{ pitch: 'C4', beats: 1 }, { pitch: 'nope', beats: 1 }, { pitch: 'F#3', beats: 99 }, { pitch: 'R', beats: 0 }, ...Array.from({ length: 80 }, () => ({ pitch: 'E4', beats: 1 }))]
    const a = artifactFrom('melody', { title: 'Tune', bpm: 900, notes }, meta)!
    expect(a.kind === 'melody' && a.content.bpm).toBe(200)
    if (a.kind !== 'melody') throw new Error('not a melody')
    expect(a.content.notes.length).toBe(64)
    expect(a.content.notes[0]).toEqual({ pitch: 'C4', beats: 1 })
    expect(a.content.notes[1]).toEqual({ pitch: 'F#3', beats: 4 })
    expect(a.content.notes[2]).toEqual({ pitch: 'R', beats: 0.25 })
    expect(artifactFrom('melody', { title: 'Silence', bpm: 90, notes: [{ pitch: 'xx', beats: 1 }] }, meta)).toBeNull()
  })

  it('keeps a recipe in grams, rounded and in range', () => {
    const a = artifactFrom('recipe', { title: 'Berry mash', ingredients: [{ name: 'berries', grams: 250.6 }, { name: 'nothing', grams: -5 }], steps: ['Mash.'] }, meta)!
    if (a.kind !== 'recipe') throw new Error('not a recipe')
    expect(a.content.ingredients).toEqual([{ name: 'berries', grams: 251 }, { name: 'nothing', grams: 1 }])
  })

  it('cuts long text rather than refusing it, and refuses an empty one', () => {
    const a = artifactFrom('broadcast', { title: 'Evening show', script: 'la '.repeat(5000) }, meta)!
    expect(a.kind === 'broadcast' && a.content.script.length).toBeLessThanOrEqual(4000)
    expect(artifactFrom('writing', { title: 'Blank', text: '   ' }, meta)).toBeNull()
  })

  it('writes a lab note with its question, method and result', () => {
    const a = artifactFrom('labnote', { title: 'Clay and water', question: 'Does clay float?', method: 'Dropped a cup.', result: 'It sank.' }, meta)!
    expect(a.kind === 'labnote' && a.content.result).toBe('It sank.')
  })

  it('leaves out an obsession or goal when there is none', () => {
    const a = artifactFrom('writing', { title: 'x', text: 'y' }, { ...meta, goalRef: undefined, obsessionRef: undefined })!
    expect('goalRef' in a).toBe(false)
    expect('obsessionRef' in a).toBe(false)
  })
})

describe('buildArtUser', () => {
  const temperament: TemperamentRoll = { likes: [{ category: 'material', value: 'clay' }], dislikes: [], quirks: [{ id: 'perfectionist', text: 'Redoes things.' }] }
  const input = {
    kind: 'drawing' as const,
    topic: 'the pond',
    reason: 'I can see it in my head.',
    skillLevel: 1,
    obsession: null,
    recentTitles: ['The Sunny Rock'],
    interests: Interests.parse({}),
    temperament,
    date: '2026-11-03',
  }

  it('says what to make, about what, and how practised it is, so early work is simpler', () => {
    const early = buildArtUser(input)
    expect(early).toContain('the pond')
    expect(early).toContain('I can see it in my head.')
    expect(early).toMatch(/skill level is 1 of 10/i)
    expect(early).toMatch(/simple|clumsy/i)
    expect(buildArtUser({ ...input, skillLevel: 9 })).toMatch(/polished|confident/i)
  })

  it('gives the rules of the format, for a drawing the safe elements only', () => {
    const user = buildArtUser(input)
    expect(user).toMatch(/viewBox/)
    expect(user).toMatch(/no scripts/i)
  })

  it('tells a melody what notes look like', () => {
    expect(buildArtUser({ ...input, kind: 'melody' })).toMatch(/C4/)
  })

  it('asks for something different from what it made before, and names the obsession it serves', () => {
    const user = buildArtUser({ ...input, obsession: 'logic gates' })
    expect(user).toContain('The Sunny Rock')
    expect(user).toContain('logic gates')
  })

  it('wraps nothing from outside, because topic is its own words but is still marked as such', () => {
    expect(buildArtUser(input)).toContain('<topic>')
  })

  it('has a daily limit of about four', () => {
    expect(MAX_ARTIFACTS_PER_DAY).toBe(4)
  })
})
