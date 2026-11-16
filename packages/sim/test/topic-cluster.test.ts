import { describe, expect, it } from 'vitest'
import { contentWords, sameSubject, topicClusters, writesOnTopic, type WrittenPage } from '../src/topic-cluster.ts'

const DAY = 86_400_000
const NOW = Date.parse('2026-11-16T12:00:00Z')
const at = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString()

/** A page that keeps coming back to its own words, the way a page about one subject does. */
const page = (title: string, daysAgo: number, own: string[], target: string | null = null): WrittenPage => ({
  at: at(daysAgo),
  title,
  target,
  text: `${title}. ${Array.from({ length: 4 }, (_, i) => `I keep thinking about ${own.join(' and ')} and what ${own[i % own.length]} does next, because ${own.join(' ')} matter.`).join(' ')}`,
})

const lidar = ['lidar', 'laser', 'canopy', 'elevation', 'ground', 'trees']
const lidarPages = [
  page('What the laser found under the trees', 5, lidar.slice(0, 5)),
  page('Height, without the sky', 4, lidar.slice(1, 6)),
  page('Ground without the trees', 3.5, ['lidar', 'ground', 'trees', 'elevation', 'canopy']),
  page('What a height grid forgets', 2, ['elevation', 'grid', 'lidar', 'ground', 'laser'], 'Digital elevation model'),
  page('Leaf area index', 1, ['canopy', 'lidar', 'trees', 'laser', 'ground'], 'Leaf area index'),
]
const sandPages = [page('What the sand taught me', 5, ['sand', 'grain', 'shader', 'ripples', 'light']), page('Grain and ripples', 2, ['sand', 'grain', 'ripples', 'shader', 'light'])]

describe('contentWords', () => {
  it('drops small and common words and folds plurals', () => {
    expect(contentWords('What the Trees and boxes were, about the river')).toEqual(['tree', 'box', 'river'])
  })
})

describe('topicClusters', () => {
  it('puts pages that keep coming back to the same words in one cluster, and other subjects apart', () => {
    const pages = [...lidarPages, ...sandPages]
    const ids = topicClusters(pages)
    expect(new Set(ids.slice(0, 5)).size).toBe(1)
    expect(new Set(ids.slice(5)).size).toBe(1)
    expect(ids[0]).not.toBe(ids[5])
  })

  it('links two near-copies even when they share few words, by the repeated-writing measure', () => {
    const a: WrittenPage = { at: at(2), title: 'A', text: 'the quick brown fox jumps over the lazy dog near the old river bank today' }
    const b: WrittenPage = { at: at(1), title: 'B', text: 'the quick brown fox jumps over the lazy dog near the old river bank tonight' }
    const ids = topicClusters([a, b])
    expect(ids[0]).toBe(ids[1])
  })
})

describe('writesOnTopic', () => {
  const opts = { nowMs: NOW, days: 7 }

  it('counts every lidar variant together, though no two of them share a name', () => {
    const hits = writesOnTopic({ target: 'Airborne lidar', reason: 'See what the laser keeps and drops' }, [...lidarPages, ...sandPages], opts)
    expect(hits.map((h) => h.title).sort()).toEqual(lidarPages.map((p) => p.title).sort())
  })

  it('joins by a name that is the same as an earlier target, even with no shared words in the text', () => {
    const hits = writesOnTopic({ target: 'digital elevation models', reason: 'again' }, [...lidarPages], opts)
    expect(hits.length).toBe(lidarPages.length)
  })

  it('does not count another subject', () => {
    expect(writesOnTopic({ target: 'Milky Way dust mapping', reason: 'Dust between the stars' }, [...lidarPages, ...sandPages], opts)).toEqual([])
    expect(writesOnTopic({ target: 'Sand in WebGL', reason: 'More grain and ripples' }, [...lidarPages, ...sandPages], opts).map((h) => h.title).sort()).toEqual(sandPages.map((p) => p.title).sort())
  })

  it('looks back only the given days', () => {
    const hits = writesOnTopic({ target: 'Airborne lidar', reason: 'the laser and the canopy' }, lidarPages, { nowMs: NOW, days: 3 })
    expect(hits.map((h) => h.title).sort()).toEqual(['Leaf area index', 'What a height grid forgets'].sort())
  })

  it('joins nothing when it shares no word with any page', () => {
    expect(writesOnTopic({ target: 'Moss on old walls', reason: 'something soft' }, [...lidarPages, ...sandPages], opts)).toEqual([])
  })

  it('needs two pages of a cluster (or an equal name), so one stray match does not pull in the whole cluster', () => {
    const odd = page('A strange fireball', 1, ['bolide', 'lidar', 'laser', 'canopy', 'ground'])
    const pool = [...lidarPages.slice(0, 4), odd]
    expect(topicClusters(pool).every((c) => c === topicClusters(pool)[0])).toBe(true)
    expect(writesOnTopic({ target: 'Bolide hunting', reason: 'fireballs' }, pool, opts)).toEqual([])
  })
})

describe('sameSubject', () => {
  it('is true for the same name in another spelling', () => {
    expect(sameSubject('Digital elevation model', 'digital elevation models')).toBe(true)
  })
  it('is true when two or more content words are shared', () => {
    expect(sameSubject('Sand in WebGL: Grain under a low sun', 'Grain under a low sun, again')).toBe(true)
  })
  it('is false for different subjects', () => {
    expect(sameSubject('Sand in WebGL', 'Leaf area index')).toBe(false)
  })
})
