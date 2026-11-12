import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { beforeEach, describe, expect, it } from 'vitest'
import { withPolicy, WorkMeta } from '@forkling/schema'
import { parseChanges } from '../src/changes.ts'
import { renderSite } from '../src/render.ts'
import { SINCE_SCRIPT } from '../src/since.ts'

const merge = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const HTML = withPolicy('<!doctype html><html><head></head><body><p>hi</p></body></html>')

let world: string
let out: string
const put = (rel: string, content: string | Buffer) => {
  const full = join(world, rel)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, content)
}
const page = (rel: string) => readFileSync(join(out, rel), 'utf8')
const putWork = (id: string, over: Record<string, unknown> = {}) => {
  put(`works/${id}/meta.json`, JSON.stringify(WorkMeta.parse({ id, title: `Work ${id}`, kind: 'art', about: `About ${id}.`, interest: null, made: '2026-11-03T10:00:00Z', status: 'shelf', size: 'full', ...over })))
  put(`works/${id}/index.html`, HTML)
  put(`works/${id}/thumb.png`, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
}

beforeEach(() => {
  world = mkdtempSync(join(tmpdir(), 'feed-world-'))
  out = mkdtempSync(join(tmpdir(), 'feed-out-'))
  copyFileSync(join(merge, 'forkling.json'), join(world, 'forkling.json'))
})

describe('/feed.xml (spec 8: works shelved, diary entries)', () => {
  it('is always there, and a valid empty feed when there is nothing yet', () => {
    renderSite(world, out)
    const xml = page('feed.xml')
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/)
    expect(xml).toContain('<rss version="2.0"')
    expect(xml).toContain('<channel>')
    expect(xml).not.toContain('<item>')
  })

  it('has an item for each shelved work and each diary entry, newest first', () => {
    putWork('lamp', { title: 'A lamp', made: '2026-11-03T10:00:00Z' })
    put('journal/2026-11-04.md', '# A quiet day\n\n*2026-11-04*\n\nI watched the rock.\n')
    put('journal/2026-11-02.md', '# An older day\n\n*2026-11-02*\n\nI made tea.\n')
    renderSite(world, out)
    const xml = page('feed.xml')
    const titles = [...xml.matchAll(/<item>[\s\S]*?<title>([^<]*)<\/title>/g)].map((m) => m[1])
    expect(titles).toEqual(['A quiet day', 'Shelved: A lamp', 'An older day'])
    expect(xml).toContain('<pubDate>')
  })

  it('leaves out scraps, retired works and works that are not shown', () => {
    putWork('good', { title: 'Good' })
    putWork('bad', { title: 'Scrapped', status: 'scrap', scrapReason: 'blank' })
    putWork('away', { title: 'Away', status: 'retired', retireReason: 'enough' })
    renderSite(world, out)
    const xml = page('feed.xml')
    expect(xml).toContain('Shelved: Good')
    expect(xml).not.toMatch(/Scrapped|Away/)
  })

  it('escapes what the forkling wrote, so a title cannot break the XML', () => {
    putWork('x', { title: 'Tom & Jerry <b>"hi"</b>', about: 'a < b && c > d' })
    put('journal/2026-11-04.md', '# <script>alert(1)</script> & more\n\ntext\n')
    renderSite(world, out)
    const xml = page('feed.xml')
    expect(xml).not.toMatch(/<script>|<b>/)
    expect(xml).toContain('Tom &amp; Jerry &lt;b&gt;')
    expect(xml).toContain('a &lt; b &amp;&amp; c &gt; d')
  })

  it('links to the pages with the site address when it is known, and relatively when it is not', () => {
    putWork('lamp')
    put('journal/2026-11-04.md', '# A day\n\ntext\n')
    renderSite(world, out)
    expect(page('feed.xml')).toContain('<link>workshop/lamp.html</link>')
    const out2 = mkdtempSync(join(tmpdir(), 'feed-out2-'))
    renderSite(world, out2, { baseUrl: 'https://example.github.io/merge/' })
    const xml = readFileSync(join(out2, 'feed.xml'), 'utf8')
    expect(xml).toContain('<link>https://example.github.io/merge/workshop/lamp.html</link>')
    expect(xml).toContain('<link>https://example.github.io/merge/journal/2026-11-04.html</link>')
    expect(xml).not.toContain('<link>workshop/')
  })

  it('keeps the 50 newest items and is the same however many times it is built', () => {
    for (let d = 1; d <= 60; d++) put(`journal/2026-${d <= 30 ? '10' : '11'}-${String(((d - 1) % 30) + 1).padStart(2, '0')}.md`, `# Day ${d}\n\ntext\n`)
    renderSite(world, out)
    const xml = page('feed.xml')
    expect(xml.match(/<item>/g)).toHaveLength(50)
    const again = mkdtempSync(join(tmpdir(), 'feed-again-'))
    renderSite(world, again)
    expect(readFileSync(join(again, 'feed.xml'), 'utf8')).toBe(xml)
  })

  it('is announced in the head of every page', () => {
    renderSite(world, out)
    expect(page('index.html')).toContain('<link rel="alternate" type="application/rss+xml" title="')
    expect(page('workshop/index.html')).toContain('href="../feed.xml"')
  })
})

