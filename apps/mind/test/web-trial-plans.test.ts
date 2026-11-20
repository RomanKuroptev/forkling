import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { HostRule } from '../src/web/allowlist.ts'
import { createFetcher, type FetchImpl } from '../src/web/fetch.ts'
import { readUrl } from '../src/web/sources/index.ts'
import { HOST_PLANS } from '../src/web/starts.ts'
import { TRIAL_HOSTS, TRIAL_PLANS, trialPlanFor } from '../src/web/trial-plans.ts'

const NOW = Date.parse('2026-11-20T10:00:00Z')
const SRC = join(import.meta.dirname, '..', 'src')
/** A host on no list, for a trial of its own. */
const TRIAL: HostRule = { host: 'trial.example.org', kind: 'record', tier: 'voices', gapMs: 60_000 }

function setup(withTrialHosts = true) {
  const calls: string[] = []
  const sleeps: number[] = []
  let now = NOW
  const fetchImpl: FetchImpl = async (url) => {
    calls.push(url)
    if (url.endsWith('/robots.txt')) return new Response('User-Agent: *\nDisallow: /login\nCrawl-delay: 60\n', { status: 200 })
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const fetcher = createFetcher({
    fetchImpl,
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms)
      now += ms
    },
    ...(withTrialHosts ? { trialHosts: [TRIAL] } : {}),
  })
  return { fetcher, calls, sleeps }
}

const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []))

describe('trial-only plans', () => {
  it('are imported by the trial CLI alone, so the mind never reads a trial host', () => {
    const importers = files(SRC)
      .filter((f) => /from '[^']*trial-plans\.ts'|from '[^']*\/trials\//.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f).replace(/\\/g, '/'))
      .filter((f) => !f.startsWith('web/trials/') && f !== 'web/trial-plans.ts')
    expect(importers).toEqual(['trial-cli.ts'])
  })

  it('each have a unique id, a rule for their own host first, and paths for robots.txt', () => {
    const ids = TRIAL_PLANS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const p of TRIAL_PLANS) {
      expect(p.rules[0].host).toBe(p.host)
      expect(p.paths.length).toBeGreaterThan(0)
      expect(trialPlanFor(p.id)).toBe(p)
      expect(HOST_PLANS).not.toContain(p)
    }
    expect(trialPlanFor('no.such/trial')).toBeUndefined()
  })

  it('give TRIAL_HOSTS each host once', () => {
    const hosts = TRIAL_HOSTS.map((r) => r.host)
    expect(new Set(hosts).size).toBe(hosts.length)
    for (const p of TRIAL_PLANS) for (const r of p.rules) expect(hosts).toContain(r.host)
  })

  it('never read Reddit, Know Your Meme, Mastodon, OpenProcessing or xkcd', () => {
    for (const p of TRIAL_PLANS) expect(`${p.id} ${p.host} ${p.itemHost}`).not.toMatch(/reddit|knowyourmeme|mastodon|openprocessing|xkcd/i)
    for (const r of TRIAL_HOSTS) expect(r.host).not.toMatch(/reddit|knowyourmeme|mastodon|openprocessing|xkcd/i)
  })
})

describe('a fetcher with trial hosts', () => {
  it('refuses a trial host without them, as the mind does', async () => {
    const { fetcher } = setup(false)
    await expect(fetcher.json('https://trial.example.org/api/1')).rejects.toMatchObject({ code: 'not-allowed' })
    await expect(readUrl(fetcher, 'https://trial.example.org/post/1')).rejects.toMatchObject({ code: 'not-allowed' })
  })

  it('reads a trial host with them, waiting its gap between requests', async () => {
    const { fetcher, sleeps, calls } = setup()
    await fetcher.json('https://trial.example.org/api/1')
    await fetcher.json('https://trial.example.org/api/2')
    expect(calls).toHaveLength(3)
    expect(sleeps).toHaveLength(2)
    for (const s of sleeps) expect(s).toBeGreaterThanOrEqual(60_000)
  })

  it('still refuses http, a port or a login on a trial host, and any other host', async () => {
    const { fetcher } = setup()
    await expect(fetcher.json('http://trial.example.org/api/1')).rejects.toMatchObject({ code: 'not-allowed' })
    await expect(fetcher.json('https://trial.example.org:8443/api/1')).rejects.toMatchObject({ code: 'not-allowed' })
    await expect(fetcher.json('https://a:b@trial.example.org/api/1')).rejects.toMatchObject({ code: 'not-allowed' })
    await expect(fetcher.json('https://example.com/x')).rejects.toMatchObject({ code: 'not-allowed' })
  })

  it('still honours robots.txt on a trial host', async () => {
    const { fetcher } = setup()
    await expect(fetcher.json('https://trial.example.org/login')).rejects.toMatchObject({ code: 'robots' })
  })
})
