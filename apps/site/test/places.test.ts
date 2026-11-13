import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { withPolicy, WorkMeta } from '@forkling/schema'
import { makeFixtureWorld } from '@forkling/sim/fixture'
import { renderSite } from '../src/render.ts'

const merge = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const templateWorld = fileURLToPath(new URL('../../../templates/forkling-world', import.meta.url))
const HTML = withPolicy('<!doctype html><html><head><meta charset="utf-8"><title>w</title></head><body><p>hello</p></body></html>')
const NOW = new Date('2026-11-20T12:00:00Z')

let world: string
let out: string
const put = (rel: string, content: string) => {
  const full = join(world, rel)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, content)
}
const page = (rel: string) => readFileSync(join(out, rel), 'utf8')
const template = (id: string) => JSON.parse(readFileSync(join(templateWorld, 'places', `${id}.json`), 'utf8'))
const putPlace = (id: string, over: Record<string, unknown> = {}) => put(`places/${id}.json`, JSON.stringify({ ...template(id === 'home' || id === 'workshop' ? id : 'home'), id, ...over }))
const render = (gitLog = '') => renderSite(world, out, { now: NOW, gitLog: () => gitLog })

const fogSouvenir = { id: '2026-11-02-fog', kind: 'quote', content: 'fog, fog, fog', why: 'it repeats', source: { url: 'https://en.wikipedia.org/wiki/Fog', title: 'Fog', fetchedAt: '2026-11-02T10:00:00Z' }, topics: [], licence: null, placedIn: 'home' }
const imageSouvenir = { id: '2026-11-02-moth', kind: 'image', content: 'https://upload.wikimedia.org/moth.jpg', why: 'its eyes', source: { url: 'https://commons.wikimedia.org/wiki/Moth', title: 'Moth', fetchedAt: '2026-11-02T10:00:00Z' }, topics: [], licence: 'CC BY', credit: 'A. Photographer', placedIn: 'home' }

beforeEach(() => {
  world = mkdtempSync(join(tmpdir(), 'places-world-'))
  out = mkdtempSync(join(tmpdir(), 'places-out-'))
  copyFileSync(join(merge, 'forkling.json'), join(world, 'forkling.json'))
})

