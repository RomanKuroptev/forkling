import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FetchImpl } from '@forkling/mind/src/web/fetch.ts'
import { describe, expect, it } from 'vitest'
import { NEVER_READ, recordWebSnapshot } from '../src/snapshot/record.ts'
import { readSourceList } from '../src/sources/list.ts'
import { checkSnapshotFormat, SnapshotManifest } from '../src/sources/snapshot.ts'
import { RISING_TOPICS, weekBefore } from '@forkling/mind/src/web/sources/records.ts'
import { snapshotFetch } from '@forkling/mind/src/web/snapshot.ts'

/** A small made-up web: every allowed source answers, and esolangs.org's robots.txt forbids one page. */
function fakeWeb(): FetchImpl & { asked: string[] } {
  const asked: string[] = []
  const html = (body: string) => new Response(`<html><head><title>T</title></head><body>${body}</body></html>`, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
  const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200, headers: { 'content-type': 'application/json' } })
  const fn = (async (url: string) => {
    asked.push(url)
    const u = new URL(url)
    if (u.pathname === '/robots.txt') return new Response(u.hostname === 'esolangs.org' ? 'User-agent: *\nDisallow: /wiki/Forbidden\n' : 'User-agent: *\nAllow: /\n', { status: 200, headers: { 'content-type': 'text/plain' } })
    if (u.hostname === 'api.imgflip.com')
      return json({ success: true, data: { memes: [{ id: '181913649', name: 'Drake Hotline Bling', url: 'https://i.imgflip.com/30b1gx.jpg', box_count: 2, captions: 10 }, { id: '87743020', name: 'Two Buttons', url: 'https://i.imgflip.com/1g8my4.jpg', box_count: 3, captions: 9 }] } })
    if (u.hostname === 'i.imgflip.com') return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0x80]), { status: 200, headers: { 'content-type': 'image/jpeg' } })
    if (u.hostname === 'lemmy.world' && u.pathname === '/api/v3/post/list') {
      const c = u.searchParams.get('community_name')!
      return json({ posts: [1, 2, 3, 4, 5, 6].map((n) => ({ post: { id: (c === 'memes' ? 100 : 200) + n, name: `${c} post ${n}` }, community: { name: c } })) })
    }
    if (u.hostname === 'lemmy.world' && u.pathname === '/api/v3/comment/list') {
      const id = Number(u.searchParams.get('post_id'))
      return json({ comments: [{ comment: { content: 'a comment' }, post: { id, name: `post ${id}` }, community: { name: id < 200 ? 'memes' : 'showerthoughts' } }] })
    }
    if (u.hostname === 'public.api.bsky.app' && u.pathname === '/xrpc/app.bsky.unspecced.getTrendingTopics')
      return json({ topics: [{ topic: 'knitting', displayName: 'Knitting', description: 'Yarn', link: '/profile/did:plc:abc/feed/knit' }, { topic: 'war', displayName: 'War news', description: '', link: '/profile/did:plc:abc/feed/war' }] })
    if (u.hostname === 'public.api.bsky.app' && u.pathname === '/xrpc/app.bsky.feed.getFeed') return json({ feed: [{ post: { author: { handle: 'a.bsky.social' }, record: { text: 'I knit a cat' } } }] })
    if (u.hostname === 'api.github.com' && u.pathname === '/search/repositories') return json({ items: [{ full_name: 'a/b' }] })
    if (u.hostname === 'api.github.com') return json({ full_name: 'a/b', description: 'a creative coding toy', html_url: 'https://github.com/a/b', topics: [] })
    if (u.hostname === 'esolangs.org' && u.pathname === '/wiki/Main_Page') return html('<div id="mw-content-text"><a href="/wiki/Forbidden">Forbidden</a> <a href="/wiki/Brainfuck">Brainfuck</a></div>')
    if (u.hostname === 'en.wikipedia.org' && u.pathname === '/wiki/Main_Page') return html('<div id="mp-tfa"><a href="/wiki/Lighthouse">Lighthouse</a></div><div id="mp-dyk"><a href="/wiki/Moth">Moth</a></div>')
    if (u.pathname === '/wiki/Drake_Hotline_Bling') return new Response('<html>no such page</html>', { status: 404, headers: { 'content-type': 'text/html; charset=UTF-8' } })
    if (u.hostname.endsWith('wikipedia.org') || u.hostname === 'esolangs.org' || u.hostname === 'commons.wikimedia.org') return html(`<div id="mw-content-text"><p>${'A page about this thing with enough words. '.repeat(20)}</p><a href="/wiki/Other">Other</a></div>`)
    if (u.hostname === 'api.artic.edu') return json({ data: [{ id: 7, title: 'A painting' }], pagination: { total: 1 } })
    if (['p5js.org', 'tonejs.github.io', 'threejs.org', 'developer.mozilla.org'].includes(u.hostname)) return html('<p>Reference</p><a href="https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API">Canvas</a>')
    return new Response('missing', { status: 404, headers: { 'content-type': 'text/plain' } })
  }) as FetchImpl & { asked: string[] }
  fn.asked = asked
  return fn
}

