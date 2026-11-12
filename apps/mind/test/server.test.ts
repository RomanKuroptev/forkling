import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import type { NowJson } from '@forkling/schema'
import { createMindServer, type MindServerOptions } from '../src/server.ts'

const PAGES = 'https://romankuroptev.github.io'
const now: NowJson = { updatedAt: '2026-11-12T11:00:00.000Z', asleep: false, step: null, thought: 'Hm.', mood: 'steady' }
const health = { up: true as const, now: '2026-11-12T11:00:00.000Z', asleep: false, shouldBeAwake: true, lastThoughtAt: '2026-11-12T10:58:00.000Z', lastTickAt: '2026-11-12T10:59:00.000Z', warnings: [] }

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

describe('GET /health', () => {
  it('gives what the watchdog reads', async () => {
    const { call } = await start()
    const res = await call('/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(health)
  })
})

describe('POST /notes (closed until W7)', () => {
  it('says the mailbox is closed', async () => {
    const { call } = await start()
    const res = await call('/notes', { method: 'POST', body: '{"text":"hello"}' })
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/mailbox is closed/i) })
  })
})

describe('only those three routes exist', () => {
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
