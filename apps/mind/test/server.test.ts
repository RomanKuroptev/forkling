import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import type { NowJson, Place } from '@forkling/schema'
import { createMindServer, type MindServerOptions } from '../src/server.ts'

const PAGES = 'https://romankuroptev.github.io'
const now: NowJson = { updatedAt: '2026-11-12T11:00:00.000Z', asleep: false, step: null, thought: 'Hm.', mood: 'steady' }
const health = { up: true as const, now: '2026-11-12T11:00:00.000Z', asleep: false, shouldBeAwake: true, lastThoughtAt: '2026-11-12T10:58:00.000Z', lastTickAt: '2026-11-12T10:59:00.000Z', warnings: [], sandbox: 'missing' as const, credit: 'ok' as const }

let server: Server | undefined
afterEach(async () => {
  await new Promise((r) => (server ? server.close(() => r(undefined)) : r(undefined)))
  server = undefined
})

async function start(over: Partial<MindServerOptions> = {}) {
  server = createMindServer({ now: () => now, health: () => health, pagesOrigin: PAGES, ...over })
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r))
  const { port, address } = server.address() as AddressInfo
  expect(address).toBe('127.0.0.1')
  const call = (path: string, init: RequestInit & { origin?: string } = {}) => {
    const { origin, ...rest } = init
    return fetch(`http://127.0.0.1:${port}${path}`, { ...rest, headers: { ...(origin ? { Origin: origin } : {}), ...(rest.headers ?? {}) } })
  }
  return { call }
}

describe('GET /now.json', () => {
  it('gives the last now.json, never cached', async () => {
    const { call } = await start()
    const res = await call('/now.json')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/application\/json/)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.json()).toEqual(now)
  })

  it('says it is not ready before the first tick', async () => {
    const { call } = await start({ now: () => null })
    expect((await call('/now.json')).status).toBe(503)
  })
})

describe('GET /now.json counts real visits (issue #422)', () => {
  const counter = () => {
    const hits: { visit: boolean; place: string | null }[] = []
    return { hits, visits: { record: (h: { visit: boolean; place: string | null }) => void hits.push(h) } }
  }

  it("counts a visit and a place from Merge's own page, and still answers now.json", async () => {
    const c = counter()
    const { call } = await start({ visits: c.visits })
    const res = await call('/now.json?visit=1&in=home', { origin: PAGES })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(now)
    await call('/now.json?in=workshop', { origin: PAGES })
    await call('/now.json', { origin: PAGES })
    expect(c.hits).toEqual([{ visit: true, place: 'home' }, { visit: false, place: 'workshop' }])
  })

  it('counts nothing from a call with no origin (the watchdog, curl) or a refused origin', async () => {
    const c = counter()
    const { call } = await start({ visits: c.visits })
    await call('/now.json?visit=1&in=home')
    expect((await call('/now.json?visit=1', { origin: 'https://evil.example' })).status).toBe(403)
    expect(c.hits).toEqual([])
  })

  it('counts nothing on another route', async () => {
    const c = counter()
    const { call } = await start({ visits: c.visits })
    await call('/places.json?visit=1&in=home', { origin: PAGES })
    expect(c.hits).toEqual([])
  })
})

describe('GET /health', () => {
  it('gives what the watchdog reads', async () => {
    const { call } = await start()
    const res = await call('/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(health)
  })
})

describe('POST /notes (spec 10.1, 11.2)', () => {
  const post = (call: Awaited<ReturnType<typeof start>>['call'], body: string, headers: Record<string, string> = { 'Content-Type': 'application/json' }, origin?: string) =>
    call('/notes', { method: 'POST', body, headers, ...(origin ? { origin } : {}) })

  it('says the mailbox is closed when the server has no way to take notes (no Turnstile secret)', async () => {
    const { call } = await start()
    const res = await post(call, '{"message":"hello"}')
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/mailbox is closed/i) })
  })

  it('hands the parsed body and the visitor\'s address to the mailbox and passes its answer back, never cached', async () => {
    const seen: { body: unknown; ip: string }[] = []
    const { call } = await start({ notes: { submit: async (body, ip) => (seen.push({ body, ip }), { status: 202, body: { ok: true, id: 'n-1' } }) } })
    const res = await post(call, '{"message":"hello","token":"t"}', { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.9' }, PAGES)
    expect(res.status).toBe(202)
    expect(await res.json()).toEqual({ ok: true, id: 'n-1' })
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('access-control-allow-origin')).toBe(PAGES)
    expect(seen).toEqual([{ body: { message: 'hello', token: 't' }, ip: '203.0.113.9' }])
  })

  it('takes the address Caddy added (the last in X-Forwarded-For), not one the visitor wrote', async () => {
    const seen: string[] = []
    const { call } = await start({ notes: { submit: async (_b, ip) => (seen.push(ip), { status: 202, body: { ok: true } }) } })
    await post(call, '{}', { 'Content-Type': 'application/json', 'X-Forwarded-For': '6.6.6.6, 198.51.100.7' })
    expect(seen).toEqual(['198.51.100.7'])
  })

  it('falls back to the connection\'s own address when there is no header (a local try-out)', async () => {
    const seen: string[] = []
    const { call } = await start({ notes: { submit: async (_b, ip) => (seen.push(ip), { status: 202, body: { ok: true } }) } })
    await post(call, '{}')
    expect(seen[0]).toMatch(/127\.0\.0\.1|::1/)
  })

  it('turns down a body that is too big (8 KB) without reading on, and never hands it over', async () => {
    let called = 0
    const { call } = await start({ notes: { submit: async () => (called++, { status: 202, body: { ok: true } }) } })
    const res = await post(call, JSON.stringify({ message: 'x'.repeat(9000) }))
    expect(res.status).toBe(413)
    expect(called).toBe(0)
  })

  it('turns down text that is not JSON (400) and a body that is not declared as JSON (415)', async () => {
    let called = 0
    const { call } = await start({ notes: { submit: async () => (called++, { status: 202, body: { ok: true } }) } })
    expect((await post(call, 'not json')).status).toBe(400)
    expect((await post(call, '{"message":"x"}', { 'Content-Type': 'text/plain' })).status).toBe(415)
    expect(called).toBe(0)
  })

  it('tells a stranger nothing about why when the mailbox itself breaks', async () => {
    const { call } = await start({ notes: { submit: async () => { throw new Error('secret detail: /var/lib/forkling') } } })
    const res = await post(call, '{}')
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toMatch(/secret|forkling/)
  })

  it('refuses any browser origin but Merge\'s own, even for a note', async () => {
    const { call } = await start({ notes: { submit: async () => ({ status: 202, body: { ok: true } }) } })
    expect((await post(call, '{}', { 'Content-Type': 'application/json' }, 'https://evil.example')).status).toBe(403)
  })

  it('answers the browser\'s preflight for POST with a JSON body from Merge\'s own address', async () => {
    const { call } = await start({ notes: { submit: async () => ({ status: 202, body: { ok: true } }) } })
    const res = await call('/notes', { method: 'OPTIONS', origin: PAGES })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-methods')).toMatch(/POST/)
    expect(res.headers.get('access-control-allow-headers')).toMatch(/Content-Type/i)
  })
})

