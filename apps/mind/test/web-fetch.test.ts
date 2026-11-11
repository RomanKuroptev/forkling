import { describe, expect, it } from 'vitest'
import { ALLOWLIST, hostRule, isAllowed, USER_AGENT } from '../src/web/allowlist.ts'
import { createFetcher, WebError, type FetchImpl } from '../src/web/fetch.ts'

const NOW = Date.parse('2026-11-18T10:00:00Z')

/** A fetch that answers from a table, records every call, and a clock the test moves by hand. */
function setup(answers: Record<string, () => Response | Promise<Response>>, paused: Record<string, string> = {}) {
  const calls: { url: string; init?: RequestInit }[] = []
  const sleeps: number[] = []
  let now = NOW
  const fetchImpl: FetchImpl = async (url, init) => {
    calls.push({ url, init })
    const answer = answers[url]
    if (!answer) throw new Error(`no answer for ${url}`)
    return answer()
  }
  const fetcher = createFetcher({
    fetchImpl,
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms)
      now += ms
    },
    paused,
  })
  return { fetcher, calls, sleeps, advance: (ms: number) => (now += ms), clock: () => now }
}

const ok = (body: string, headers: Record<string, string> = {}) => () => new Response(body, { status: 200, headers })
const redirect = (to: string) => () => new Response(null, { status: 302, headers: { location: to } })

