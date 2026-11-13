import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WorkMeta } from '@forkling/schema'
import type { WorkChecker } from '../src/builds/browser-check.ts'
import { withPolicy } from '../src/builds/sandbox.ts'
import { listChanges, parseNameStatus, validatePullRequest, type Change } from '../src/validate-pr.ts'
import { Trail } from '@forkling/schema'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
const HTML = withPolicy('<!doctype html><html><head><meta charset="utf-8"><title>t</title></head><body><script src="../../lib/p5.min.js"></script><script>function setup(){createCanvas(480,360)} function draw(){background(20)}</script></body></html>')
const meta = (over: Record<string, unknown> = {}) =>
  WorkMeta.parse({ id: 'a-lamp', title: 'A lamp', kind: 'art', about: 'A lamp.', interest: null, made: '2026-11-14T10:00:00Z', status: 'shelf', size: 'full', libraries: ['p5'], ...over })

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'validate-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const put = (rel: string, content: string | Buffer) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true })
  writeFileSync(join(dir, rel), content)
}
const putWork = (id = 'a-lamp', o: { meta?: Record<string, unknown>; html?: string; thumb?: Buffer | null } = {}) => {
  put(`works/${id}/index.html`, o.html ?? HTML)
  put(`works/${id}/meta.json`, JSON.stringify(meta({ id, ...o.meta })))
  if (o.thumb !== null) put(`works/${id}/thumb.png`, o.thumb ?? PNG)
}
const added = (...paths: string[]): Change[] => paths.map((path) => ({ status: 'A', path }))
const work = (id = 'a-lamp') => added(`works/${id}/index.html`, `works/${id}/meta.json`, `works/${id}/thumb.png`)

const checker = (ok = true, reasons: string[] = []): WorkChecker & { pages: string[] } => {
  const pages: string[] = []
  return {
    pages,
    async check(html) {
      pages.push(html)
      return { ok, reasons, thumb: ok ? PNG : null }
    },
    available: async () => true,
    close: async () => undefined,
  }
}
const run = (changes: Change[], o: { checker?: WorkChecker | null; branch?: string } = {}) =>
  validatePullRequest({ world: dir, changes, checker: o.checker === null ? undefined : (o.checker ?? checker()), ...(o.branch ? { branch: o.branch } : {}) })

describe('parseNameStatus (git diff --name-status)', () => {
  it('reads added, modified and deleted files, and a rename as a delete and an add', () => {
    expect(parseNameStatus('A\tworks/a/index.html\nM\tplaces/home.json\nD\twishes/x.json\nR100\tworks/old/index.html\tworks/new/index.html\n')).toEqual([
      { status: 'A', path: 'works/a/index.html' },
      { status: 'M', path: 'places/home.json' },
      { status: 'D', path: 'wishes/x.json' },
      { status: 'D', path: 'works/old/index.html' },
      { status: 'A', path: 'works/new/index.html' },
    ])
    expect(parseNameStatus('')).toEqual([])
  })

  it('lists the changes between two commits through an injected git', async () => {
    const asked: string[][] = []
    const changes = await listChanges(async (args) => (asked.push([...args]), { code: 0, stdout: 'A\tworks/a/index.html\n' }), 'base1', 'head1')
    expect(changes).toEqual([{ status: 'A', path: 'works/a/index.html' }])
    expect(asked[0]).toEqual(['diff', '--name-status', '--no-renames', 'base1...head1'])
  })

  it('says so when git fails', async () => {
    await expect(listChanges(async () => ({ code: 128, stdout: '' }), 'a', 'b')).rejects.toThrow(/git diff/)
  })
})

describe('what a pull request may change (spec 11.1)', () => {
  it('passes a work and nothing else', async () => {
    putWork()
    expect(await run(work())).toEqual({ ok: true, problems: [] })
  })

  it('refuses any path outside places/, works/ and wishes/', async () => {
    for (const path of ['self/seed.md', 'brain/budget.json', 'memory/stream/x.jsonl', 'mind/state.json', 'forkling.json', '.github/workflows/mind.yml', 'CLAUDE.md', 'notes/n.json']) {
      const r = await run(added(path))
      expect(r.ok, path).toBe(false)
      expect(r.problems.join(' ')).toContain(path)
    }
  })

  it('refuses a path that climbs out of an allowed folder', async () => {
    expect((await run(added('works/../self/seed.md'))).ok).toBe(false)
  })

  it('wants a wish and a place to be JSON that parses', async () => {
    put('wishes/lamp.json', '{ nope')
    put('places/house.json', 'nope')
    for (const path of ['wishes/lamp.json', 'places/house.json']) {
      const bad = await run(added(path))
      expect(bad.ok, path).toBe(false)
      expect(bad.problems.join(' ')).toMatch(/not valid JSON/)
    }
  })
})