describe('GET /notes.json (spec 10.1: the notes the world shows)', () => {
  const body = { notes: [{ id: 'n-1', name: '', message: 'Hi', placeId: 'home', at: '2026-11-16T09:00:00.000Z', topics: [], status: 'new', foundAt: null, reply: null, declineReason: null, position: null }] }
  it("gives the notes, never cached, to Merge's own site", async () => {
    const { call } = await start({ publicNotes: () => body as never })
    const res = await call('/notes.json', { origin: PAGES })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('access-control-allow-origin')).toBe(PAGES)
    expect(await res.json()).toEqual(body)
  })
  it('says it is not ready with no mailbox to read, refuses other origins, and takes only GET', async () => {
    const none = await start()
    expect((await none.call('/notes.json')).status).toBe(503)
    const { call } = await start({ publicNotes: () => body as never })
    expect((await call('/notes.json', { origin: 'https://evil.example' })).status).toBe(403)
    expect((await call('/notes.json', { method: 'POST' })).status).toBe(405)
  })
})

describe('GET /places.json (W5: so a tend shows in the viewer within a minute, without GitHub)', () => {
  const places = { rev: 'abc123', places: [{ id: 'home' }] as unknown as Place[] }
  it('gives the places as the last tick left them, never cached', async () => {
    const { call } = await start({ places: () => places })
    const res = await call('/places.json', { origin: PAGES })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('access-control-allow-origin')).toBe(PAGES)
    expect(await res.json()).toEqual(places)
  })
  it('says it is not ready before the first tick, and refuses other origins and methods', async () => {
    const { call } = await start({ places: () => null })
    expect((await call('/places.json')).status).toBe(503)
    expect((await call('/places.json', { origin: 'https://evil.example' })).status).toBe(403)
    expect((await call('/places.json', { method: 'POST' })).status).toBe(405)
  })
})

describe('only those four routes exist', () => {
  it('answers 404 for anything else, and 405 for the wrong method on a route', async () => {
    const { call } = await start()
    expect((await call('/')).status).toBe(404)
    expect((await call('/mind/state.json')).status).toBe(404)
    expect((await call('/now.json', { method: 'POST' })).status).toBe(405)
    expect((await call('/notes')).status).toBe(405)
  })
})

describe('cross-origin requests (spec 11.2: only from Merge\'s Pages address)', () => {
  it('lets the Pages origin read, and says so in the headers', async () => {
    const { call } = await start()
    const res = await call('/now.json', { origin: PAGES })
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe(PAGES)
    expect(res.headers.get('vary')).toMatch(/origin/i)
  })

  it('refuses any other origin, with no allow header', async () => {
    const { call } = await start()
    const res = await call('/now.json', { origin: 'https://evil.example' })
    expect(res.status).toBe(403)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('serves a request with no origin (the watchdog, curl) without any allow header', async () => {
    const { call } = await start()
    const res = await call('/health')
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('answers the preflight for the Pages origin and refuses it for others', async () => {
    const { call } = await start()
    const ok = await call('/notes', { method: 'OPTIONS', origin: PAGES, headers: { 'Access-Control-Request-Method': 'POST' } })
    expect(ok.status).toBe(204)
    expect(ok.headers.get('access-control-allow-origin')).toBe(PAGES)
    expect(ok.headers.get('access-control-allow-methods')).toMatch(/POST/)
    const no = await call('/notes', { method: 'OPTIONS', origin: 'https://evil.example', headers: { 'Access-Control-Request-Method': 'POST' } })
    expect(no.status).toBe(403)
  })
})

describe('when a provider throws', () => {
  it('answers 500 without leaking the error, and keeps serving', async () => {
    let boom = true
    const { call } = await start({
      health: () => {
        if (boom) throw new Error('secret /path/to/disk')
        return health
      },
    })
    const bad = await call('/health')
    expect(bad.status).toBe(500)
    expect(await bad.text()).not.toContain('secret')
    boom = false
    expect((await call('/health')).status).toBe(200)
  })
})
