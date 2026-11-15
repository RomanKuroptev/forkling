import { describe, expect, it } from 'vitest'
import { Forkling, SpeciesPack, forklingPackIssues } from '../src/index.ts'

const forkling = {
  name: 'Merge',
  species: 'cat',
  position: [0, 0, 22],
  mood: 0.2,
  energy: 0.5,
  intention: { type: 'lounge', startedAt: '2026-10-30T12:00:00Z', seed: 7, reason: 'The beach is warm.' },
  lastTickAt: '2026-10-30T12:00:00Z',
  timezone: 'Europe/Stockholm',
}

describe('Forkling', () => {
  it('parses the forkling.json shape', () => {
    expect(Forkling.parse(forkling).name).toBe('Merge')
  })

  it('defaults the timezone to UTC', () => {
    const { timezone: _, ...withoutTz } = forkling
    expect(Forkling.parse(withoutTz).timezone).toBe('UTC')
  })

  it('rejects an unknown timezone', () => {
    expect(Forkling.safeParse({ ...forkling, timezone: 'Mars/Olympus_Mons' }).success).toBe(false)
  })

  it('has mood and energy from -1 to 1, steady and rested by default (spec 3.2)', () => {
    const { mood: _m, energy: _e, ...bare } = forkling
    expect(Forkling.parse(bare)).toMatchObject({ mood: 0, energy: 0.5 })
    expect(Forkling.safeParse({ ...forkling, mood: 1.2 }).success).toBe(false)
    expect(Forkling.safeParse({ ...forkling, energy: -1.5 }).success).toBe(false)
  })

  it('still reads a pet-era file: needs and feelings are dropped, a mood word becomes a number', () => {
    const old = {
      ...forkling,
      mood: 'upset',
      energy: undefined,
      needs: { hunger: 70, energy: 80, curiosity: 55, affection: 30 },
      feelings: { valence: -0.5, arousal: 0.6 },
    }
    const parsed = Forkling.parse(old)
    expect(parsed).toMatchObject({ mood: -0.5, energy: 0.5 })
    expect(parsed).not.toHaveProperty('needs')
    expect(parsed).not.toHaveProperty('feelings')
  })

  it('reads a pet-era mood word with no feelings as steady', () => {
    expect(Forkling.parse({ ...forkling, mood: 'curious', energy: undefined })).toMatchObject({ mood: 0, energy: 0.5 })
  })

  it('requires a name of sensible length and a species id', () => {
    expect(Forkling.safeParse({ ...forkling, name: '' }).success).toBe(false)
    expect(Forkling.safeParse({ ...forkling, name: 'x'.repeat(41) }).success).toBe(false)
    expect(Forkling.safeParse({ ...forkling, species: 'Not A Slug' }).success).toBe(false)
  })

  it('requires ISO timestamps', () => {
    expect(Forkling.safeParse({ ...forkling, lastTickAt: 'noon' }).success).toBe(false)
  })
})

describe('forklingPackIssues', () => {
  const pack = SpeciesPack.parse({
    id: 'cat',
    displayName: 'Cat',
    perception: { noticeRadius: 5, eyeHeight: 0.2 },
    locomotion: { walkSpeed: 1, runSpeed: 3 },
    actions: [
      { id: 'lounge', satisfies: {}, durationSec: [1, 2], target: { type: 'none' }, slot: 'sit', reason: 'Resting.' },
    ],
  })
  const parsed = Forkling.parse(forkling)

  it('finds nothing wrong with a matching forkling and pack', () => {
    expect(forklingPackIssues(parsed, pack)).toEqual([])
  })

  it('reports a species mismatch and an unknown intention', () => {
    const issues = forklingPackIssues({ ...parsed, species: 'dog', intention: { ...parsed.intention, type: 'fly' } }, pack)
    expect(issues).toHaveLength(2)
    expect(issues.join(' ')).toMatch(/dog/)
    expect(issues.join(' ')).toMatch(/fly/)
  })
})
