import { describe, expect, it } from 'vitest'
import { judge, parseHealth, runWatchdog, WATCHDOG_MAX_THOUGHT_AGE_MS } from '../src/watchdog.ts'

const MIN = 60_000
/** In November Stockholm is UTC+1. */
const at = (iso: string) => Date.parse(iso)
const awake = (lastThoughtAt: string | null) => ({ shouldBeAwake: true, lastThoughtAt })

describe('judge: the server answered (spec 14.3)', () => {
  const now = at('2026-11-12T11:00:00Z')

  it('passes when Merge should be asleep, or has only just woken', () => {
    expect(judge({ health: { shouldBeAwake: false, lastThoughtAt: '2026-11-11T21:00:00Z' }, nowMs: now }).ok).toBe(true)
  })

  it('passes when the last thought is within 20 minutes, even exactly 20', () => {
    expect(WATCHDOG_MAX_THOUGHT_AGE_MS).toBe(20 * MIN)
    expect(judge({ health: awake(new Date(now - 19 * MIN).toISOString()), nowMs: now }).ok).toBe(true)
    expect(judge({ health: awake(new Date(now - 20 * MIN).toISOString()), nowMs: now }).ok).toBe(true)
  })

  it('fails when the last thought is over 20 minutes old while Merge should be awake, and says how old', () => {
    const verdict = judge({ health: awake(new Date(now - 21 * MIN).toISOString()), nowMs: now })
    expect(verdict.ok).toBe(false)
    expect(verdict.message).toMatch(/21 minutes/)
  })

  it('fails when Merge should be awake and has never thought', () => {
    const verdict = judge({ health: awake(null), nowMs: now })
    expect(verdict.ok).toBe(false)
    expect(verdict.message).toMatch(/no thought/i)
  })
})

describe('judge: the server did not answer', () => {
  it('fails in the waking hours', () => {
    const verdict = judge({ health: null, nowMs: at('2026-11-12T11:00:00Z') })
    expect(verdict.ok).toBe(false)
    expect(verdict.message).toMatch(/did not answer/i)
  })

  it('does not fail at night, when Merge is asleep and the server may be quiet', () => {
    expect(judge({ health: null, nowMs: at('2026-11-12T03:00:00Z') }).ok).toBe(true)
  })

  it('watches from 08:40 to 22:15 Stockholm time, which is later than the latest weekend wake-up plus the grace and earlier than the earliest bedtime', () => {
    expect(judge({ health: null, nowMs: at('2026-11-12T07:39:00Z') }).ok).toBe(true) // 08:39
    expect(judge({ health: null, nowMs: at('2026-11-12T07:40:00Z') }).ok).toBe(false) // 08:40
    expect(judge({ health: null, nowMs: at('2026-11-12T21:14:00Z') }).ok).toBe(false) // 22:14
    expect(judge({ health: null, nowMs: at('2026-11-12T21:15:00Z') }).ok).toBe(true) // 22:15
  })

  it('follows summer time too', () => {
    // 2026-07-01: Stockholm is UTC+2, so 06:40Z is 08:40 local.
    expect(judge({ health: null, nowMs: at('2026-07-01T06:39:00Z') }).ok).toBe(true)
    expect(judge({ health: null, nowMs: at('2026-07-01T06:40:00Z') }).ok).toBe(false)
  })
})

describe('parseHealth', () => {
  it('reads what /health gives', () => {
    expect(parseHealth('{"up":true,"shouldBeAwake":true,"lastThoughtAt":"2026-11-12T10:58:00.000Z","warnings":[]}')).toEqual({ shouldBeAwake: true, lastThoughtAt: '2026-11-12T10:58:00.000Z' })
    expect(parseHealth('{"shouldBeAwake":false,"lastThoughtAt":null}')).toEqual({ shouldBeAwake: false, lastThoughtAt: null })
  })

  it('gives null for anything that is not that', () => {
    for (const text of ['', 'not json', '[]', '{}', '{"shouldBeAwake":"yes","lastThoughtAt":null}', '{"shouldBeAwake":true,"lastThoughtAt":5}', '{"shouldBeAwake":true,"lastThoughtAt":"not a time"}']) {
      expect(parseHealth(text), text).toBeNull()
    }
  })
})

describe('runWatchdog (what the workflow runs)', () => {
  const now = at('2026-11-12T11:00:00Z')
  const answering = (body: string, status = 200) => (async () => new Response(body, { status })) as typeof fetch

  it('asks /health on the server and judges the answer', async () => {
    const urls: string[] = []
    const fetchImpl = (async (url: string | URL | Request) => {
      urls.push(String(url))
      return new Response(JSON.stringify({ shouldBeAwake: true, lastThoughtAt: new Date(now - 5 * MIN).toISOString() }))
    }) as typeof fetch
    expect((await runWatchdog('https://merge-mind.example.org/', { fetch: fetchImpl, nowMs: now })).ok).toBe(true)
    expect(urls).toEqual(['https://merge-mind.example.org/health'])
  })

  it('treats a network error, a bad status and a garbled body as no answer', async () => {
    const refuses = (async () => {
      throw new Error('connect ECONNREFUSED')
    }) as typeof fetch
    for (const fetchImpl of [refuses, answering('{}', 502), answering('<html>')]) {
      const verdict = await runWatchdog('https://merge-mind.example.org', { fetch: fetchImpl, nowMs: now })
      expect(verdict.ok).toBe(false)
      expect(verdict.message).toMatch(/did not answer/i)
    }
  })

  it('fails plainly when there is no address to ask', async () => {
    const verdict = await runWatchdog('', { fetch: answering('{}'), nowMs: now })
    expect(verdict.ok).toBe(false)
    expect(verdict.message).toMatch(/MIND_URL/)
  })
})
