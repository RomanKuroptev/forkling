import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Interests, SourceStats } from '@forkling/schema'
import { createPrng } from '@forkling/sim'
import { pickDoors, type StartingPoint } from '../src/web/doors.ts'
import { dropRepeatedStarts, startKey } from '../src/web/rails.ts'
import { addStats, isoWeek, topHostShare } from '../src/web/stats.ts'
import { readWanderState } from '../src/web/wander-state.ts'

describe('the trip-start rail (spec 12.2)', () => {
  const step = (verb: string, targetId: string | undefined, reason = 'because') => ({ verb, ...(targetId ? { targetId } : {}), reason, minutes: 30 })

  it('keys a topic by its folded spelling and a URL by itself', () => {
    expect(startKey('Logic Gates')).toBe(startKey('logic gate'))
    expect(startKey('Octopuses')).toBe(startKey('octopus'))
    expect(startKey('https://en.wikipedia.org/wiki/Moss')).toBe('https://en.wikipedia.org/wiki/moss')
    expect(startKey('moss')).not.toBe(startKey('moss and ferns'))
  })

  it('removes a wander that starts where a trip already started today, and leaves the rest of the plan standing', () => {
    const plan = [step('wander', 'moss'), step('write', 'moss'), step('wander', 'Octopuses'), step('rest', undefined)]
    const out = dropRepeatedStarts(plan, [startKey('octopus')])
    expect(out.steps.map((s) => `${s.verb}:${s.targetId ?? ''}`)).toEqual(['wander:moss', 'write:moss', 'rest:'])
    expect(out.dropped).toEqual(['Octopuses'])
  })

  it('removes the second of two wanders in one plan that start from the same place', () => {
    const out = dropRepeatedStarts([step('wander', 'moss'), step('wander', 'Moss'), step('wander', 'tides')], [])
    expect(out.steps.map((s) => s.targetId)).toEqual(['moss', 'tides'])
    expect(out.dropped).toEqual(['Moss'])
  })

  it('leaves other verbs and a wander with no target alone', () => {
    const plan = [step('tend', 'home'), step('tend', 'home'), step('wander', undefined)]
    expect(dropRepeatedStarts(plan, [startKey('home')]).steps).toHaveLength(3)
  })
})

describe('the weekly numbers of each source (spec 6.6)', () => {
  it('names the ISO week the way the file keeps it', () => {
    expect(isoWeek('2026-11-18')).toBe('2026-W47')
    expect(isoWeek('2026-01-01')).toBe('2026-W01')
    expect(isoWeek('2027-01-01')).toBe('2026-W53')
    expect(isoWeek('2026-12-28')).toBe('2026-W53')
  })

  it('adds a trip to the week and the host, and keeps only the latest 8 weeks', () => {
    let s = SourceStats.parse({})
    s = addStats(s, '2026-11-18', [{ host: 'en.wikipedia.org', reads: 3, souvenirs: 1, boring: 1, failures: 0 }])
    s = addStats(s, '2026-11-19', [
      { host: 'en.wikipedia.org', reads: 2, souvenirs: 0, boring: 0, failures: 1 },
      { host: 'esolangs.org', reads: 1, souvenirs: 1, boring: 0, failures: 0 },
    ])
    expect(s.weeks['2026-W47']).toEqual({
      'en.wikipedia.org': { reads: 5, souvenirs: 1, placed: 0, boring: 1, failures: 1 },
      'esolangs.org': { reads: 1, souvenirs: 1, placed: 0, boring: 0, failures: 0 },
    })
    let many = s
    for (let w = 1; w <= 10; w++) many = addStats(many, `2026-0${Math.min(9, w)}-0${Math.min(9, w)}`, [{ host: 'x', reads: 1, souvenirs: 0, boring: 0, failures: 0 }])
    expect(Object.keys(many.weeks).length).toBeLessThanOrEqual(8)
    expect(many.weeks['2026-W47']).toBeDefined()
  })

  it('does not change its input', () => {
    const before = SourceStats.parse({})
    addStats(before, '2026-11-18', [{ host: 'x', reads: 1, souvenirs: 0, boring: 0, failures: 0 }])
    expect(before).toEqual({ weeks: {} })
  })

  it('gives the share of the week that one host read, or null when there are too few reads to say', () => {
    const s = addStats(addStats(SourceStats.parse({}), '2026-11-18', [{ host: 'a', reads: 9, souvenirs: 0, boring: 0, failures: 0 }]), '2026-11-18', [{ host: 'b', reads: 3, souvenirs: 0, boring: 0, failures: 0 }])
    expect(topHostShare(s, '2026-11-18')).toEqual({ host: 'a', share: 0.75 })
    expect(topHostShare(SourceStats.parse({}), '2026-11-18')).toBeNull()
    expect(topHostShare(addStats(SourceStats.parse({}), '2026-11-18', [{ host: 'a', reads: 4, souvenirs: 0, boring: 0, failures: 0 }]), '2026-11-18')).toBeNull()
  })
})