describe('a world without places (before migrate-w5) has no place pages and no link to them', () => {
  it('writes nothing under /places/ and keeps the old navigation', () => {
    render()
    expect(existsSync(join(out, 'places'))).toBe(false)
    expect(page('index.html')).not.toMatch(/href="places\//)
  })
})

describe('/places/ (spec 8: a map of the chunks with neglect and last change, and a list)', () => {
  beforeEach(() => {
    putPlace('home', { state: { construction: null, lastCareAt: '2026-11-19T10:00:00Z', neglect: 0, lamps: true }, history: [{ at: '2026-11-19T10:00:00Z', verb: 'tend', summary: 'Put the fog on the shelf.' }] })
    putPlace('workshop', { state: { construction: null, lastCareAt: '2026-10-01T10:00:00Z', neglect: 0, lamps: true } })
    putPlace('house-of-lights', { name: 'House of Lights', chunk: [1, 0], offset: [0, 0], state: { construction: null, lastCareAt: '2026-10-01T10:00:00Z', neglect: 0, lamps: false }, history: [{ at: '2026-10-01T10:00:00Z', verb: 'found', summary: 'Built for the lamps.' }] })
  })
  it('lists every place with its purpose, tags, last change and a link, and is in the navigation of every page', () => {
    render()
    const index = page('places/index.html')
    for (const name of ['Home', 'Workshop', 'House of Lights']) expect(index).toContain(name)
    expect(index).toContain('href="home/"')
    expect(index).toContain('href="house-of-lights/"')
    expect(index).toContain('Put the fog on the shelf.')
    expect(index).toMatch(/Where my days start and end/)
    expect(page('index.html')).toMatch(/href="places\/"/)
    expect(page('journal/index.html')).toMatch(/href="..\/places\/"/)
  })
  it('draws a top-down map with a square for each chunk a place stands on, marked with its neglect level', () => {
    render()
    const index = page('places/index.html')
    expect(index).toMatch(/<svg[^>]*role="img"/)
    expect((index.match(/<rect[^>]*data-place="/g) ?? []).length).toBe(3)
    // Home was cared for yesterday (0); Home and Workshop never fall past 1; the House of Lights has gone 50 days (3).
    expect(index).toMatch(/data-place="house-of-lights"[^>]*data-neglect="3"/)
    expect(index).toMatch(/data-place="home"[^>]*data-neglect="0"/)
    expect(index).toMatch(/data-place="workshop"[^>]*data-neglect="1"/)
  })
})

describe('/places/<id>/ (the place as a page)', () => {
  beforeEach(() => {
    putPlace('home', {
      related: ['workshop'],
      exhibits: [
        { id: 'fog', kind: 'souvenir', ref: 'souvenirs/2026-11-02-fog', slot: 'main/3/0', label: 'Fog for nine days.', added: '2026-11-03' },
        { id: 'moth', kind: 'souvenir', ref: 'souvenirs/2026-11-02-moth', slot: 'main/8/0', label: 'A moth.', added: '2026-11-03' },
        { id: 'sea', kind: 'plaque', ref: 'notebook/writing/2026-11-03-sea.md', slot: 'main/3/1', label: 'On the sea.', added: '2026-11-03' },
        { id: 'clock', kind: 'work', ref: 'works/signal-clock', slot: 'main/3/2', label: 'A clock.', added: '2026-11-03' },
      ],
      history: [
        { at: '2026-11-01T10:00:00Z', verb: 'found', summary: 'Given to Merge before it woke.' },
        { at: '2026-11-03T10:00:00Z', verb: 'tend', summary: 'Put the fog on the shelf.' },
      ],
    })
    putPlace('workshop')
    put('souvenirs/2026-11-02-fog.json', JSON.stringify(fogSouvenir))
    put('souvenirs/2026-11-02-moth.json', JSON.stringify(imageSouvenir))
    put('notebook/writing/2026-11-03-sea.md', '# The Sea\n\nSalt and **grey**.\n')
    put('works/signal-clock/meta.json', JSON.stringify(WorkMeta.parse({ id: 'signal-clock', title: 'Signal clock', kind: 'art', about: 'A clock.', interest: null, made: '2026-11-03T10:00:00Z', status: 'shelf', size: 'full' })))
    put('works/signal-clock/index.html', HTML)
  })

  it('shows name, purpose, tags, the neglect and the history, newest first', () => {
    render()
    const home = page('places/home/index.html')
    expect(home).toContain('<h1>Home</h1>')
    expect(home).toContain('Where my days start and end')
    expect(home.indexOf('Put the fog on the shelf.')).toBeLessThan(home.indexOf('Given to Merge before it woke.'))
    expect(home).toMatch(/Back to the places|href="\.\.\/"/)
  })
  it('shows a souvenir with its words, why, and its source as a link, and an image with its credit and licence', () => {
    render()
    const home = page('places/home/index.html')
    expect(home).toContain('Fog for nine days.')
    expect(home).toContain('fog, fog, fog')
    expect(home).toMatch(/href="https:\/\/en\.wikipedia\.org\/wiki\/Fog"/)
    expect(home).toContain('CC BY')
    expect(home).toContain('A. Photographer')
  })
  it('shows a plaque as the page it points at, and a work in the sandbox (scripts, nothing else)', () => {
    render()
    const home = page('places/home/index.html')
    expect(home).toContain('Salt and <strong>grey</strong>.')
    expect(home).toMatch(/<iframe[^>]*sandbox="allow-scripts"[^>]*src="\.\.\/\.\.\/works\/signal-clock\/index\.html"/)
    expect(home).not.toMatch(/allow-same-origin/)
  })
  it('links the places it is related to, and the Workshop page lists every shelved work for its terminal', () => {
    render()
    expect(page('places/home/index.html')).toMatch(/href="\.\.\/workshop\/"/)
    expect(page('places/workshop/index.html')).toMatch(/signal-clock/)
  })
  it('takes its accent colour from the place palette, and nothing else of the style attribute is from the file', () => {
    render()
    expect(page('places/home/index.html')).toMatch(/style="--accent: #[0-9a-fA-F]{6}"/)
  })
  it('leaves out an exhibit whose file is gone instead of failing, and says only its label', () => {
    putPlace('home', { exhibits: [{ id: 'fog', kind: 'souvenir', ref: 'souvenirs/gone', slot: 'main/3/0', label: 'Lost fog.', added: '2026-11-03' }] })
    expect(() => render()).not.toThrow()
    expect(page('places/home/index.html')).toContain('Lost fog.')
  })
  it('escapes what the files say', () => {
    putPlace('home', { name: 'Home <script>alert(1)</script>', purpose: 'a <b>b</b>' })
    render()
    const home = page('places/home/index.html')
    expect(home).not.toContain('<script>alert(1)</script>')
    expect(home).toContain('&lt;script&gt;')
  })
})

describe('places in the feed and in changes.json (spec 8)', () => {
  beforeEach(() => {
    putPlace('home', { history: [{ at: '2026-11-03T10:00:00Z', verb: 'tend', summary: 'Put the fog on the shelf.' }, { at: '2026-11-04T10:00:00Z', verb: 'install', summary: 'Put a clock on a screen.' }] })
    putPlace('house-of-lights', { name: 'House of Lights', history: [{ at: '2026-11-05T10:00:00Z', verb: 'expand', summary: 'A lamp room.' }] })
  })
  it('puts what was done to a place in the feed, with a link to its page', () => {
    render()
    const feed = page('feed.xml')
    expect(feed).toContain('Tended Home')
    expect(feed).toContain('Expanded House of Lights')
    expect(feed).toMatch(/places\/house-of-lights\//)
  })
  it('says "tended Home" and "expanded House of Lights" in changes.json for the commits that wrote them, not for an install', () => {
    const log = ['@@2026-11-05T10:00:30Z', 'M\tplaces/house-of-lights.json', '@@2026-11-03T10:00:20Z', 'M\tplaces/home.json', '@@2026-11-04T10:00:10Z', 'M\tplaces/home.json'].join('\n')
    render(log)
    const changes = JSON.parse(page('changes.json')) as { text: string; href?: string }[]
    expect(changes.map((c) => c.text)).toEqual(['expanded House of Lights', 'tended Home'])
    expect(changes[0]!.href).toBe('places/house-of-lights/')
  })
})

describe('the fixture world of ten places renders every page', () => {
  it('gives /places/ and one page for each place', () => {
    const fixture = makeFixtureWorld(1, 10)
    for (const place of fixture.places) put(`places/${place.id}.json`, JSON.stringify(place))
    render()
    expect(page('places/index.html')).toContain('<svg')
    for (const place of fixture.places) expect(existsSync(join(out, 'places', place.id, 'index.html')), place.id).toBe(true)
  })
})
