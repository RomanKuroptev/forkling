import { describe, expect, it } from 'vitest'
import { Forkling, SpeciesPack, VisitorEvent, WorldObject, forklingPackIssues, objectIdFromPath } from '../src/index.ts'

const forkling = {
  name: 'Merge',
  species: 'cat',
  needs: { hunger: 70, energy: 80, curiosity: 55, affection: 30 },
  position: [0, 0, 22],
  mood: 'curious',
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

  it('rejects needs outside 0 to 100 and needs outside the shared vocabulary', () => {
    expect(Forkling.safeParse({ ...forkling, needs: { hunger: 140 } }).success).toBe(false)
    expect(Forkling.safeParse({ ...forkling, needs: { mana: 50 } }).success).toBe(false)
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

describe('WorldObject', () => {
  const rock = {
    id: 'sunny-rock',
    kind: 'rock',
    name: 'The sunny rock',
    position: [4, 0, 20],
    model: { asset: 'nature/rock_largeA' },
    reason: 'It gets the morning sun first.',
  }

  it('parses and fills defaults', () => {
    const parsed = WorldObject.parse(rock)
    expect(parsed.rotation).toEqual([0, 0, 0])
    expect(parsed.scale).toBe(1)
    expect(parsed.affordances).toEqual([])
  })

  it('accepts the affordances from CLAUDE.md only', () => {
    expect(WorldObject.safeParse({ ...rock, affordances: ['sit', 'perch', 'sleep'] }).success).toBe(true)
    expect(WorldObject.safeParse({ ...rock, affordances: ['teleport'] }).success).toBe(false)
  })

  it('requires a slug id, a known model shape and a positive scale', () => {
    expect(WorldObject.safeParse({ ...rock, id: 'Sunny Rock' }).success).toBe(false)
    expect(WorldObject.safeParse({ ...rock, model: { url: 'https://example.com/x.glb' } }).success).toBe(false)
    expect(WorldObject.safeParse({ ...rock, model: { asset: '../../secrets' } }).success).toBe(false)
    expect(WorldObject.safeParse({ ...rock, scale: 0 }).success).toBe(false)
  })

  it('only allows behavior scripts under behaviors/', () => {
    expect(WorldObject.safeParse({ ...rock, behavior: 'behaviors/sunny-rock.js' }).success).toBe(true)
    expect(WorldObject.safeParse({ ...rock, behavior: '../evil.js' }).success).toBe(false)
  })
})

describe('objectIdFromPath', () => {
  it('takes the id from an objects/ path', () => {
    expect(objectIdFromPath('objects/sunny-rock.json')).toBe('sunny-rock')
    expect(objectIdFromPath('objects/nested/x.json')).toBeNull()
    expect(objectIdFromPath('journal/2026-10-30.md')).toBeNull()
  })
})

describe('VisitorEvent', () => {
  const gift = { type: 'gift', visitorId: 'v_3f9a', payload: { item: 'fish' }, createdAt: '2026-10-30T12:00:00Z' }

  it('parses visitor actions', () => {
    expect(VisitorEvent.parse(gift).type).toBe('gift')
  })

  it('rejects unknown types and over-long messages', () => {
    expect(VisitorEvent.safeParse({ ...gift, type: 'hack' }).success).toBe(false)
    expect(VisitorEvent.safeParse({ ...gift, type: 'message', payload: { text: 'x'.repeat(281) } }).success).toBe(false)
    expect(VisitorEvent.safeParse({ ...gift, type: 'message', payload: { text: 'hi Merge' } }).success).toBe(true)
  })
})

describe('forklingPackIssues', () => {
  const pack = SpeciesPack.parse({
    id: 'cat',
    displayName: 'Cat',
    needs: { hunger: { initial: 50, decayPerHour: 10 }, energy: { initial: 50, decayPerHour: 10 } },
    perception: { noticeRadius: 5, eyeHeight: 0.2 },
    locomotion: { walkSpeed: 1, runSpeed: 3 },
    actions: [
      { id: 'lounge', satisfies: {}, durationSec: [1, 2], target: { type: 'none' }, slot: 'sit', reason: 'Resting.' },
    ],
  })
  const parsed = Forkling.parse({ ...forkling, needs: { hunger: 70, energy: 80 } })

  it('finds nothing wrong with a matching forkling and pack', () => {
    expect(forklingPackIssues(parsed, pack)).toEqual([])
  })

  it('reports a species mismatch and an unknown intention', () => {
    const issues = forklingPackIssues({ ...parsed, species: 'dog', intention: { ...parsed.intention, type: 'fly' } }, pack)
    expect(issues).toHaveLength(2)
    expect(issues.join(' ')).toMatch(/dog/)
    expect(issues.join(' ')).toMatch(/fly/)
  })

  it('does not mind a need the pack no longer has: a world written by an older version still opens', () => {
    // The cat lost its affection need, and Merge's forkling.json still says 0. The sim ignores it and the next write drops it.
    expect(forklingPackIssues({ ...parsed, needs: { hunger: 70, energy: 80, affection: 0 } }, pack)).toEqual([])
    expect(forklingPackIssues({ ...parsed, needs: { hunger: 70, curiosity: 50 } }, pack)).toEqual([])
  })
})
