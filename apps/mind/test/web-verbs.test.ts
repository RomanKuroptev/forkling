import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ALLOWLIST, hostRule, isAllowed, isReadable } from '../src/web/allowlist.ts'
import { wordCount } from '../src/web/clean.ts'
import { createFetcher, MAX_BYTES, type FetchImpl } from '../src/web/fetch.ts'
import { MANUAL_HOSTS, MANUAL_START, manualPage, manualPagesFor } from '../src/web/sources/manuals.ts'

const PAGE = '<html><head><title>p5 reference</title></head><body><nav><a href="/reference/p5/circle/">circle</a></nav><p>circle(x, y, d) draws a circle.</p></body></html>'

/** A fetch that answers every URL with a page and remembers what it was asked (robots.txt aside: no host here has one). */
function web(answer: (url: string) => Response | Promise<Response> = () => new Response(PAGE, { headers: { 'content-type': 'text/html' } })) {
  const asked: string[] = []
  const fetchImpl: FetchImpl = async (url) => {
    if (url.endsWith('/robots.txt')) return new Response('not found', { status: 404 })
    asked.push(url)
    return answer(url)
  }
  return { asked, fetchImpl }
}
const noWait = { sleep: async () => undefined }

describe('hosts by verb (spec 6.1)', () => {
  it('has the four library manuals as tinker hosts, in the reference tier', () => {
    expect([...MANUAL_HOSTS]).toEqual(['p5js.org', 'tonejs.github.io', 'threejs.org', 'developer.mozilla.org'])
    for (const host of MANUAL_HOSTS) {
      expect(hostRule(host), host).toMatchObject({ kind: 'page', tier: 'reference', verbs: ['tinker'] })
      expect(ALLOWLIST.filter((r) => r.host === host)).toHaveLength(1)
    }
  })

  it('allows a manual for tinker and not for wander, and a wander host for wander and not for tinker', () => {
    expect(isAllowed('https://p5js.org/reference/', 'tinker')).toBe(true)
    expect(isAllowed('https://p5js.org/reference/', 'wander')).toBe(false)
    expect(isAllowed('https://p5js.org/reference/')).toBe(false)
    expect(isAllowed('https://en.wikipedia.org/wiki/Moon')).toBe(true)
    expect(isAllowed('https://en.wikipedia.org/wiki/Moon', 'wander')).toBe(true)
    expect(isAllowed('https://en.wikipedia.org/wiki/Moon', 'tinker')).toBe(false)
  })

  it('still needs https, no port and no login, whatever the verb', () => {
    expect(isAllowed('http://p5js.org/reference/', 'tinker')).toBe(false)
    expect(isAllowed('https://p5js.org:8443/reference/', 'tinker')).toBe(false)
    expect(isAllowed('https://user:pw@p5js.org/reference/', 'tinker')).toBe(false)
    expect(isAllowed('https://evil-p5js.org/reference/', 'tinker')).toBe(false)
  })

  it('keeps a manual out of what a wander may be offered or follow', () => {
    expect(isReadable('https://p5js.org/reference/')).toBe(false)
    expect(isReadable('https://en.wikipedia.org/wiki/Moon')).toBe(true)
  })
})

describe('a fetcher with a verb', () => {
  it('refuses a manual host to a wander fetcher before it asks the network, and logs the refusal', async () => {
    const { asked, fetchImpl } = web()
    const fetcher = createFetcher({ fetchImpl, ...noWait })
    await expect(fetcher.text('https://p5js.org/reference/')).rejects.toThrow(/allowlist|not allowed/i)
    expect(asked).toEqual([])
    expect(fetcher.log.at(-1)).toMatchObject({ outcome: 'not-allowed' })
  })

  it('reads a manual with a tinker fetcher, and refuses a wander host to it', async () => {
    const { asked, fetchImpl } = web()
    const fetcher = createFetcher({ fetchImpl, verb: 'tinker', ...noWait })
    expect(await fetcher.text('https://p5js.org/reference/')).toContain('circle(x, y, d)')
    await expect(fetcher.text('https://en.wikipedia.org/wiki/Moon')).rejects.toThrow()
    expect(asked).toEqual(['https://p5js.org/reference/'])
  })

  it('checks each step of a redirect against the verb too: a manual cannot send a tinker fetcher to a wander host', async () => {
    const { asked, fetchImpl } = web((url) => (url.startsWith('https://threejs.org') ? new Response(null, { status: 302, headers: { location: 'https://en.wikipedia.org/wiki/Moon' } }) : new Response(PAGE)))
    const fetcher = createFetcher({ fetchImpl, verb: 'tinker', ...noWait })
    await expect(fetcher.text('https://threejs.org/docs/')).rejects.toThrow()
    expect(asked).toEqual(['https://threejs.org/docs/'])
  })
})

describe('manualPage', () => {
  it('is the page as text, with its title and where it is from', async () => {
    const { fetchImpl } = web()
    const item = await manualPage(createFetcher({ fetchImpl, verb: 'tinker', ...noWait }), 'https://p5js.org/reference/')
    expect(item).toMatchObject({ source: 'p5js.org', kind: 'page', tier: 'reference', url: 'https://p5js.org/reference/', title: 'p5 reference' })
    expect(item.text).toContain('circle(x, y, d) draws a circle.')
  })
})

