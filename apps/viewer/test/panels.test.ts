import { describe, expect, it } from 'vitest'
import { Place, PlaceRequest, Souvenir, WorkMeta } from '@forkling/schema'
import { makeFixtureWorld } from '@forkling/sim/fixture'
import { galleryPanel, noteOnly, plaquePanel, plotPanel, safeUrl, signPanel, siteBase, souvenirPanel, workPanel } from '../src/world/panelContent.ts'
import { loadPanel, worldFiles, type WorldFiles } from '../src/world/worldData.ts'
import { LOCAL_REF } from '../src/world/localWorld.ts'

const ref = { owner: 'RomanKuroptev', repo: 'merge' }
const base = 'https://romankuroptev.github.io/merge/'

const source = { url: 'https://en.wikipedia.org/wiki/Lighthouse', title: 'Lighthouse', fetchedAt: '2026-11-18T10:00:00Z' }
const quote = Souvenir.parse({ id: 'q', kind: 'quote', content: 'fog, fog, fog', why: 'it repeats', source })
const fact = Souvenir.parse({ id: 'f', kind: 'fact', content: 'A lighthouse has a lamp.', evidence: 'The lamp sits in the lantern room.', why: 'basic', source })
const image = Souvenir.parse({ id: 'i', kind: 'image', content: 'https://upload.wikimedia.org/a.jpg', licence: 'CC BY', credit: 'A Photographer', why: 'pretty', source })
const work = (over: Record<string, unknown> = {}) =>
  WorkMeta.parse({ id: 'signal-clock', title: 'Signal clock', kind: 'art', about: 'A clock made of signals.', interest: null, made: '2026-11-20T12:00:00Z', remixOf: null, constraint: null, status: 'shelf', size: 'full', installedIn: null, libraries: [], sources: [], ...over })
const place = Place.parse(makeFixtureWorld(1, 10).places[3])

describe('what a visitor may be sent to (the text comes from the web, so it is data)', () => {
  it('links only to https addresses', () => {
    expect(safeUrl('https://example.org/a')).toBe('https://example.org/a')
    expect(safeUrl('http://example.org/a')).toBeNull()
    expect(safeUrl('javascript:alert(1)')).toBeNull()
    expect(safeUrl('data:text/html,<script>1</script>')).toBeNull()
    expect(safeUrl('//example.org/a')).toBeNull()
    expect(safeUrl('not a url')).toBeNull()
  })
  it('finds the address of a world\'s site, and none for a world made up in the browser', () => {
    expect(siteBase(ref)).toBe(base)
    expect(siteBase(LOCAL_REF)).toBeNull()
  })
})

describe('the panel of a souvenir (spec 4.6: the souvenir with its source link)', () => {
  it('shows a quote with where it came from', () => {
    const p = souvenirPanel(quote)
    expect(p).toMatchObject({ kind: 'souvenir', text: 'fog, fog, fog', why: 'it repeats', source: { title: 'Lighthouse', url: 'https://en.wikipedia.org/wiki/Lighthouse' } })
  })
  it('shows a fact with the excerpt it rests on', () => {
    expect(souvenirPanel(fact)).toMatchObject({ kind: 'souvenir', text: 'A lighthouse has a lamp.', evidence: 'The lamp sits in the lantern room.' })
  })
  it('shows a picture with its credit and licence, and never an address that is not https', () => {
    expect(souvenirPanel(image)).toMatchObject({ kind: 'souvenir', image: { url: 'https://upload.wikimedia.org/a.jpg', credit: 'A Photographer', licence: 'CC BY' } })
    const bad = souvenirPanel({ ...image, content: 'javascript:alert(1)', source: { ...source, url: 'javascript:alert(2)' } })
    expect(bad).toMatchObject({ image: { url: null }, source: { title: 'Lighthouse', url: null } })
  })
})

describe('the panel of a work (spec 4.6, 7.4: the work, sandboxed)', () => {
  it('is the work\'s page in an iframe that may run scripts and nothing else', () => {
    const p = workPanel(work(), base)
    expect(p.kind).toBe('work')
    if (p.kind !== 'work') return
    expect(p.frameHtml).toContain('sandbox="allow-scripts"')
    expect(p.frameHtml).not.toContain('allow-same-origin')
    expect(p.frameHtml).toContain(`src="${base}works/signal-clock/index.html"`)
    expect(p.frameHtml).toContain('referrerpolicy="no-referrer"')
    expect(p.about).toBe('A clock made of signals.')
  })
  it('has no frame in a world with no site, and says so', () => {
    const p = workPanel(work(), null)
    expect(p.kind === 'work' && p.frameHtml).toBeNull()
  })
})

