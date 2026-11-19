import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FetchImpl } from '../src/web/fetch.ts'
import { cutHtml, recordingFetch, snapshotFetch, trimHtml, writeManifest } from '../src/web/snapshot.ts'

const temp = () => mkdtempSync(join(tmpdir(), 'snap-'))
const web: FetchImpl = async (url) => {
  if (url.endsWith('/gone')) return new Response('nope', { status: 404, headers: { 'content-type': 'text/plain' } })
  if (url.endsWith('/moved')) return new Response(null, { status: 301, headers: { location: 'https://en.wikipedia.org/wiki/Lighthouse' } })
  if (url.endsWith('/broken')) throw new Error('connection reset')
  if (url.endsWith('.json')) return new Response('{"a":1}', { status: 200, headers: { 'content-type': 'application/json' } })
  return new Response('<html><head><script>x()</script><style>p{}</style></head><body><!-- hi --><p style="color:red" data-x="1">Lamps <a href="/wiki/Lamp" class="l">lamp</a></p></body></html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
}
const source = (host: string) => (host === 'en.wikipedia.org' ? 'wikipedia' : 'other')

describe('trimHtml', () => {
  it('drops scripts, styles, comments and styling attributes, and keeps text, links and classes', () => {
    expect(trimHtml('<head><script>x()</script><style>p{}</style></head><body><!-- hi --><p style="color:red" data-x="1">Lamps <a href="/wiki/Lamp" class="l">lamp</a></p></body>')).toBe('<head></head><body><p>Lamps <a href="/wiki/Lamp" class="l">lamp</a></p></body>')
  })
})

describe('cutHtml', () => {
  it('cuts a long page at the end of a tag, and keeps a front page whole', () => {
    const page = `<p>${'word '.repeat(50)}</p>`.repeat(10)
    const cut = cutHtml('https://en.wikipedia.org/wiki/Lamp', page, 300)
    expect(cut.length).toBeLessThanOrEqual(300)
    expect(cut.endsWith('>')).toBe(true)
    expect(page.startsWith(cut)).toBe(true)
    expect(cutHtml('https://en.wikipedia.org/wiki/Main_Page', page, 300)).toBe(page)
    expect(cutHtml('https://en.wikipedia.org/wiki/Lamp', '<p>short</p>', 300)).toBe('<p>short</p>')
  })
})

describe('recordingFetch', () => {
  it('keeps each answer in files/<first 16 hex of its sha256>.<ext> and passes the same answer on', async () => {
    const dir = temp()
    const rec = recordingFetch(web, dir, source)
    const res = await rec('https://en.wikipedia.org/wiki/Lamp', {})
    const body = await res.text()
    expect(body).toContain('Lamps')
    expect(body).not.toContain('<script>')
    const [e] = rec.entries
    const sha = createHash('sha256').update(body).digest('hex')
    expect(e).toEqual({ url: 'https://en.wikipedia.org/wiki/Lamp', host: 'en.wikipedia.org', source: 'wikipedia', status: 200, contentType: 'text/html; charset=utf-8', file: `files/${sha.slice(0, 16)}.html`, bytes: Buffer.byteLength(body), sha256: sha })
    expect(readFileSync(join(dir, e!.file!), 'utf8')).toBe(body)
  })

  it('records a failed answer and a redirect with no file, and a request that threw with status 0', async () => {
    const dir = temp()
    const rec = recordingFetch(web, dir, source)
    expect((await rec('https://en.wikipedia.org/gone', {})).status).toBe(404)
    expect((await rec('https://en.wikipedia.org/moved', {})).headers.get('location')).toBe('https://en.wikipedia.org/wiki/Lighthouse')
    await expect(rec('https://en.wikipedia.org/broken', {})).rejects.toThrow(/reset/)
    expect(rec.entries.map((e) => [e.status, e.file ?? null, e.location ?? null])).toEqual([
      [404, null, null],
      [301, null, 'https://en.wikipedia.org/wiki/Lighthouse'],
      [0, null, null],
    ])
  })

  it('records each address once', async () => {
    const rec = recordingFetch(web, temp(), source)
    await rec('https://x.org/a.json', {})
    await rec('https://x.org/a.json', {})
    expect(rec.entries.length).toBe(1)
    expect(rec.entries[0]!.file).toMatch(/\.json$/)
  })
})

describe('snapshotFetch', () => {
  it('replays what was recorded, and every other address is a 404', async () => {
    const dir = temp()
    const rec = recordingFetch(web, dir, source)
    await (await rec('https://en.wikipedia.org/wiki/Lamp', {})).text()
    await rec('https://en.wikipedia.org/moved', {})
    writeManifest(dir, { takenAt: '2026-11-19T12:00:00.000Z', engine: 'abc', userAgent: 'forkling-test', entries: rec.entries })
    expect(existsSync(join(dir, 'manifest.json'))).toBe(true)
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
    expect(manifest).toMatchObject({ version: 1, takenAt: '2026-11-19T12:00:00.000Z', engine: 'abc', sources: { wikipedia: { items: 1 } } })

    const replay = snapshotFetch(dir)
    const page = await replay('https://en.wikipedia.org/wiki/Lamp', {})
    expect(page.status).toBe(200)
    expect(page.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(await page.text()).toContain('Lamps')
    expect((await replay('https://en.wikipedia.org/moved', {})).headers.get('location')).toBe('https://en.wikipedia.org/wiki/Lighthouse')
    expect((await replay('https://en.wikipedia.org/wiki/Never', {})).status).toBe(404)
  })

  it('refuses a folder with no manifest', () => {
    expect(() => snapshotFetch(temp())).toThrow(/manifest/)
  })
})