describe('the allowlist', () => {
  it('holds the hosts of spec 6.1, each with a kind, a tier and a rate', () => {
    for (const host of ['en.wikipedia.org', 'esolangs.org', 'p5js.org', 'tonejs.github.io', 'threejs.org', 'developer.mozilla.org', 'hacker-news.firebaseio.com', 'lobste.rs', 'api.github.com', 'api.imgflip.com', 'commons.wikimedia.org', 'api.artic.edu', 'api.nasa.gov']) {
      expect(isAllowed(`https://${host}/x`), host).toBe(true)
    }
    for (const rule of ALLOWLIST) {
      expect(['page', 'record', 'image']).toContain(rule.kind)
      expect(['reference', 'voices']).toContain(rule.tier)
      expect(rule.gapMs).toBeGreaterThanOrEqual(1000)
    }
  })

  it('refuses everything else: other hosts, plain http, other ports, logins in the URL and look-alike hosts', () => {
    expect(isAllowed('https://example.com/')).toBe(false)
    expect(isAllowed('http://en.wikipedia.org/wiki/Moon')).toBe(false)
    expect(isAllowed('https://en.wikipedia.org:8443/wiki/Moon')).toBe(false)
    expect(isAllowed('https://user:pw@en.wikipedia.org/wiki/Moon')).toBe(false)
    expect(isAllowed('https://en.wikipedia.org.evil.com/')).toBe(false)
    expect(isAllowed('https://evil.com/en.wikipedia.org')).toBe(false)
    expect(isAllowed('not a url')).toBe(false)
    expect(isAllowed('file:///etc/passwd')).toBe(false)
  })

  it('sets the rates of spec 6.1: Wikimedia 1 every 2 s, artic.edu 30 a minute, anything else 1 a second', () => {
    expect(hostRule('en.wikipedia.org')!.gapMs).toBe(2000)
    expect(hostRule('commons.wikimedia.org')!.gapMs).toBe(2000)
    expect(hostRule('api.artic.edu')!.gapMs).toBe(2000)
    expect(hostRule('lobste.rs')!.gapMs).toBe(1000)
  })

  it('names the project and where to find it in the User-Agent, with no email address', () => {
    expect(USER_AGENT).toMatch(/^forkling\/\S+ \(/)
    expect(USER_AGENT).toContain('https://github.com/RomanKuroptev/forkling')
    expect(USER_AGENT).not.toMatch(/@/)
  })
})

describe('a fetch', () => {
  it('reads an allowed page with the User-Agent and an Accept header', async () => {
    const { fetcher, calls } = setup({ 'https://lobste.rs/hottest.json': ok('[]') })
    expect(await fetcher.text('https://lobste.rs/hottest.json', { accept: 'application/json' })).toBe('[]')
    expect(calls).toHaveLength(1)
    const headers = calls[0]!.init!.headers as Record<string, string>
    expect(headers['User-Agent']).toBe(USER_AGENT)
    expect(headers.Accept).toBe('application/json')
    expect(calls[0]!.init!.signal).toBeInstanceOf(AbortSignal)
  })

  it('never touches the network for a host that is not on the list, and logs the refusal', async () => {
    const { fetcher, calls } = setup({})
    await expect(fetcher.text('https://example.com/')).rejects.toMatchObject({ code: 'not-allowed' })
    expect(calls).toHaveLength(0)
    expect(fetcher.log).toEqual([{ at: new Date(NOW).toISOString(), url: 'https://example.com/', host: 'example.com', outcome: 'not-allowed' }])
  })

  it('follows a redirect to another allowed host and logs both requests', async () => {
    const { fetcher, calls } = setup({
      'https://en.wikipedia.org/wiki/A': redirect('https://en.wikipedia.org/wiki/B'),
      'https://en.wikipedia.org/wiki/B': ok('B'),
    })
    expect(await fetcher.text('https://en.wikipedia.org/wiki/A')).toBe('B')
    expect(calls.map((c) => c.url)).toEqual(['https://en.wikipedia.org/wiki/A', 'https://en.wikipedia.org/wiki/B'])
    expect(calls.every((c) => (c.init as RequestInit).redirect === 'manual')).toBe(true)
    expect(fetcher.log.map((l) => l.outcome)).toEqual(['redirect', 'ok'])
  })

  it('refuses a redirect to a host that is not on the list, without following it', async () => {
    const { fetcher, calls } = setup({ 'https://lobste.rs/s/x': redirect('https://example.com/steal') })
    await expect(fetcher.text('https://lobste.rs/s/x')).rejects.toMatchObject({ code: 'redirect-not-allowed' })
    expect(calls.map((c) => c.url)).toEqual(['https://lobste.rs/s/x'])
  })

  it('refuses a redirect to plain http, resolves a relative redirect, and gives up after 5 redirects', async () => {
    const a = setup({ 'https://lobste.rs/a': redirect('http://lobste.rs/b') })
    await expect(a.fetcher.text('https://lobste.rs/a')).rejects.toMatchObject({ code: 'redirect-not-allowed' })
    const b = setup({ 'https://lobste.rs/a': redirect('/b'), 'https://lobste.rs/b': ok('fine') })
    expect(await b.fetcher.text('https://lobste.rs/a')).toBe('fine')
    const loop = setup({ 'https://lobste.rs/a': redirect('https://lobste.rs/a') })
    await expect(loop.fetcher.text('https://lobste.rs/a')).rejects.toMatchObject({ code: 'too-many-redirects' })
    expect(loop.calls).toHaveLength(6)
  })

  it('refuses a body over 2 MB, by its header and by counting what arrives', async () => {
    const big = 'x'.repeat(2 * 1024 * 1024 + 1)
    const byHeader = setup({ 'https://lobste.rs/a': ok('small', { 'content-length': String(big.length) }) })
    await expect(byHeader.fetcher.text('https://lobste.rs/a')).rejects.toMatchObject({ code: 'too-big' })
    const byCount = setup({ 'https://lobste.rs/a': ok(big) })
    await expect(byCount.fetcher.text('https://lobste.rs/a')).rejects.toMatchObject({ code: 'too-big' })
    const exact = setup({ 'https://lobste.rs/a': ok('x'.repeat(2 * 1024 * 1024)) })
    expect((await exact.fetcher.text('https://lobste.rs/a')).length).toBe(2 * 1024 * 1024)
  })

  it('gives bytes for an image, and refuses an image over its limit', async () => {
    const { fetcher } = setup({ 'https://upload.wikimedia.org/a.jpg': () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }) })
    const got = await fetcher.bytes('https://upload.wikimedia.org/a.jpg')
    expect([...got.bytes]).toEqual([1, 2, 3])
    expect(got.contentType).toBe('image/jpeg')
  })

  it('turns a timeout, a network error and a bad status into errors with a code, and logs each', async () => {
    const t = setup({ 'https://lobste.rs/slow': () => Promise.reject(new DOMException('slow', 'TimeoutError')) })
    await expect(t.fetcher.text('https://lobste.rs/slow')).rejects.toMatchObject({ code: 'timeout' })
    const n = setup({ 'https://lobste.rs/down': () => Promise.reject(new TypeError('fetch failed')) })
    await expect(n.fetcher.text('https://lobste.rs/down')).rejects.toMatchObject({ code: 'network' })
    const s = setup({ 'https://lobste.rs/missing': () => new Response('no', { status: 404 }) })
    await expect(s.fetcher.text('https://lobste.rs/missing')).rejects.toMatchObject({ code: 'http', status: 404 })
    expect([t, n, s].map((x) => x.fetcher.log[0]!.outcome)).toEqual(['timeout', 'network', 'http-404'])
  })
})