describe('a place or a wish in a pull request (spec 5.2, 10.3)', () => {
  const home = JSON.parse(readFileSync(new URL('../../../templates/forkling-world/places/home.json', import.meta.url), 'utf8')) as Record<string, any>
  const wish = { id: 'spiral-staircase', name: 'Spiral staircase', description: 'A staircase that turns.', forPlace: null, count: 1, written: '2026-11-21T10:00:00Z', status: 'open', statusAt: null, note: null }
  const putPlace = (id: string, over: Record<string, unknown> = {}) => put(`places/${id}.json`, JSON.stringify({ ...home, id, ...over }))

  it('passes a place that fits spec 5.2 and a wish that fits its schema', async () => {
    putPlace('harbour', { name: 'Harbour', chunk: [1, 0] })
    put('wishes/spiral-staircase.json', JSON.stringify(wish))
    expect(await run(added('places/harbour.json', 'wishes/spiral-staircase.json'))).toEqual({ ok: true, problems: [] })
  })

  it('refuses a place over a limit of 5.2, with the reason', async () => {
    putPlace('harbour', { name: 'x'.repeat(41) })
    const r = await run(added('places/harbour.json'))
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toMatch(/places\/harbour\.json.*name must be 3 to 40/)
  })

  it('refuses a place whose id is not its file name, and a place that is not a place', async () => {
    putPlace('harbour', { id: 'other' })
    put('places/junk.json', '{"id":"junk"}')
    const r = await run(added('places/harbour.json', 'places/junk.json'))
    expect(r.problems.join(' ')).toMatch(/harbour\.json.*id is "other"/)
    expect(r.problems.join(' ')).toMatch(/places\/junk\.json/)
  })

  it('refuses a place that shows a file the world does not have', async () => {
    const exhibit = { id: 'k', kind: 'souvenir', ref: 'souvenirs/nope', slot: 'main/4/0', label: 'x', added: '2026-11-20' }
    putPlace('harbour', { exhibits: [exhibit] })
    expect((await run(added('places/harbour.json'))).problems.join(' ')).toMatch(/harbour\.json.*souvenirs\/nope/)
    put('souvenirs/nope.json', '{}')
    expect((await run(added('places/harbour.json'))).ok).toBe(true)
  })

  it('refuses a wish that does not fit, or whose id is not its file name', async () => {
    put('wishes/spiral-staircase.json', JSON.stringify({ ...wish, description: 'x'.repeat(201) }))
    put('wishes/lamp.json', JSON.stringify(wish))
    const r = await run(added('wishes/spiral-staircase.json', 'wishes/lamp.json'))
    expect(r.problems.join(' ')).toMatch(/spiral-staircase\.json.*description/)
    expect(r.problems.join(' ')).toMatch(/lamp\.json.*id is "spiral-staircase"/)
  })

  it('does not read a deleted file', async () => {
    expect((await run([{ status: 'D', path: 'wishes/old.json' }])).ok).toBe(true)
  })
})