const record = async (maxBytes?: number) => {
  const dir = mkdtempSync(join(tmpdir(), 'qa-snap-'))
  const web = fakeWeb()
  const manifest = await recordWebSnapshot({ dir, list: readSourceList(), fetchImpl: web, sleep: async () => undefined, engine: 'abc123', now: () => new Date('2026-11-19T12:00:00Z'), ...(maxBytes ? { maxBytes } : {}) })
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

  it("records both Lemmy communities and their hot posts, and Bluesky trending without any topic's posts", async () => {
    const { web, manifest } = await record()
    const urls = manifest.entries.filter((e) => e.file).map((e) => e.url)
    for (const c of ['memes', 'showerthoughts']) expect(urls).toContain(`https://lemmy.world/api/v3/post/list?community_name=${c}&sort=Hot&limit=20&page=1`)
    for (const id of [101, 102, 103, 201, 202, 203]) expect(urls.some((u) => u.includes(`/api/v3/comment/list?post_id=${id}&`))).toBe(true)
    expect(urls).toContain('https://public.api.bsky.app/xrpc/app.bsky.unspecced.getTrendingTopics?limit=25')
    // A topic is only Bluesky's own name and summary (Roman, 20 November): no topic's posts are ever asked for.
    expect(web.asked.some((u) => u.includes('getFeed'))).toBe(false)
    expect(manifest.sources['lemmy-memes']?.items).toBeGreaterThan(0)
    expect(manifest.sources['bluesky-trending']?.items).toBeGreaterThan(0)
  })

  it('keeps the template pictures on i.imgflip.com as bytes, so a look can see them offline', async () => {
    const { dir, manifest } = await record()
    const pic = manifest.entries.find((e) => e.url === 'https://i.imgflip.com/30b1gx.jpg')
    expect(pic).toMatchObject({ status: 200, contentType: 'image/jpeg' })
    expect(pic!.file).toMatch(/\.jpg$/)
    const res = await snapshotFetch(dir)('https://i.imgflip.com/1g8my4.jpg', {} as RequestInit)
    expect(res.status).toBe(200)
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0x80])
  })

  it('answers the GitHub rising-this-week search of every topic for the days a run may start on', async () => {
    const { dir, manifest } = await record()
    const answer = snapshotFetch(dir)
    for (const day of ['2026-11-19', '2026-11-26', '2026-12-20'])
      for (const topic of RISING_TOPICS) {
        const url = `https://api.github.com/search/repositories?q=topic:${topic}+created:%3E${weekBefore(day)}&sort=stars&order=desc&per_page=4`
        expect((await answer(url, {} as RequestInit)).status, `${topic} on ${day}`).toBe(200)
      }
    // The copies for other days are not counted as more items.
    expect(manifest.sources['github-creative-coding']!.items).toBeLessThan(manifest.entries.filter((e) => e.source === 'github-creative-coding' && e.file).length)
    expect(checkSnapshotFormat(dir, readSourceList())).toEqual([])
  })

  it('asks the addresses the planted tests need, and keeps a real 404 as a 404', async () => {
    const { manifest } = await record()
    expect(manifest.entries.find((e) => e.url === 'https://en.wikipedia.org/wiki/Drake_Hotline_Bling')).toMatchObject({ status: 404 })
  })

  it('never reads the pages the planted test counts as snapshot misses, even when a page links to them', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'qa-snap-'))
    const base = fakeWeb()
    const web = (async (url: string, init?: RequestInit) => {
      const u = new URL(url)
      if (u.hostname === 'en.wikipedia.org' && u.pathname === '/wiki/Lighthouse')
        return new Response(`<html><head><title>T</title></head><body><div id="mw-content-text"><p>${'Words. '.repeat(60)}</p><a href="/wiki/Procopius">Procopius</a></div></body></html>`, { status: 200, headers: { 'content-type': 'text/html' } })
      return base(url, init as never)
    }) as FetchImpl
    const asked: string[] = []
    await recordWebSnapshot({ dir, list: readSourceList(), fetchImpl: (async (url: string, init: never) => (asked.push(url), web(url, init))) as FetchImpl, sleep: async () => undefined, engine: 'abc', now: () => new Date('2026-11-19T12:00:00Z') })
    expect(asked).toContain('https://en.wikipedia.org/wiki/Lighthouse')
    for (const url of NEVER_READ) expect(asked.filter((a) => a.includes(new URL(url).pathname.split('/').pop()!))).toEqual([])
  })

  it('reads every morning starting point, and goes two steps from the pages read', async () => {
    const { web } = await record()
    for (const url of ['https://en.wikipedia.org/wiki/Lighthouse', 'https://en.wikipedia.org/wiki/Moth', 'https://esolangs.org/wiki/Brainfuck']) expect(web.asked).toContain(url)
    // Lighthouse links to Other (step one); Other links to Other again, so step two asks nothing new, but it is asked once only.
    expect(web.asked.filter((u) => u === 'https://en.wikipedia.org/wiki/Other').length).toBe(1)
  })
})
