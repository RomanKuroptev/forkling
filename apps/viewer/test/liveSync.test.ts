import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { mindUrlFrom, startLiveSync, type LiveSyncDeps } from '../src/world/liveSync.ts'

const template = JSON.parse(readFileSync(fileURLToPath(new URL('../../../templates/forkling-world/places/home.json', import.meta.url)), 'utf8'))
const home = (sign: string) => ({ ...template, exterior: { ...template.exterior, sign } })

/** A fake clock and a fake server: nothing waits in real time. */
function setup(initial: { rev: string; sign: string }) {
  let timer: { at: number; run: () => void } | null = null
  let nowMs = 0
  const server = { ...initial, up: true }
  const seen: string[] = []
  const fetched: string[] = []
  const deps: LiveSyncDeps = {
    mindUrl: 'https://merge-mind.example',
    intervalMs: 30_000,
    fetch: (async (url: string) => {
      fetched.push(url)
      if (!server.up) throw new Error('down')
      if (url.endsWith('/now.json')) return new Response(JSON.stringify({ updatedAt: '2026-11-13T10:00:00.000Z', asleep: false, step: null, thought: null, mood: 'steady', placesRev: server.rev }))
      return new Response(JSON.stringify({ rev: server.rev, places: [home(server.sign)] }))
    }) as unknown as typeof fetch,
    setTimer: (run, ms) => {
      timer = { at: nowMs + ms, run }
      return 1
    },
    clearTimer: () => {
      timer = null
    },
    knownRev: 'r1',
    onPlaces: (places) => seen.push(places[0]!.exterior.sign),
  }
  const advance = async (ms: number) => {
    const end = nowMs + ms
    while (timer && timer.at <= end) {
      nowMs = timer.at
      const t = timer
      timer = null
      t.run()
      await new Promise((r) => setTimeout(r, 0))
    }
    nowMs = end
  }
  return { deps, server, seen, fetched, advance }
}

describe('the viewer stays current (spec 4.6: poll now.json every 30 s; a tend shows within a minute)', () => {
  it('reloads the places within 60 seconds of a tend, and not before one', async () => {
    const s = setup({ rev: 'r1', sign: 'HOME' })
    const stop = startLiveSync(s.deps)
    await s.advance(30_000)
    expect(s.seen).toEqual([])
    s.server.rev = 'r2'
    s.server.sign = 'MY HOME'
    await s.advance(60_000)
    expect(s.seen).toEqual(['MY HOME'])
    stop()
  })

  it('fetches the places once per change, not once per poll', async () => {
    const s = setup({ rev: 'r2', sign: 'MY HOME' })
    startLiveSync(s.deps)
    await s.advance(120_000)
    expect(s.fetched.filter((u) => u.endsWith('/places.json'))).toHaveLength(1)
    expect(s.seen).toHaveLength(1)
  })

  it('keeps what it has when the server is down, and goes on polling', async () => {
    const s = setup({ rev: 'r1', sign: 'HOME' })
    startLiveSync(s.deps)
    s.server.up = false
    await s.advance(90_000)
    expect(s.seen).toEqual([])
    s.server.up = true
    s.server.rev = 'r2'
    await s.advance(30_000)
    expect(s.seen).toHaveLength(1)
  })

  it('ignores a places file that does not fit the schema', async () => {
    const s = setup({ rev: 'r1', sign: 'HOME' })
    s.deps.fetch = (async (url: string) => (url.endsWith('/now.json') ? new Response(JSON.stringify({ updatedAt: '2026-11-13T10:00:00.000Z', asleep: false, step: null, thought: null, mood: 'x', placesRev: 'r2' })) : new Response(JSON.stringify({ rev: 'r2', places: [{ id: 'home' }] })))) as unknown as typeof fetch
    startLiveSync(s.deps)
    await s.advance(30_000)
    expect(s.seen).toEqual([])
  })

  it('does nothing without a server address (a world read from GitHub alone)', async () => {
    const s = setup({ rev: 'r1', sign: 'HOME' })
    startLiveSync({ ...s.deps, mindUrl: null })
    await s.advance(120_000)
    expect(s.fetched).toEqual([])
  })

  it('stops polling when stopped', async () => {
    const s = setup({ rev: 'r1', sign: 'HOME' })
    const stop = startLiveSync(s.deps)
    stop()
    await s.advance(120_000)
    expect(s.fetched).toEqual([])
  })
})

describe('the server address', () => {
  it('takes the page address first, then the build, and only https or a local test server', () => {
    expect(mindUrlFrom('https://a.example/x', 'https://b.example')).toBe('https://a.example')
    expect(mindUrlFrom(null, 'https://b.example/')).toBe('https://b.example')
    expect(mindUrlFrom('http://localhost:8787', undefined)).toBe('http://localhost:8787')
    expect(mindUrlFrom('http://evil.example', undefined)).toBeNull()
    expect(mindUrlFrom('javascript:alert(1)', undefined)).toBeNull()
    expect(mindUrlFrom('nonsense', '')).toBeNull()
    expect(mindUrlFrom(null, undefined)).toBeNull()
  })
})
