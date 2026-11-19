import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FetchImpl } from '@forkling/mind/src/web/fetch.ts'
import { describe, expect, it } from 'vitest'
import { recordWebSnapshot } from '../src/snapshot/record.ts'
import { readSourceList } from '../src/sources/list.ts'
import { checkSnapshotFormat, SnapshotManifest } from '../src/sources/snapshot.ts'

/** A small made-up web: every allowed source answers, and esolangs.org's robots.txt forbids one page. */
function fakeWeb(): FetchImpl & { asked: string[] } {
  const asked: string[] = []
  const html = (body: string) => new Response(`<html><head><title>T</title></head><body>${body}</body></html>`, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
  const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200, headers: { 'content-type': 'application/json' } })
  const fn = (async (url: string) => {
    asked.push(url)
    const u = new URL(url)
    if (u.pathname === '/robots.txt') return new Response(u.hostname === 'esolangs.org' ? 'User-agent: *\nDisallow: /wiki/Forbidden\n' : 'User-agent: *\nAllow: /\n', { status: 200, headers: { 'content-type': 'text/plain' } })
    if (u.hostname === 'api.imgflip.com') return json({ success: true, data: { memes: [{ id: '181913649', name: 'Drake Hotline Bling', url: 'https://i.imgflip.com/30b1gx.jpg', box_count: 2, captions: 10 }] } })
    if (u.hostname === 'api.github.com' && u.pathname === '/search/repositories') return json({ items: [{ full_name: 'a/b' }] })
    if (u.hostname === 'api.github.com') return json({ full_name: 'a/b', description: 'a creative coding toy', html_url: 'https://github.com/a/b', topics: [] })
    if (u.hostname === 'esolangs.org' && u.pathname === '/wiki/Main_Page') return html('<div id="mw-content-text"><a href="/wiki/Forbidden">Forbidden</a> <a href="/wiki/Brainfuck">Brainfuck</a></div>')
    if (u.hostname === 'en.wikipedia.org' && u.pathname === '/wiki/Main_Page') return html('<div id="mp-tfa"><a href="/wiki/Lighthouse">Lighthouse</a></div><div id="mp-dyk"><a href="/wiki/Moth">Moth</a></div>')
    if (u.hostname.endsWith('wikipedia.org') || u.hostname === 'esolangs.org' || u.hostname === 'commons.wikimedia.org') return html(`<div id="mw-content-text"><p>${'A page about this thing with enough words. '.repeat(20)}</p><a href="/wiki/Other">Other</a></div>`)
    if (u.hostname === 'api.artic.edu') return json({ data: [{ id: 7, title: 'A painting' }], pagination: { total: 1 } })
    if (['p5js.org', 'tonejs.github.io', 'threejs.org', 'developer.mozilla.org'].includes(u.hostname)) return html('<p>Reference</p><a href="https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API">Canvas</a>')
    return new Response('missing', { status: 404, headers: { 'content-type': 'text/plain' } })
  }) as FetchImpl & { asked: string[] }
  fn.asked = asked
  return fn
}

const record = async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-snap-'))
  const web = fakeWeb()
  const manifest = await recordWebSnapshot({ dir, list: readSourceList(), fetchImpl: web, sleep: async () => undefined, engine: 'abc123', now: () => new Date('2026-11-19T12:00:00Z') })
  return { dir, web, manifest }
}

describe('recording the web snapshot', () => {
  it('writes a manifest in the agreed format that passes lane S format check', async () => {
    const { dir, manifest } = await record()
    expect(SnapshotManifest.parse(JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')))).toMatchObject({ version: 1, engine: 'abc123', takenAt: '2026-11-19T12:00:00.000Z' })
    expect(checkSnapshotFormat(dir, readSourceList())).toEqual([])
    expect(manifest.sources.imgflip?.items).toBeGreaterThan(0)
    expect(manifest.sources.wikipedia?.items).toBeGreaterThan(0)
  })

  it('reads robots.txt first on each host and never fetches a page it forbids', async () => {
    const { web, manifest } = await record()
    expect(web.asked).not.toContain('https://esolangs.org/wiki/Forbidden')
    expect(web.asked).toContain('https://esolangs.org/wiki/Brainfuck')
    const firstEsolang = web.asked.find((u) => u.startsWith('https://esolangs.org/'))
    expect(firstEsolang).toBe('https://esolangs.org/robots.txt')
    expect(manifest.entries.some((e) => e.url === 'https://esolangs.org/robots.txt')).toBe(true)
  })

  it('asks only hosts on the allowlist', async () => {
    const { web } = await record()
    const hosts = new Set(web.asked.map((u) => new URL(u).hostname))
    expect([...hosts].every((h) => readSourceList().sources.some((s) => s.state === 'on the list' && s.hosts.includes(h)))).toBe(true)
  })

  it('stops reading pages once the size budget is spent', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'qa-snap-'))
    const web = fakeWeb()
    await recordWebSnapshot({ dir, list: readSourceList(), fetchImpl: web, sleep: async () => undefined, engine: 'abc', now: () => new Date(), maxBytes: 1 })
    // Only the morning lists and robots.txt before the first page goes over a 1-byte budget.
    expect(web.asked.length).toBeLessThan(15)
  })
})
