import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { WorkMetaDraft } from '@forkling/schema'
import { COPY_RUN, dweetPagesRead, dweetSeeds, verifyDweetUse, type DweetSeed } from '../src/builds/dweets.ts'
import { buildTinkerUser, runTinker, type TinkerInput } from '../src/builds/tinker.ts'
import type { WorkChecker } from '../src/builds/browser-check.ts'
import { WebError, type Fetcher } from '../src/web/fetch.ts'
import type { CallKind, LlmResult } from '../src/llm.ts'

const CODE = 'for(i=2e3;i--;)x.fillRect(960+S(i*i+t)*i/3,540+C(i*t/99)*i/4,4,4);x.fillStyle=R(i%255,99,200,.1)'
const seed: DweetSeed = { url: 'https://www.dwitter.net/d/36693', title: 'Dweet 36693 by UEZ', code: CODE, plain: CODE }
const page = (script: string) => `<!doctype html><html><body><canvas></canvas><script>${script}</script></body></html>`

describe('a dweet is a starting point, never copied (Roman, 20 November)', () => {
  it('turns down a page that holds the whole dweet, or any 80 characters of it, and passes one with its own code', () => {
    expect(CODE.length).toBeGreaterThan(COPY_RUN)
    expect(verifyDweetUse(page(CODE), [], [seed])[0]).toMatch(/copies the code of Dweet 36693 by UEZ/)
    expect(verifyDweetUse(page(`let a=1;${CODE.slice(5, 5 + COPY_RUN)};`), [], [seed])).toHaveLength(1)
    expect(verifyDweetUse(page(CODE.slice(5, 5 + COPY_RUN - 1)), [], [seed])).toEqual([])
    expect(verifyDweetUse(page('for(let k=0;k<500;k++){ctx.fillRect(k,k,2,2)}'), [{ role: 'from', url: seed.url }], [seed])).toEqual([])
  })

  it('checks the unpacked code as well as the packed, and a short dweet only whole', () => {
    const packed: DweetSeed = { ...seed, code: 'eval(unescape(escape`xyz`.replace(/u\\D*/g,\'\')))', plain: CODE }
    expect(verifyDweetUse(page(CODE), [], [packed])).toHaveLength(1)
    const short: DweetSeed = { ...seed, code: 'c.width|=0;x.fillRect(t*99,9,9,9)', plain: 'c.width|=0;x.fillRect(t*99,9,9,9)' }
    expect(verifyDweetUse(page('c.width|=0;'), [], [short])).toEqual([])
    expect(verifyDweetUse(page(short.code), [], [short])).toHaveLength(1)
  })

  it('turns down a "from" source that was not offered', () => {
    expect(verifyDweetUse(page('x'), [{ role: 'from', url: 'https://www.dwitter.net/d/1' }], [seed])[0]).toMatch(/not one it was offered/)
  })
})

describe('the dweets a tinker is offered', () => {
  const world = () => {
    const dir = mkdtempSync(join(tmpdir(), 'dweets-'))
    mkdirSync(join(dir, 'trails'))
    const p = (url: string, extra = {}) => ({ url, title: url, fetchedAt: '2026-11-20T10:00:00Z', topics: [], ...extra })
    writeFileSync(join(dir, 'trails', '2026-11-19-1.json'), JSON.stringify({ id: '2026-11-19-1', date: '2026-11-19', purpose: 'p', start: { kind: 'feed', value: 'x' }, pages: [p('https://www.dwitter.net/d/10'), p('https://en.wikipedia.org/wiki/Moon')] }))
    writeFileSync(join(dir, 'trails', '2026-11-20-1.json'), JSON.stringify({ id: '2026-11-20-1', date: '2026-11-20', purpose: 'p', start: { kind: 'feed', value: 'x' }, pages: [p('https://www.dwitter.net/d/20'), p('https://www.dwitter.net/d/21', { failed: 'http 500' }), p('https://www.dwitter.net/d/10')] }))
    return dir
  }

  it('are the dweet pages it read on its trails, newest first, once each, failed reads left out', () => {
    expect(dweetPagesRead(world()).map((p) => p.url)).toEqual(['https://www.dwitter.net/d/10', 'https://www.dwitter.net/d/20'])
  })

  it('are fetched again for their code, and one that cannot be read is left out', async () => {
    const f: Fetcher = {
      log: [],
      pausedHosts: () => ({}),
      text: async () => '',
      bytes: async (url) => ({ bytes: new Uint8Array(), contentType: 'x', url }),
      json: async (url) => {
        if (url === 'https://www.dwitter.net/apiv2beta/dweets/10/') return { id: 10, code: CODE, author: { username: 'ann' }, awesome_count: 3, posted: '2026-11-19T00:00:00Z' }
        throw new WebError('http', '404', 404)
      },
    }
    expect(await dweetSeeds(f, world())).toEqual([{ url: 'https://www.dwitter.net/d/10', title: 'Dweet 10 by ann', code: CODE, plain: CODE }])
  })
})

describe('the tinker call with dweets', () => {
  const input = (over: Partial<TinkerInput> = {}): TinkerInput => ({ idea: 'dots that orbit', reason: 'I liked a dweet.', size: 'sketch', interests: [], souvenirs: [], remix: null, untried: [], recentTitles: [], manuals: [], ...over })
  const draft = (over: Partial<WorkMetaDraft> = {}): WorkMetaDraft => ({ title: 'Orbit dots', kind: 'art', about: 'Dots that go round, after a dweet I read.', interest: null, sources: [], ...over })
  const checker: WorkChecker = { check: async () => ({ ok: true, reasons: [], thumb: Buffer.from([1]) }), available: async () => true, close: async () => undefined }
  const complete = (html: string, meta: WorkMetaDraft) =>
    (async (_k: CallKind) => ({ parsed: { meta, html, constraintRefusal: null }, usage: { input: 1, cacheRead: 0, cacheWrite: 0, output: 1 }, stopReason: 'end_turn' }) as LlmResult<unknown>) as Parameters<typeof runTinker>[0]['complete']
  const deps = (html: string, meta: WorkMetaDraft) => ({ complete: complete(html, meta), checker, nowIso: '2026-11-20T10:00:00.000Z', existingIds: new Set<string>() })

  it('shows the dweets in a data block with the rule, and says nothing of them when there are none', () => {
    const text = buildTinkerUser(input({ dweets: [seed] }))
    expect(text).toContain('## Dweets you read')
    expect(text).toContain('<data source="dweets">')
    expect(text).toContain(CODE)
    expect(text).toMatch(/never copy one/)
    expect(text).toMatch(/role from/)
    expect(buildTinkerUser(input())).not.toContain('Dweets you read')
  })

  it('keeps a work that names the dweet it started from in its meta, and scraps one that copies it', async () => {
    const own = await runTinker(deps(page('for(let k=0;k<500;k++){}'), draft({ sources: [{ role: 'from', url: seed.url }] })), input({ dweets: [seed] }))
    expect(own.status).toBe('shelf')
    if (own.status === 'shelf') expect(own.meta.sources).toEqual([{ role: 'from', url: seed.url }])
    const copy = await runTinker(deps(page(CODE), draft()), input({ dweets: [seed] }))
    expect(copy.status).toBe('scrap')
    if (copy.status === 'scrap') expect(copy.meta.scrapReason).toMatch(/copies the code of Dweet 36693/)
  })
})