describe('the other panels', () => {
  it('shows a plaque\'s words without its title line', () => {
    expect(plaquePanel('On fog', '# On fog\n\nFog is the lighthouse\'s weather.\n')).toEqual({ kind: 'plaque', heading: 'On fog', text: "Fog is the lighthouse's weather." })
  })
  it('lists the shelved works, newest first, and not the scrap or the retired', () => {
    const metas = [work({ id: 'old', title: 'Old', made: '2026-11-10T00:00:00Z' }), work({ id: 'new', title: 'New', made: '2026-11-21T00:00:00Z' }), work({ id: 'bin', status: 'scrap', scrapReason: 'broke' }), work({ id: 'away', status: 'retired', retireReason: 'done' })]
    const p = galleryPanel(metas, base)
    expect(p.kind === 'gallery' && p.works.map((w) => w.id)).toEqual(['new', 'old'])
    expect(p.kind === 'gallery' && p.works[0]!.url).toBe(`${base}works/new/index.html`)
  })
  it('shows a place\'s sign as its history, newest first, with its page', () => {
    const p = signPanel({ ...place, history: [{ at: '2026-11-12T10:00:00+01:00', verb: 'found', summary: 'Founded.' }, { at: '2026-11-20T10:00:00+01:00', verb: 'tend', summary: 'Tidied.' }] }, base)
    expect(p).toMatchObject({ kind: 'sign', heading: place.exterior.sign || place.name, founded: place.founded, pageUrl: `${base}places/${place.id}/` })
    expect(p.kind === 'sign' && p.history.map((h) => h.summary)).toEqual(['Tidied.', 'Founded.'])
  })
  it('has a plain note for anything it cannot open', () => {
    expect(noteOnly('Gone', 'It is not here.')).toEqual({ kind: 'note', heading: 'Gone', text: 'It is not here.' })
  })
})