describe('parseChanges (spec 8: site/changes.json, from commits)', () => {
  const log = [
    '@@2026-11-03T12:00:00+01:00',
    'A\tsouvenirs/2026-11-03-a.json',
    'A\tsouvenirs/2026-11-03-b.json',
    'A\ttrails/2026-11-03-1.json',
    '@@2026-11-03T10:00:00+01:00',
    'A\tworks/lamp/index.html',
    'A\tworks/lamp/meta.json',
    'A\tworks/lamp/thumb.png',
    'A\tworks/blank/index.html',
    'A\tworks/blank/meta.json',
    'M\tmind/state.json',
    '@@2026-11-02T09:00:00+01:00',
    'A\tjournal/2026-11-02.md',
    'A\tnotebook/writing/2026-11-02-0900-the-lamp.md',
    'M\tworks/lamp/meta.json',
    'D\tworks/old/thumb.png',
  ].join('\n')

  it('says what changed in plain words, newest first, with when', () => {
    const changes = parseChanges(log, { titleOf: (id) => (id === 'lamp' ? 'A lamp' : undefined) })
    expect(changes.map((c) => c.text)).toEqual(['kept 2 souvenirs', 'went on a trip', 'shelved a work: A lamp', 'wrote a diary entry', 'wrote something'])
    expect(changes[0]).toMatchObject({ at: '2026-11-03T11:00:00.000Z' })
    expect(changes[2]!.href).toBe('workshop/lamp.html')
  })

  it('counts a work as shelved by its thumbnail, so a scrap and a change of status are not', () => {
    const changes = parseChanges(log, { titleOf: () => undefined })
    expect(changes.filter((c) => c.text.startsWith('shelved'))).toHaveLength(1)
  })

  it('ignores the files that change on every tick', () => {
    expect(parseChanges(['@@2026-11-03T10:00:00Z', 'M\tmind/state.json', 'M\tmind/health.json', 'A\tmemory/stream/2026-11-03.jsonl', 'M\tforkling.json'].join('\n'), { titleOf: () => undefined })).toEqual([])
  })

  it('is empty for an empty log, and keeps the newest 50', () => {
    expect(parseChanges('', { titleOf: () => undefined })).toEqual([])
    const many = Array.from({ length: 70 }, (_, i) => `@@2026-10-${String((i % 28) + 1).padStart(2, '0')}T10:00:00Z\nA\tjournal/x${i}.md`).join('\n')
    expect(parseChanges(many, { titleOf: () => undefined })).toHaveLength(50)
  })
})

describe('changes.json is written beside the pages', () => {
  it('holds the changes the log gives, using the titles of the works that are there', () => {
    putWork('lamp', { title: 'A lamp' })
    const gitLog = () => ['@@2026-11-03T10:00:00Z', 'A\tworks/lamp/thumb.png'].join('\n')
    renderSite(world, out, { gitLog })
    expect(JSON.parse(page('changes.json'))).toEqual([{ at: '2026-11-03T10:00:00.000Z', text: 'shelved a work: A lamp', href: 'workshop/lamp.html' }])
  })

  it('is an empty list when there is no history to read', () => {
    renderSite(world, out, { gitLog: () => { throw new Error('not a repository') } })
    expect(JSON.parse(page('changes.json'))).toEqual([])
  })

  it('the home page has the panel and the script that fills it', () => {
    renderSite(world, out)
    expect(page('index.html')).toContain('id="since"')
    expect(page('index.html')).toMatch(/<script src="since\.js"/)
    expect(existsSync(join(out, 'since.js'))).toBe(true)
    expect(page('since.js')).toBe(SINCE_SCRIPT)
    expect(page('workshop/index.html')).not.toContain('id="since"')
  })
})