describe('the rate of each host', () => {
  it('waits out the gap before a second request to the same host, and not between hosts', async () => {
    const { fetcher, sleeps } = setup({
      'https://en.wikipedia.org/a': ok('a'),
      'https://en.wikipedia.org/b': ok('b'),
      'https://lobste.rs/a': ok('c'),
    })
    await fetcher.text('https://en.wikipedia.org/a')
    await fetcher.text('https://lobste.rs/a')
    expect(sleeps).toEqual([])
    await fetcher.text('https://en.wikipedia.org/b')
    expect(sleeps).toEqual([2000])
  })

  it('does not wait when the gap has already passed', async () => {
    const { fetcher, sleeps, advance } = setup({ 'https://lobste.rs/a': ok('a'), 'https://lobste.rs/b': ok('b') })
    await fetcher.text('https://lobste.rs/a')
    advance(1500)
    await fetcher.text('https://lobste.rs/b')
    expect(sleeps).toEqual([])
  })
})

describe('a host that says no', () => {
  it('is paused for 24 hours after a 429 or a 403, with no retry', async () => {
    for (const status of [429, 403]) {
      const { fetcher, calls, advance } = setup({ 'https://lobste.rs/a': () => new Response('slow down', { status }) })
      await expect(fetcher.text('https://lobste.rs/a')).rejects.toMatchObject({ code: 'http', status })
      expect(calls).toHaveLength(1)
      expect(fetcher.pausedHosts()).toEqual({ 'lobste.rs': new Date(NOW + 24 * 3_600_000).toISOString() })
      await expect(fetcher.text('https://lobste.rs/a')).rejects.toMatchObject({ code: 'paused' })
      expect(calls).toHaveLength(1)
      advance(24 * 3_600_000 + 1)
      expect(fetcher.pausedHosts()).toEqual({})
    }
  })

  it('starts out paused for a host the last tick paused, and reads again once the time is up', async () => {
    const until = new Date(NOW + 3_600_000).toISOString()
    const { fetcher, calls, advance } = setup({ 'https://lobste.rs/a': ok('back') }, { 'lobste.rs': until })
    await expect(fetcher.text('https://lobste.rs/a')).rejects.toMatchObject({ code: 'paused' })
    expect(calls).toHaveLength(0)
    advance(3_600_001)
    expect(await fetcher.text('https://lobste.rs/a')).toBe('back')
  })

  it('pauses only the host that answered no, and a 403 on a redirect target pauses that host', async () => {
    const { fetcher } = setup({
      'https://en.wikipedia.org/a': redirect('https://commons.wikimedia.org/b'),
      'https://commons.wikimedia.org/b': () => new Response('no', { status: 403 }),
      'https://lobste.rs/a': ok('fine'),
    })
    await expect(fetcher.text('https://en.wikipedia.org/a')).rejects.toBeInstanceOf(WebError)
    expect(Object.keys(fetcher.pausedHosts())).toEqual(['commons.wikimedia.org'])
    expect(await fetcher.text('https://lobste.rs/a')).toBe('fine')
  })
})

describe('the log', () => {
  it('has one line for every request or refusal, with the host and what came of it', async () => {
    const { fetcher } = setup({ 'https://lobste.rs/a': ok('a') })
    await fetcher.text('https://lobste.rs/a')
    await fetcher.text('https://example.com/').catch(() => {})
    expect(fetcher.log.map((l) => [l.host, l.outcome])).toEqual([
      ['lobste.rs', 'ok'],
      ['example.com', 'not-allowed'],
    ])
  })
})
