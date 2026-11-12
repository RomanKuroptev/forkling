import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Interests, Souvenir, WorkMeta } from '@forkling/schema'
import { readWorks, recentSouvenirs, recentWorkTitles, topInterestLines, untriedLibraries } from '../src/builds/works.ts'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'works-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const meta = (over: Record<string, unknown> = {}) =>
  WorkMeta.parse({ id: 'a-lamp', title: 'A lamp', kind: 'art', about: 'A lamp.', interest: null, made: '2026-11-14T10:00:00Z', status: 'shelf', size: 'full', libraries: ['p5'], ...over })
const put = (m: WorkMeta) => {
  mkdirSync(join(dir, 'works', m.id), { recursive: true })
  writeFileSync(join(dir, 'works', m.id, 'meta.json'), JSON.stringify(m))
}

describe('readWorks', () => {
  it('is empty when there is no works folder', () => {
    expect(readWorks(dir)).toEqual([])
  })

  it('reads every valid meta, newest first, and leaves out one that does not fit its schema or is not a work', () => {
    put(meta({ id: 'old', made: '2026-11-10T10:00:00Z' }))
    put(meta({ id: 'new', made: '2026-11-14T10:00:00Z' }))
    mkdirSync(join(dir, 'works/broken'), { recursive: true })
    writeFileSync(join(dir, 'works/broken/meta.json'), '{ nope')
    mkdirSync(join(dir, 'works/odd'), { recursive: true })
    writeFileSync(join(dir, 'works/odd/meta.json'), JSON.stringify({ id: 'odd' }))
    writeFileSync(join(dir, 'works/stray.txt'), 'x')
    expect(readWorks(dir).map((w) => w.id)).toEqual(['new', 'old'])
  })

  it('leaves out a work whose folder name is not its id', () => {
    const m = meta({ id: 'a-lamp' })
    mkdirSync(join(dir, 'works/other-name'), { recursive: true })
    writeFileSync(join(dir, 'works/other-name/meta.json'), JSON.stringify(m))
    expect(readWorks(dir)).toEqual([])
  })
})

describe('recentWorkTitles and untriedLibraries', () => {
  const works = [
    meta({ id: 'c', title: 'Third', made: '2026-11-14T12:00:00Z', libraries: ['p5'] }),
    meta({ id: 'b', title: 'Scrapped', made: '2026-11-14T11:00:00Z', status: 'scrap', scrapReason: 'blank', libraries: ['three'] }),
    meta({ id: 'a', title: 'First', made: '2026-11-14T10:00:00Z', libraries: [] }),
  ]

  it('lists the newest titles that were not scrapped', () => {
    expect(recentWorkTitles(works, 5)).toEqual(['Third', 'First'])
    expect(recentWorkTitles(works, 1)).toEqual(['Third'])
  })

  it('names the libraries no work that was kept has used (a scrap does not count as trying one)', () => {
    expect(untriedLibraries(works)).toEqual(['tone', 'three'])
    expect(untriedLibraries([])).toEqual(['p5', 'tone', 'three'])
  })
})

describe('recentSouvenirs and topInterestLines', () => {
  it('gives the newest souvenirs with their sources, as the tinker call is offered them', () => {
    mkdirSync(join(dir, 'souvenirs'), { recursive: true })
    for (const [n, id] of [['2026-11-12-a', 'a'], ['2026-11-13-b', 'b'], ['2026-11-14-c', 'c']] as const) {
      const s = Souvenir.parse({ kind: 'quote', id, why: 'it stuck', content: `quote ${id}`, source: { url: `https://en.wikipedia.org/wiki/${id}`, title: `Page ${id}`, fetchedAt: '2026-11-14T10:00:00Z' } })
      writeFileSync(join(dir, 'souvenirs', `${n}.json`), JSON.stringify(s))
    }
    writeFileSync(join(dir, 'souvenirs', 'bad.json'), '{ nope')
    const got = recentSouvenirs(dir, 2)
    expect(got.map((s) => s.id)).toEqual(['c', 'b'])
    expect(got[0]).toEqual({ id: 'c', kind: 'quote', content: 'quote c', source: { title: 'Page c', url: 'https://en.wikipedia.org/wiki/c' } })
    expect(recentSouvenirs(join(dir, 'nothing'), 5)).toEqual([])
  })

  it('lists the strongest interests as whole numbers', () => {
    const topic = (weight: number) => ({ weight, firstSeen: '2026-11-01T10:00:00Z', lastFed: '2026-11-14T10:00:00Z' })
    const interests = Interests.parse({ version: 2, topics: { 'tide pools': topic(74.4), lighthouses: topic(51), moss: topic(3) } })
    expect(topInterestLines(interests, 2)).toEqual(['tide pools (74)', 'lighthouses (51)'])
  })
})