describe('a work in a pull request (spec 7.3, 7.1)', () => {
  it('is checked again, in a browser, on the page that is stored', async () => {
    putWork()
    const c = checker()
    await run(work(), { checker: c })
    expect(c.pages).toEqual([HTML])
  })

  it('fails with the browser check\'s reasons', async () => {
    putWork()
    const r = await run(work(), { checker: checker(false, ['the screenshot is a single colour']) })
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toMatch(/a-lamp.*single colour/)
  })

  it('fails the static check before any browser: a work that calls fetch', async () => {
    putWork('a-lamp', { html: withPolicy('<html><head></head><body><script>fetch("https://example.org")</script></body></html>') })
    const c = checker()
    const r = await run(work(), { checker: c })
    expect(r.ok).toBe(false)
    expect(r.problems.join(' ')).toMatch(/fetch/)
    expect(c.pages).toEqual([])
  })

  it('fails a page without the policy tag first in its head', async () => {
    putWork('a-lamp', { html: '<html><head><title>t</title></head><body></body></html>' })
    expect((await run(work())).problems.join(' ')).toMatch(/policy/i)
  })

  it('needs a meta that fits the schema, with the same id as its folder', async () => {
    putWork('a-lamp')
    put('works/a-lamp/meta.json', JSON.stringify({ id: 'a-lamp' }))
    expect((await run(work())).ok).toBe(false)
    putWork('a-lamp', { meta: {} })
    put('works/a-lamp/meta.json', JSON.stringify(meta({ id: 'other' })))
    expect((await run(work())).problems.join(' ')).toMatch(/id/)
  })

  it('needs its three files and no others', async () => {
    putWork('a-lamp', { thumb: null })
    expect((await run(added('works/a-lamp/index.html', 'works/a-lamp/meta.json'))).problems.join(' ')).toMatch(/thumb\.png/)
    putWork()
    expect((await run([...work(), ...added('works/a-lamp/extra.js')])).problems.join(' ')).toMatch(/extra\.js/)
    expect((await run([...work(), ...added('works/a-lamp/sub/x.html')])).ok).toBe(false)
  })

  it('wants a real PNG thumbnail of a sensible size', async () => {
    putWork('a-lamp', { thumb: Buffer.from('not a png') })
    expect((await run(work())).problems.join(' ')).toMatch(/PNG/)
    putWork('a-lamp', { thumb: Buffer.concat([PNG, Buffer.alloc(400_000)]) })
    expect((await run(work())).problems.join(' ')).toMatch(/thumb/)
  })

  it('keeps a scrap with its reason and does not run a browser on it, and needs no thumbnail', async () => {
    putWork('a-lamp', { meta: { status: 'scrap', scrapReason: 'the screenshot is a single colour' }, thumb: null })
    const c = checker(false, ['should not be asked'])
    const r = await run(added('works/a-lamp/index.html', 'works/a-lamp/meta.json'), { checker: c })
    expect(r).toEqual({ ok: true, problems: [] })
    expect(c.pages).toEqual([])
  })

  it('does not let a pull request put a work away, or change or delete one that exists: only the loop does that', async () => {
    putWork('a-lamp', { meta: { status: 'retired', retireReason: 'outgrown' } })
    expect((await run(work())).problems.join(' ')).toMatch(/retired/)
    putWork()
    expect((await run([{ status: 'M', path: 'works/a-lamp/index.html' }])).problems.join(' ')).toMatch(/already|change/i)
    expect((await run([{ status: 'D', path: 'works/a-lamp/index.html' }])).problems.join(' ')).toMatch(/delete|remov/i)
  })

  it('reports every problem, not just the first', async () => {
    putWork('a-lamp', { html: withPolicy('<html><head></head><body><script>fetch("x")</script></body></html>'), thumb: Buffer.from('nope') })
    const r = await run([...work(), ...added('self/seed.md')])
    expect(r.problems.length).toBeGreaterThanOrEqual(3)
  })

  it('with no browser, still runs the static checks and says the browser check was skipped', async () => {
    putWork()
    const r = await run(work(), { checker: null })
    expect(r.ok).toBe(true)
    putWork('a-lamp', { html: withPolicy('<html><head></head><body><script>fetch("x")</script></body></html>') })
    expect((await run(work(), { checker: null })).ok).toBe(false)
  })
})

describe('a branch named work/<id> (the build worker\'s, which is merged on its own)', () => {
  it('may hold exactly that one work', async () => {
    putWork()
    expect((await run(work(), { branch: 'work/a-lamp' })).ok).toBe(true)
  })

  it('may not hold a place, a wish, or a different work, since it is merged without anyone looking', async () => {
    putWork()
    putWork('other')
    put('places/house.json', '{}')
    for (const extra of [added('places/house.json'), work('other')]) {
      const r = await run([...work(), ...extra], { branch: 'work/a-lamp' })
      expect(r.ok).toBe(false)
      expect(r.problems.join(' ')).toMatch(/work\/a-lamp/)
    }
  })

  it('may not hold nothing at all', async () => {
    expect((await run([], { branch: 'work/a-lamp' })).ok).toBe(false)
  })
})

describe('a meme in a pull request (spec 7.7)', () => {
  const MEME_PAGE = withPolicy('<!doctype html><html><head><meta charset="utf-8"></head><body><canvas id="c" width="480" height="360"></canvas><script>document.getElementById("c").getContext("2d").fillRect(0,0,10,10)</script></body></html>')
  const url = 'https://en.wikipedia.org/wiki/Distracted_boyfriend'
  const sources = [{ role: 'looked', url }, { role: 'read', url }]
  const putTrail = () =>
    put('trails/2026-11-12-1.json', JSON.stringify(Trail.parse({ id: '2026-11-12-1', date: '2026-11-12', purpose: 'a trip', start: { kind: 'topic', value: 'memes' }, pages: [{ url, title: 'Distracted boyfriend', fetchedAt: '2026-11-12T10:00:00Z', look: 'a man turning' }] })))

  it('passes when it is drawn in code and its sources are in the trails', async () => {
    putTrail()
    putWork('a-lamp', { html: MEME_PAGE, meta: { kind: 'meme', sources } })
    expect(await run(work())).toEqual({ ok: true, problems: [] })
  })

  it('fails when it carries a picture', async () => {
    putTrail()
    putWork('a-lamp', { html: withPolicy('<html><head></head><body><img src="data:image/png;base64,iVBORw0KGgo=" alt=""></body></html>'), meta: { kind: 'meme', sources } })
    expect((await run(work())).problems.join(' ')).toMatch(/meme/i)
  })

  it('fails when its sources are not pages in the trails', async () => {
    putWork('a-lamp', { html: MEME_PAGE, meta: { kind: 'meme', sources } })
    expect((await run(work())).problems.join(' ')).toMatch(/looked at/)
  })
})