describe('what a tick knows about earlier trips', () => {
  let dir = ''
  afterEach(() => dir && rmSync(dir, { recursive: true, force: true }))
  const put = (rel: string, value: unknown) => {
    mkdirSync(join(dir, rel, '..'), { recursive: true })
    writeFileSync(join(dir, rel), JSON.stringify(value))
  }
  const trail = (id: string, urls: string[], extra: object = {}) => ({ id, date: id.slice(0, 10), purpose: 'p', start: { kind: 'topic', value: 'x' }, pages: urls.map((url) => ({ url, title: url, fetchedAt: '2026-11-10T10:00:00Z', topics: [] })), ...extra })
  const souv = (id: string, url: string, content: string) => ({ id, kind: 'quote', content, why: 'w', topics: [], source: { url, title: 't', fetchedAt: '2026-11-10T10:00:00Z' } })

  it('reads the pages of the last 30 days of trails and every souvenir, and counts trails today', () => {
    dir = mkdtempSync(join(tmpdir(), 'wander-'))
    put('trails/2026-10-01-1.json', trail('2026-10-01-1', ['https://en.wikipedia.org/wiki/Old']))
    put('trails/2026-10-25-1.json', trail('2026-10-25-1', ['https://en.wikipedia.org/wiki/Recent']))
    put('trails/2026-11-18-1.json', trail('2026-11-18-1', ['https://en.wikipedia.org/wiki/Today']))
    put('trails/2026-11-18-2.json', trail('2026-11-18-2', ['https://en.wikipedia.org/wiki/Today2']))
    put('trails/broken.json', { nonsense: true })
    put('souvenirs/2026-10-25-a.json', souv('2026-10-25-a', 'https://en.wikipedia.org/wiki/Recent', 'A quote.'))
    writeFileSync(join(dir, 'souvenirs', 'note.txt'), 'ignore me')
    const state = readWanderState(dir, '2026-11-18')
    expect(state.readRecently('https://en.wikipedia.org/wiki/Recent')).toBe(true)
    expect(state.readRecently('https://en.wikipedia.org/wiki/Today')).toBe(true)
    expect(state.readRecently('https://en.wikipedia.org/wiki/Old')).toBe(false)
    expect(state.souvenirs).toEqual([{ id: '2026-10-25-a', url: 'https://en.wikipedia.org/wiki/Recent', content: 'A quote.' }])
    expect(state.trailsToday).toBe(2)
  })

  it('is empty for a world with no trips yet', () => {
    dir = mkdtempSync(join(tmpdir(), 'wander-'))
    const state = readWanderState(dir, '2026-11-18')
    expect(state).toMatchObject({ souvenirs: [], trailsToday: 0 })
    expect(state.readRecently('https://x')).toBe(false)
  })
})

describe('the starting points of a morning (spec 12.4, stranger\'s doors)', () => {
  const links = (n: number): StartingPoint[] => Array.from({ length: n }, (_, i) => ({ title: `Topic ${i}`, url: `https://en.wikipedia.org/wiki/Topic_${i}`, door: false }))

  it('offers the front-page links, and marks 3 of them as doors outside what it is into', () => {
    const interests = Interests.parse({ version: 2, topics: { 'topic 0': { weight: 50, firstSeen: '2026-11-01T00:00:00Z', lastFed: '2026-11-01T00:00:00Z' } } })
    const out = pickDoors(links(10), interests, createPrng(7))
    expect(out).toHaveLength(10)
    const doors = out.filter((p) => p.door)
    expect(doors).toHaveLength(3)
    expect(doors.map((d) => d.title)).not.toContain('Topic 0')
  })

  it('picks the same doors for the same seed and different ones for another', () => {
    const a = pickDoors(links(20), Interests.parse({}), createPrng(1)).filter((p) => p.door).map((p) => p.title)
    const b = pickDoors(links(20), Interests.parse({}), createPrng(1)).filter((p) => p.door).map((p) => p.title)
    const c = pickDoors(links(20), Interests.parse({}), createPrng(2)).filter((p) => p.door).map((p) => p.title)
    expect(a).toEqual(b)
    expect(c).not.toEqual(a)
  })

  it('makes every link a door when there are 3 or fewer, and gives nothing for nothing', () => {
    expect(pickDoors(links(2), Interests.parse({}), createPrng(1)).every((p) => p.door)).toBe(true)
    expect(pickDoors([], Interests.parse({}), createPrng(1))).toEqual([])
  })

  it('does not change what it was given', () => {
    const input = links(5)
    pickDoors(input, Interests.parse({}), createPrng(1))
    expect(input.every((p) => !p.door)).toBe(true)
  })
})