describe('manualPagesFor (the manuals offered to a tinker call, spec 12.4: untried things)', () => {
  it('starts each library at its own manual', () => {
    expect(MANUAL_START).toEqual({ p5: 'https://p5js.org/tutorials/get-started/', tone: 'https://tonejs.github.io/docs/', three: 'https://threejs.org/docs/' })
  })

  it('reads at most 2 pages, for the first libraries named, in order', async () => {
    const { asked, fetchImpl } = web()
    const pages = await manualPagesFor(createFetcher({ fetchImpl, verb: 'tinker', ...noWait }), ['tone', 'three', 'p5'])
    expect(asked).toEqual([MANUAL_START.tone, MANUAL_START.three])
    expect(pages.map((p) => p.url)).toEqual([MANUAL_START.tone, MANUAL_START.three])
    expect(pages[0]).toMatchObject({ title: 'p5 reference', text: expect.stringContaining('circle(x, y, d)') })
  })

  it('reads nothing when every library has been used', async () => {
    const { asked, fetchImpl } = web()
    expect(await manualPagesFor(createFetcher({ fetchImpl, verb: 'tinker', ...noWait }), [])).toEqual([])
    expect(asked).toEqual([])
  })

  it('skips a page that cannot be read, and goes on to the next, never failing', async () => {
    const { fetchImpl } = web((url) => (url.includes('p5js') ? new Response('nope', { status: 500 }) : new Response(PAGE)))
    const pages = await manualPagesFor(createFetcher({ fetchImpl, verb: 'tinker', ...noWait }), ['p5', 'tone', 'three'])
    expect(pages.map((p) => p.url)).toEqual([MANUAL_START.tone])
  })

  it('cuts each page short, so two manuals stay a small part of the prompt', async () => {
    const long = `<html><head><title>big</title></head><body>${'word '.repeat(20_000)}</body></html>`
    const { fetchImpl } = web(() => new Response(long))
    const [page] = await manualPagesFor(createFetcher({ fetchImpl, verb: 'tinker', ...noWait }), ['p5'])
    expect(page!.text.length).toBeLessThan(8_000)
  })
})

/** Pages recorded from the live manuals on 2026-11-19 (QA issues #314 and #315). */
const recorded = (name: string) => readFileSync(new URL(`./fixtures/manuals/${name}`, import.meta.url), 'utf8')
const html = (body: string) => new Response(body, { headers: { 'content-type': 'text/html' } })

describe('the manual start pages as the hosts answer them (QA #314, #315)', () => {
  it('starts p5 at a page under the 2 MB cap: the whole reference index is over it', async () => {
    const page = recorded('p5-get-started.html')
    expect(new TextEncoder().encode(page).length).toBeLessThan(MAX_BYTES / 4)
    const { fetchImpl } = web((url) => (url === MANUAL_START.p5 ? html(page) : new Response('missing', { status: 404 })))
    const item = await manualPage(createFetcher({ fetchImpl, verb: 'tinker', ...noWait }), MANUAL_START.p5)
    expect(new URL(item.url).hostname).toBe('p5js.org')
    expect(item.title).toBe('Get Started')
    expect(wordCount(item.text)).toBeGreaterThan(100)
  })

  it('follows a meta refresh on the same host to the real Tone.js docs, which have words', async () => {
    const pages: Record<string, string> = {
      'https://tonejs.github.io/docs/': recorded('tone-docs.html'),
      'https://tonejs.github.io/docs/latest/index.html': recorded('tone-docs-latest.html'),
      'https://tonejs.github.io/docs/15.1.22/index.html': recorded('tone-docs-15.1.22.html'),
    }
    const { asked, fetchImpl } = web((url) => (pages[url] ? html(pages[url]) : new Response('missing', { status: 404 })))
    const item = await manualPage(createFetcher({ fetchImpl, verb: 'tinker', ...noWait }), MANUAL_START.tone)
    expect(asked).toEqual(Object.keys(pages))
    expect(item).toMatchObject({ source: 'tonejs.github.io', url: 'https://tonejs.github.io/docs/15.1.22/index.html', title: 'Tone.js' })
    expect(wordCount(item.text)).toBeGreaterThan(100)
    expect(item.links.length).toBeGreaterThan(0)
    expect(item.links.every((l) => new URL(l.url).hostname === 'tonejs.github.io')).toBe(true)
  })

  it('does not follow a meta refresh to another host, even an allowed one', async () => {
    const { asked, fetchImpl } = web(() => html(`<meta http-equiv="refresh" content="0; url=https://threejs.org/docs/">`))
    const item = await manualPage(createFetcher({ fetchImpl, verb: 'tinker', ...noWait }), MANUAL_START.tone)
    expect(asked).toEqual([MANUAL_START.tone])
    expect(item.url).toBe(MANUAL_START.tone)
  })

  it('stops after a few meta refreshes, so a loop cannot read forever', async () => {
    let n = 0
    const { asked, fetchImpl } = web(() => html(`<meta http-equiv="refresh" content="0;URL=/docs/${++n}/">`))
    await manualPage(createFetcher({ fetchImpl, verb: 'tinker', ...noWait }), MANUAL_START.tone)
    expect(asked.length).toBe(4)
  })

  it('still offers the page when it is a refresh with nowhere to go', async () => {
    const { fetchImpl } = web(() => html(`<html><head><title>T</title><meta http-equiv="refresh" content="30"></head><body><p>Some words here.</p></body></html>`))
    const item = await manualPage(createFetcher({ fetchImpl, verb: 'tinker', ...noWait }), MANUAL_START.tone)
    expect(item.text).toContain('Some words here.')
  })
})