describe('opening a panel loads one file at the world\'s commit, and fails softly', () => {
  const fake = (files: Record<string, unknown>): WorldFiles & { asked: string[] } => {
    const asked: string[] = []
    return {
      asked,
      json: async (path) => (asked.push(path), path in files ? files[path] : null),
      text: async (path) => (asked.push(path), typeof files[path] === 'string' ? (files[path] as string) : null),
    }
  }
  const world = { ref, workIds: ['signal-clock', 'broken', 'scrapped'] }
  const exhibit = (kind: string, refPath: string | null) => ({ id: 'e', kind, ref: refPath, slot: 'main/0/0', label: 'L', added: '2026-11-18' }) as never

  it('reads a souvenir by its ref', async () => {
    const files = fake({ 'souvenirs/q.json': quote })
    const p = await loadPanel({ kind: 'exhibit', place, exhibit: exhibit('souvenir', 'souvenirs/q') }, { world, files })
    expect(files.asked).toEqual(['souvenirs/q.json'])
    expect(p).toMatchObject({ kind: 'souvenir', text: 'fog, fog, fog' })
  })
  it('says so when a file is missing, does not fit, or the world has none to read', async () => {
    const gone = await loadPanel({ kind: 'exhibit', place, exhibit: exhibit('souvenir', 'souvenirs/q') }, { world, files: fake({}) })
    expect(gone.kind).toBe('note')
    const odd = await loadPanel({ kind: 'exhibit', place, exhibit: exhibit('souvenir', 'souvenirs/q') }, { world, files: fake({ 'souvenirs/q.json': { id: 'q' } }) })
    expect(odd.kind).toBe('note')
    const fixture = await loadPanel({ kind: 'exhibit', place, exhibit: exhibit('work', 'works/signal-clock') }, { world: { ref: LOCAL_REF, workIds: [] }, files: worldFiles({ ref: LOCAL_REF, sha: 'fixture' }, async () => new Response('nope')) })
    expect(fixture).toMatchObject({ kind: 'note' })
  })
  it('reads a work\'s meta and shows its page', async () => {
    const files = fake({ 'works/signal-clock/meta.json': work() })
    const p = await loadPanel({ kind: 'exhibit', place, exhibit: exhibit('work', 'works/signal-clock') }, { world, files })
    expect(files.asked).toEqual(['works/signal-clock/meta.json'])
    expect(p.kind === 'work' && p.frameHtml).toContain(`${base}works/signal-clock/index.html`)
  })
  it('reads a plaque\'s text', async () => {
    const p = await loadPanel({ kind: 'exhibit', place, exhibit: exhibit('plaque', 'notebook/writing/2026-11-19-fog.md') }, { world, files: fake({ 'notebook/writing/2026-11-19-fog.md': '# Fog\n\nIt came in.' }) })
    expect(p).toMatchObject({ kind: 'plaque', heading: 'Fog', text: 'It came in.' })
  })
  it('opens the gallery with every shelved work, skipping the ones that do not load or are not on the shelf', async () => {
    const files = fake({ 'works/signal-clock/meta.json': work(), 'works/scrapped/meta.json': work({ id: 'scrapped', status: 'scrap', scrapReason: 'broke' }) })
    const p = await loadPanel({ kind: 'exhibit', place, exhibit: exhibit('gallery', null) }, { world, files })
    expect(p.kind === 'gallery' && p.works.map((w) => w.id)).toEqual(['signal-clock'])
  })
  it('links a trail to its page on the site', async () => {
    const p = await loadPanel({ kind: 'exhibit', place, exhibit: exhibit('trail', 'trails/2026-11-18-1') }, { world, files: fake({}) })
    expect(p).toMatchObject({ kind: 'trail', url: `${base}trails/2026-11-18-1/` })
  })
  it('opens a sign from the place alone, with no file to read', async () => {
    const files = fake({})
    const p = await loadPanel({ kind: 'sign', place }, { world, files })
    expect(files.asked).toEqual([])
    expect(p.kind).toBe('sign')
  })
  it('fetches raw files at the commit, and nothing in a world made up in the browser', async () => {
    const asked: string[] = []
    const files = worldFiles({ ref, sha: 'abc123' }, async (url) => (asked.push(String(url)), new Response(JSON.stringify({ ok: 1 }))))
    expect(await files.json('souvenirs/q.json')).toEqual({ ok: 1 })
    expect(asked).toEqual(['https://raw.githubusercontent.com/RomanKuroptev/merge/abc123/souvenirs/q.json'])
    const none = worldFiles({ ref: LOCAL_REF, sha: 'fixture' }, async () => { throw new Error('no network') })
    expect(await none.json('x.json')).toBeNull()
    const failing = worldFiles({ ref, sha: 'abc123' }, async () => new Response('x', { status: 404 }))
    expect(await failing.json('x.json')).toBeNull()
    expect(await failing.text('x.md')).toBeNull()
  })
})

describe('the panel of a staked plot (W6 slice 8, spec 10.3: visitors see what Merge is waiting for)', () => {
  const req = (over: Record<string, unknown> = {}) =>
    PlaceRequest.parse({ id: 'lantern-hall', kind: 'place', name: 'Lantern Hall', purpose: 'Where the lidar finds hold up.', tags: ['maya lidar', 'sand'], chunk: [1, 0], related: ['home'], souvenirs: ['s1', 's2'], written: '2026-11-14T10:00:00Z', status: 'open', statusAt: null, note: null, body: 'I want a lamp over each find.', ...over })

  it('says what Merge asked for, in its own words, and that it is waiting for Roman', () => {
    const p = plotPanel(req())
    expect(p).toMatchObject({ kind: 'plot', heading: 'Lantern Hall', purpose: 'Where the lidar finds hold up.', tags: ['maya lidar', 'sand'], body: 'I want a lamp over each find.', souvenirs: 2, written: '2026-11-14' })
    expect(p.kind === 'plot' && p.status).toMatch(/waiting for Roman/i)
  })

  it('says when Roman has said he is building it, and does not show his note (it is not for the visitor to see as the plot\'s words)', () => {
    const p = plotPanel(req({ status: 'building', statusAt: '2026-11-15T10:00:00Z', note: 'Two rooms.' }))
    expect(p.kind === 'plot' && p.status).toMatch(/building/i)
    expect(JSON.stringify(p)).not.toContain('Two rooms.')
  })
})
