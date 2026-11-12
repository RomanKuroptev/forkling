import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Trail } from '@forkling/schema'
import { memeSeeds, verifyMemeSources } from '../src/builds/memes.ts'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'memes-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const trail = (id: string, date: string, pages: Record<string, unknown>[]) =>
  Trail.parse({ id, date, purpose: 'a trip', start: { kind: 'topic', value: 'memes' }, pages: pages.map((p) => ({ title: 'T', fetchedAt: `${date}T10:00:00Z`, ...p })) })
const put = (t: Trail) => {
  mkdirSync(join(dir, 'trails'), { recursive: true })
  writeFileSync(join(dir, 'trails', `${t.id}.json`), JSON.stringify(t))
}

describe('memeSeeds (what Merge has looked at and read, from its trails; spec 7.7, 7.8)', () => {
  it('is empty when there are no trails', () => {
    expect(memeSeeds(dir)).toEqual({ looked: [], read: [] })
  })

  it('lists the pages whose picture it looked at, with what it saw, and the Wikipedia pages it read, newest first', () => {
    put(trail('2026-11-10-1', '2026-11-10', [{ url: 'https://en.wikipedia.org/wiki/Old_meme', title: 'Old meme', look: 'a dog in a burning room' }]))
    put(trail('2026-11-12-1', '2026-11-12', [
      { url: 'https://en.wikipedia.org/wiki/Distracted_boyfriend', title: 'Distracted boyfriend', look: 'a man turning to look at another woman', reaction: 'ha' },
      { url: 'https://en.wikipedia.org/wiki/Moon', title: 'Moon' },
      { url: 'https://commons.wikimedia.org/wiki/File:X.jpg', title: 'X', look: 'a lamp' },
      { url: 'https://en.wikipedia.org/wiki/Failed', title: 'Failed', failed: 'timeout' },
    ]))
    const seeds = memeSeeds(dir)
    expect(seeds.looked.map((s) => s.url)).toEqual(['https://commons.wikimedia.org/wiki/File:X.jpg', 'https://en.wikipedia.org/wiki/Distracted_boyfriend', 'https://en.wikipedia.org/wiki/Old_meme'])
    expect(seeds.looked[1]).toEqual({ url: 'https://en.wikipedia.org/wiki/Distracted_boyfriend', title: 'Distracted boyfriend', what: 'a man turning to look at another woman' })
    expect(seeds.read.map((s) => s.url)).toEqual(['https://en.wikipedia.org/wiki/Moon', 'https://en.wikipedia.org/wiki/Distracted_boyfriend', 'https://en.wikipedia.org/wiki/Old_meme'])
  })

  it('offers at most a handful of each, and skips a trail file that does not fit its schema', () => {
    for (let i = 0; i < 12; i++) put(trail(`2026-11-${String(i + 1).padStart(2, '0')}-1`, `2026-11-${String(i + 1).padStart(2, '0')}`, [{ url: `https://en.wikipedia.org/wiki/P${i}`, title: `P${i}`, look: `picture ${i}` }]))
    writeFileSync(join(dir, 'trails', 'broken.json'), '{ nope')
    const seeds = memeSeeds(dir)
    expect(seeds.looked).toHaveLength(5)
    expect(seeds.read).toHaveLength(5)
  })
})

describe('verifyMemeSources (a meme names a format it looked at and read about)', () => {
  const seeds = {
    looked: [{ url: 'https://en.wikipedia.org/wiki/Distracted_boyfriend', title: 'Distracted boyfriend', what: 'x' }],
    read: [{ url: 'https://en.wikipedia.org/wiki/Distracted_boyfriend', title: 'Distracted boyfriend' }],
  }
  const looked = { role: 'looked' as const, url: 'https://en.wikipedia.org/wiki/Distracted_boyfriend' }
  const read = { role: 'read' as const, url: 'https://en.wikipedia.org/wiki/Distracted_boyfriend' }

  it('passes sources that are pages it really looked at and read, even the same page for both', () => {
    expect(verifyMemeSources([looked, read], seeds)).toEqual([])
  })

  it('names a source it never looked at or read', () => {
    expect(verifyMemeSources([{ role: 'looked', url: 'https://en.wikipedia.org/wiki/Invented' }, read], seeds).join(' ')).toMatch(/looked at.*Invented/)
    expect(verifyMemeSources([looked, { role: 'read', url: 'https://example.org/page' }], seeds).join(' ')).toMatch(/read.*example\.org/)
  })

  it('has nothing to pass when there are no seeds at all', () => {
    expect(verifyMemeSources([looked, read], { looked: [], read: [] }).length).toBeGreaterThan(0)
  })
})