/** Runs the real script against a fake page: a store, a few elements and a changes.json. */
function run(o: { stored?: string | null; changes?: unknown[]; blocked?: boolean; fail?: boolean; now?: string }) {
  const log: string[] = []
  const store: Record<string, string> = o.stored != null ? { 'forkling:lastVisit': o.stored } : {}
  const items: { textContent: string; href?: string }[] = []
  const box = { hidden: true, querySelector: () => list, ownerDocument: undefined as unknown }
  const list = { appendChild: (el: { textContent: string }) => items.push(el), replaceChildren: () => (items.length = 0) }
  const document = {
    currentScript: { dataset: { root: '' } },
    getElementById: (id: string) => (id === 'since' ? box : null),
    createElement: (tag: string) => ({ tag, textContent: '', href: '', appendChild(child: { textContent: string }) { this.textContent += child.textContent } }),
  }
  const localStorage = {
    getItem: (k: string) => { if (o.blocked) throw new Error('blocked'); return store[k] ?? null },
    setItem: (k: string, v: string) => { if (o.blocked) throw new Error('blocked'); store[k] = v; log.push(`set ${k}`) },
  }
  class FakeDate extends Date {
    constructor(...a: unknown[]) { super(...((a.length ? a : [o.now ?? '2026-11-05T12:00:00Z']) as [string])) }
  }
  const fetch = async (url: string) => {
    log.push(`fetch ${url}`)
    if (o.fail) throw new Error('offline')
    return { ok: true, json: async () => o.changes ?? [] }
  }
  vm.runInNewContext(SINCE_SCRIPT, { document, window: { localStorage }, localStorage, fetch, Date: FakeDate, Promise, JSON, Array, console })
  return { box, items, store, log, settle: () => new Promise((r) => setTimeout(r, 10)) }
}

describe('the "since your last visit" panel (spec 8)', () => {
  const changes = Array.from({ length: 10 }, (_, i) => ({ at: `2026-11-0${(i % 4) + 1}T10:00:00.000Z`, text: `change ${i}`, href: `workshop/w${i}.html` })).sort((a, b) => b.at.localeCompare(a.at))

  it('lists up to 8 changes after the stored time, and shows the panel', async () => {
    const r = run({ stored: '2026-10-30T00:00:00.000Z', changes })
    await r.settle()
    expect(r.box.hidden).toBe(false)
    expect(r.items).toHaveLength(8)
  })

  it('lists only what is newer than the last visit', async () => {
    const r = run({ stored: '2026-11-03T10:00:00.000Z', changes })
    await r.settle()
    expect(r.items.every((i) => /change \d/.test(i.textContent))).toBe(true)
    expect(r.items.length).toBeLessThan(8)
    expect(r.items.length).toBeGreaterThan(0)
  })

  it('remembers this visit for next time', async () => {
    const r = run({ stored: '2026-10-30T00:00:00.000Z', changes, now: '2026-11-05T12:00:00Z' })
    await r.settle()
    expect(r.store['forkling:lastVisit']).toBe('2026-11-05T12:00:00.000Z')
  })

  it('has nothing to show the first time, and just notes the visit', async () => {
    const r = run({ stored: null, changes })
    await r.settle()
    expect(r.box.hidden).toBe(true)
    expect(r.items).toHaveLength(0)
    expect(r.store['forkling:lastVisit']).toBeTruthy()
  })

  it('hides the panel when nothing changed', async () => {
    const r = run({ stored: '2026-12-01T00:00:00.000Z', changes })
    await r.settle()
    expect(r.box.hidden).toBe(true)
  })

  it('hides the panel and stops when the browser blocks its store, without an error', async () => {
    const r = run({ blocked: true, changes })
    await r.settle()
    expect(r.box.hidden).toBe(true)
    expect(r.log.filter((l) => l.startsWith('fetch'))).toEqual([])
  })

  it('stays hidden, and does not mark the visit, when changes.json cannot be read', async () => {
    const r = run({ stored: '2026-10-30T00:00:00.000Z', fail: true })
    await r.settle()
    expect(r.box.hidden).toBe(true)
    expect(r.store['forkling:lastVisit']).toBe('2026-10-30T00:00:00.000Z')
  })

  it('writes only text into the page, never markup', () => {
    expect(SINCE_SCRIPT).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/)
    expect(SINCE_SCRIPT).toMatch(/textContent/)
  })
})
