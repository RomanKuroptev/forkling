import { describe, expect, it } from 'vitest'
import type { Trail } from '@forkling/schema'
import { rememberSeen, resolveTopic, type SeenPage } from '../src/web/lookup.ts'
import { readingFor } from '../src/web/reading.ts'
import { resolveStart } from '../src/web/start.ts'

const seen: SeenPage[] = [
  { title: 'Shaded relief', url: 'https://en.wikipedia.org/wiki/Shaded_relief' },
  { title: 'Digital elevation model', url: 'https://en.wikipedia.org/wiki/Digital_elevation_model' },
  { title: 'Leaf area index', url: 'https://en.wikipedia.org/wiki/Leaf_area_index' },
  { title: 'List of esoteric programming languages', url: 'https://esolangs.org/wiki/List' },
]

describe('resolveTopic (no search: robots.txt allows none, so a title is matched among the pages Merge has seen)', () => {
  it('finds a page it has seen by its title, in another spelling', () => {
    expect(resolveTopic('shaded relief', seen)?.url).toBe('https://en.wikipedia.org/wiki/Shaded_relief')
    expect(resolveTopic('Digital elevation models', seen)?.title).toBe('Digital elevation model')
  })

  it('finds it when the topic is a few words of a longer title', () => {
    expect(resolveTopic('elevation model', seen)?.title).toBe('Digital elevation model')
    expect(resolveTopic('leaf area', seen)?.title).toBe('Leaf area index')
  })

  it('takes the shortest title when several hold the words', () => {
    const more = [...seen, { title: 'Digital elevation model data for the Alps and more', url: 'https://en.wikipedia.org/wiki/Long' }]
    expect(resolveTopic('elevation model', more)?.title).toBe('Digital elevation model')
  })

  it('finds nothing for a topic it has not seen, or for no words at all', () => {
    expect(resolveTopic('Absurd rigorous joke papers', seen)).toBeNull()
    expect(resolveTopic('the of and', seen)).toBeNull()
    expect(resolveTopic('', seen)).toBeNull()
  })
})

describe('rememberSeen', () => {
  it('keeps the newest last, once per address, and at most the limit', () => {
    const ring = rememberSeen([{ title: 'A', url: 'https://x/a' }, { title: 'B', url: 'https://x/b' }], [{ title: 'A again', url: 'https://x/a' }, { title: 'C', url: 'https://x/c' }], 3)
    expect(ring.map((s) => s.url)).toEqual(['https://x/b', 'https://x/a', 'https://x/c'])
    expect(ring.find((s) => s.url === 'https://x/a')?.title).toBe('A again')
    expect(rememberSeen(ring, [{ title: 'D', url: 'https://x/d' }], 3).map((s) => s.url)).toEqual(['https://x/a', 'https://x/c', 'https://x/d'])
  })
})

describe('resolveStart with the pages Merge has seen', () => {
  it('goes to the page it has seen when a topic matches one', () => {
    expect(resolveStart('shaded relief', [], seen)).toEqual({ ok: true, kind: 'topic', value: 'shaded relief', url: 'https://en.wikipedia.org/wiki/Shaded_relief', found: 'seen' })
  })

  it("falls back on the topic's own Wikipedia page, and says it is only a guess", () => {
    expect(resolveStart('Lighthouses', [], seen)).toEqual({ ok: true, kind: 'topic', value: 'Lighthouses', url: 'https://en.wikipedia.org/wiki/Lighthouses', found: 'guess' })
  })

  it('leaves an address and a souvenir as they were', () => {
    expect(resolveStart('https://en.wikipedia.org/wiki/Moss', [], seen)).toMatchObject({ ok: true, kind: 'feed' })
    expect(resolveStart('s1', [{ id: 's1', url: 'https://en.wikipedia.org/wiki/Moss', content: 'x' }], seen)).toMatchObject({ ok: true, kind: 'souvenir' })
  })
})

const trail = (over: Partial<Trail>): Trail => ({ id: '2026-11-12-2', date: '2026-11-12', purpose: 'p', start: { kind: 'topic', value: 'Absurd rigorous joke papers' }, pages: [], ...over }) as Trail

describe('readingFor (what the write step is told about what it read)', () => {
  const failed = trail({ pages: [{ url: 'https://en.wikipedia.org/wiki/Absurd_rigorous_joke_papers', title: 'Absurd_rigorous_joke_papers', fetchedAt: '2026-11-12T10:00:00Z', failed: 'not_found: 404', topics: [] }] })
  const good = trail({
    id: '2026-11-15-2',
    date: '2026-11-15',
    start: { kind: 'topic', value: 'Shaded relief' },
    pages: [
      { url: 'https://en.wikipedia.org/wiki/Shaded_relief', title: 'Shaded relief', fetchedAt: '2026-11-15T10:00:00Z', reaction: 'Light from one side makes a flat map look like hills.', topics: ['shaded relief'], interest: 7 },
      { url: 'https://en.wikipedia.org/wiki/Hillshade', title: 'Hillshade', fetchedAt: '2026-11-15T10:05:00Z', topics: [], interest: 4 },
    ],
  })

  it('says plainly that it read nothing when the trip found no page, and names what it looked for', () => {
    expect(readingFor([failed], 'Absurd rigorous joke papers')).toEqual({ kind: 'nothing', looked: 'Absurd rigorous joke papers' })
  })

  it('lists the pages it really read, and what it made of them', () => {
    const r = readingFor([failed, good], 'Shaded relief')
    expect(r).toMatchObject({ kind: 'read' })
    expect(r && r.kind === 'read' && r.pages.map((p) => p.title)).toEqual(['Shaded relief', 'Hillshade'])
    expect(r && r.kind === 'read' && r.pages[0]!.reaction).toMatch(/hills/)
  })

  it('matches a target to a trail by the page it read, not only by where it started', () => {
    expect(readingFor([good], 'hillshade')).toMatchObject({ kind: 'read' })
  })

  it('says nothing when no trip was about the target', () => {
    expect(readingFor([good], 'Moss on old walls')).toBeNull()
  })

  it('uses the newest trip about it', () => {
    const later = trail({ id: '2026-11-16-1', date: '2026-11-16', start: { kind: 'topic', value: 'Shaded relief' }, pages: [{ url: 'https://en.wikipedia.org/wiki/Shaded_relief', title: 'Shaded relief', fetchedAt: '2026-11-16T10:00:00Z', failed: 'timeout', topics: [] }] })
    expect(readingFor([good, later], 'Shaded relief')).toEqual({ kind: 'nothing', looked: 'Shaded relief' })
  })
})
