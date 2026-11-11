import { describe, expect, it } from 'vitest'
import { MindState, SourceStats, Souvenir, SOUVENIR_LICENCES, Trail, TrailPage } from '../src/index.ts'

const source = { url: 'https://example.org/log', title: "Keeper's log, 1891", fetchedAt: '2026-11-18T10:12:00+01:00' }
const base = { id: '2026-11-18-keepers-log', why: 'Nine days of the same word and he still lit it.', topics: ['lighthouses'], source, licence: null, placedIn: null }

describe('Souvenir', () => {
  it('accepts a quote, a fact with evidence and an image with its licence and credit', () => {
    expect(Souvenir.safeParse({ ...base, kind: 'quote', content: 'Fog. Fog. Fog. Lamp lit at 4.' }).success).toBe(true)
    expect(Souvenir.safeParse({ ...base, kind: 'fact', content: 'The lamp was lit every day.', evidence: 'Lamp lit at 4.' }).success).toBe(true)
    const image = { ...base, kind: 'image', content: 'https://upload.wikimedia.org/a.jpg', licence: 'CC BY-SA', credit: 'A. Person' }
    expect(Souvenir.safeParse(image).success).toBe(true)
  })

  it('holds a quote to 280 characters and a fact to 200', () => {
    expect(Souvenir.safeParse({ ...base, kind: 'quote', content: 'x'.repeat(281) }).success).toBe(false)
    expect(Souvenir.safeParse({ ...base, kind: 'fact', content: 'x'.repeat(201), evidence: 'ok' }).success).toBe(false)
    expect(Souvenir.safeParse({ ...base, kind: 'fact', content: 'ok', evidence: 'x'.repeat(281) }).success).toBe(false)
  })

  it('rejects a fact with no evidence and an image with a licence that is not allowed or has no credit', () => {
    expect(Souvenir.safeParse({ ...base, kind: 'fact', content: 'The lamp was lit.' }).success).toBe(false)
    expect(Souvenir.safeParse({ ...base, kind: 'image', content: 'https://x.org/a.jpg', licence: 'All rights reserved', credit: 'A' }).success).toBe(false)
    expect(Souvenir.safeParse({ ...base, kind: 'image', content: 'https://x.org/a.jpg', licence: 'CC0' }).success).toBe(false)
    expect(SOUVENIR_LICENCES).toEqual(['public domain', 'CC0', 'CC BY', 'CC BY-SA'])
  })

  it('needs a source and a non-empty id and content', () => {
    expect(Souvenir.safeParse({ ...base, kind: 'quote', content: '' }).success).toBe(false)
    expect(Souvenir.safeParse({ ...base, id: '', kind: 'quote', content: 'x' }).success).toBe(false)
    const { source: _s, ...noSource } = base
    expect(Souvenir.safeParse({ ...noSource, kind: 'quote', content: 'x' }).success).toBe(false)
  })
})

const page = { url: 'https://en.wikipedia.org/wiki/Lighthouse', title: 'Lighthouse', fetchedAt: '2026-11-18T10:12:00+01:00', reaction: 'Tall things that tell ships to stay away.', topics: ['lighthouses'], interest: 7 }

describe('Trail', () => {
  it('holds a purpose, a start and up to 6 pages with their reactions, topics and souvenirs', () => {
    const trail = { id: '2026-11-18-1', date: '2026-11-18', purpose: 'find out how lamps were lit', start: { kind: 'topic', value: 'lighthouses' }, pages: [page, { ...page, souvenirId: base.id, look: 'A white tower on a rock.' }] }
    expect(Trail.safeParse(trail).success).toBe(true)
    expect(Trail.safeParse({ ...trail, pages: Array.from({ length: 7 }, () => page) }).success).toBe(false)
    expect(Trail.safeParse({ ...trail, pages: [] }).success).toBe(false)
  })

  it('keeps a reaction to 60 words of about 400 characters and an interest score from 0 to 10', () => {
    expect(TrailPage.safeParse({ ...page, interest: 11 }).success).toBe(false)
    expect(TrailPage.safeParse({ ...page, interest: -1 }).success).toBe(false)
    expect(TrailPage.safeParse({ ...page, reaction: 'x'.repeat(601) }).success).toBe(false)
    expect(TrailPage.safeParse({ ...page, topics: ['a', 'b', 'c', 'd'] }).success).toBe(false)
  })

  it('records a failed fetch as a page with no reaction', () => {
    expect(TrailPage.safeParse({ url: page.url, title: page.title, fetchedAt: page.fetchedAt, failed: 'timeout' }).success).toBe(true)
  })
})

describe('SourceStats', () => {
  it('holds a week of yield, uptake, boredom and failures for each host, and defaults to nothing', () => {
    expect(SourceStats.parse({})).toEqual({ weeks: {} })
    const week = { reads: 10, souvenirs: 3, placed: 1, boring: 2, failures: 0 }
    expect(SourceStats.safeParse({ weeks: { '2026-W46': { 'en.wikipedia.org': week } } }).success).toBe(true)
    expect(SourceStats.safeParse({ weeks: { '2026-W46': { 'en.wikipedia.org': { ...week, reads: -1 } } } }).success).toBe(false)
  })
})

describe('MindState.pausedHosts', () => {
  it('defaults to no paused hosts, and holds the time each pause ends', () => {
    expect(MindState.parse({}).pausedHosts).toEqual({})
    expect(MindState.parse({ pausedHosts: { 'lobste.rs': '2026-11-19T10:00:00Z' } }).pausedHosts).toEqual({ 'lobste.rs': '2026-11-19T10:00:00Z' })
    expect(MindState.safeParse({ pausedHosts: { 'lobste.rs': 'tomorrow' } }).success).toBe(false)
  })
})
