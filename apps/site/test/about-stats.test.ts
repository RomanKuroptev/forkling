import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { Note } from '@forkling/schema'
import { renderSite } from '../src/render.ts'
import { splitHero, statTiles } from '../src/self.ts'

/** Step 7C: the who-am-i page's tiles, from numbers the world repo already has. */

const merge = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const NOW = new Date('2026-11-18T10:00:00Z')

let world: string
let out: string
const put = (rel: string, content: string) => {
  const full = join(world, rel)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, content)
}

beforeEach(() => {
  world = mkdtempSync(join(tmpdir(), 'as-world-'))
  out = mkdtempSync(join(tmpdir(), 'as-out-'))
  copyFileSync(join(merge, 'forkling.json'), join(world, 'forkling.json'))
})

describe('statTiles', () => {
  it('shows only the tiles that have a value, with singular words, and escapes the topic', () => {
    expect(statTiles({ alive: 1, made: 0, into: null, visitors: 0 })).toBe('<div class="stats"><div class="stat"><span>alive</span><strong>1 day</strong></div></div>')
    const all = statTiles({ alive: 18, made: 41, into: '<b>toasters</b>', visitors: 23 })
    expect(all).toContain('18 days')
    expect(all).toContain('41 things')
    expect(all).toContain('&lt;b&gt;toasters&lt;/b&gt;')
    expect(all).toContain('visitors met')
    expect(statTiles({ alive: 0, made: 0, into: null, visitors: 0 })).toBe('')
  })
})

describe('splitHero', () => {
  it('takes Merge\'s first sentence as the hero and leaves the rest, dropping a leading heading', () => {
    expect(splitHero('# About me\n\nI am Merge. I make things.\n\n- kind\n')).toEqual({ hero: 'I am Merge.', rest: 'I make things.\n\n- kind' })
    expect(splitHero('no end mark here')).toEqual({ hero: '', rest: 'no end mark here' })
    expect(splitHero(`${'x'.repeat(250)}. y`).hero).toBe('')
  })
})

describe('/about/ tiles', () => {
  it('counts days alive from the first diary entry and visitors met as distinct given names of visible notes', () => {
    put('self/about.md', 'I am Merge.\n\n- patient\n')
    put('journal/2026-11-09.md', '# First\n\ntext\n')
    for (const [id, name] of [['n-a', 'Kim'], ['n-b', 'kim'], ['n-c', 'Anna'], ['n-d', 'A visitor']] as const) {
      put(`notes/${id}.json`, JSON.stringify(Note.parse({ id, name, message: 'hi', placeId: 'home', topics: [], at: '2026-11-16T09:00:00Z', status: 'found', foundAt: '2026-11-16T10:00:00Z' })))
    }
    renderSite(world, out, { now: NOW })
    const html = readFileSync(join(out, 'about/index.html'), 'utf8')
    expect(html).toContain('10 days')
    expect(html).toMatch(/visitors met<\/span><strong>2<\/strong>/)
    expect(html).toContain('<div class="about-body">')
  })
})
