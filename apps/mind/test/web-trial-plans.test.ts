import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isAllowed, isReadable } from '../src/web/allowlist.ts'
import { createFetcher, type FetchImpl } from '../src/web/fetch.ts'
import { readUrl } from '../src/web/sources/index.ts'
import { HOST_PLANS, planFor } from '../src/web/starts.ts'
import { TRIAL_HOSTS, TRIAL_PLANS, trialPlanFor } from '../src/web/trial-plans.ts'
import { lemmyPost } from '../src/web/trials/lemmy.ts'

const NOW = Date.parse('2026-11-20T10:00:00Z')
const SRC = join(import.meta.dirname, '..', 'src')

function setup(answers: Record<string, unknown>, withTrialHosts = true) {
  const calls: string[] = []
  const sleeps: number[] = []
  let now = NOW
  const fetchImpl: FetchImpl = async (url) => {
    calls.push(url)
    if (url.endsWith('/robots.txt')) return new Response('User-Agent: *\nDisallow: /login\nCrawl-delay: 60\n', { status: 200 })
    const answer = answers[url]
    if (answer === undefined) return new Response('not found', { status: 404 })
    return new Response(JSON.stringify(answer), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const fetcher = createFetcher({
    fetchImpl,
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms)
      now += ms
    },
    ...(withTrialHosts ? { trialHosts: TRIAL_HOSTS } : {}),
  })
  return { fetcher, calls, sleeps }
}

const view = (id: number, extra: Record<string, unknown> = {}) => ({
  post: { id, name: `Post ${id}`, body: null, url: null, thumbnail_url: null, nsfw: false, removed: false, deleted: false, featured_community: false, featured_local: false, ...extra },
  community: { name: 'showerthoughts' },
  counts: { score: 100 + id, comments: 3 },
})

const API = 'https://lemmy.world/api/v3'
const list = (community: string) => `${API}/post/list?community_name=${community}&sort=Hot&limit=20&page=1`
const comments = (id: number) => `${API}/comment/list?post_id=${id}&sort=Top&type_=All&max_depth=1&limit=5`

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
    }
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

  it('are found by their id and are not plans the mind uses', () => {
    expect(trialPlanFor('lemmy.world/c/memes')?.host).toBe('lemmy.world')
    expect(trialPlanFor('lemmy.world/c/showerthoughts')?.feed).toBe(true)
    expect(trialPlanFor('lemmy.world/c/nothing')).toBeUndefined()
    for (const p of TRIAL_PLANS) expect(HOST_PLANS).not.toContain(p)
  })
})

describe('the Lemmy trials', () => {
  it('are not on the allowlist', () => {
    expect(isAllowed('https://lemmy.world/api/v3/post/list')).toBe(false)
    expect(isReadable('https://lemmy.world/post/1')).toBe(false)
    expect(planFor('lemmy.world')).toBeUndefined()
  })

  it('wait the 60 seconds robots.txt asks for between two requests', () => {
    expect(TRIAL_HOSTS.find((r) => r.host === 'lemmy.world')!.gapMs).toBeGreaterThanOrEqual(60_000)
  })
})

describe('a fetcher with trial hosts', () => {
  it('refuses a trial host without them, as the mind does', async () => {
    const { fetcher } = setup({}, false)
    await expect(fetcher.json(`${API}/post?id=1`)).rejects.toMatchObject({ code: 'not-allowed' })
    await expect(readUrl(fetcher, 'https://lemmy.world/post/1')).rejects.toMatchObject({ code: 'not-allowed' })
  })

  it('reads a trial host with them, waiting its gap between requests', async () => {
    const { fetcher, sleeps, calls } = setup({ [`${API}/post?id=1`]: { post_view: view(1) }, [`${API}/post?id=2`]: { post_view: view(2) } })
    await fetcher.json(`${API}/post?id=1`)
    await fetcher.json(`${API}/post?id=2`)
    expect(calls).toHaveLength(3)
    expect(sleeps).toHaveLength(2)
    for (const s of sleeps) expect(s).toBeGreaterThanOrEqual(60_000)
  })

  it('still refuses http, a port or a login on a trial host, and any other host', async () => {
    const { fetcher } = setup({})
    await expect(fetcher.json('http://lemmy.world/api/v3/post?id=1')).rejects.toMatchObject({ code: 'not-allowed' })
    await expect(fetcher.json('https://lemmy.world:8443/api/v3/post?id=1')).rejects.toMatchObject({ code: 'not-allowed' })
    await expect(fetcher.json('https://a:b@lemmy.world/api/v3/post?id=1')).rejects.toMatchObject({ code: 'not-allowed' })
    await expect(fetcher.json('https://example.com/x')).rejects.toMatchObject({ code: 'not-allowed' })
  })
})

describe('a Lemmy post as an item', () => {
  it('has the title, the body and the top comments as text, other hot posts as links, and only lemmy.world pictures', async () => {
    const plan = trialPlanFor('lemmy.world/c/showerthoughts')!
    plan.reset?.()
    const body = 'If you think about it, ' + 'every '.repeat(10) + '[a link](https://example.com/x) ![pic](https://lemmy.world/pictrs/image/a.png)'
    const { fetcher, calls } = setup({
      [list('showerthoughts')]: {
        posts: [view(1, { body, url: 'https://lemmy.world/pictrs/image/b.jpeg' }), view(2), view(3, { nsfw: true }), view(4, { removed: true }), view(5), view(6, { featured_community: true }), view(8, { featured_local: true })],
      },
      [comments(1)]: { comments: [{ comment: { content: 'Ha, true.', removed: false, deleted: false } }, { comment: { content: 'gone', removed: true, deleted: false } }] },
    })
    const item = await plan.start(fetcher, 0, 0)
    // The post came with the list: only the list and its comments were asked for (and robots.txt).
    expect(calls.filter((c) => c.includes('/post?id='))).toEqual([])
    expect(item.url).toBe('https://lemmy.world/post/1')
    expect(item.source).toBe('lemmy.world')
    expect(item.kind).toBe('record')
    expect(item.tier).toBe('voices')
    expect(item.text).toContain('Post 1')
    expect(item.text).toContain('If you think about it')
    expect(item.text).toContain('a link')
    expect(item.text).not.toContain('https://example.com/x')
    expect(item.text).not.toContain('pictrs')
    expect(item.text).toContain('Ha, true.')
    expect(item.text).not.toContain('gone')
    // Pinned posts (6, 8), NSFW (3) and removed (4) posts are not offered.
    expect(item.links.map((l) => l.url)).toEqual(['https://lemmy.world/post/2', 'https://lemmy.world/post/5'])
    expect(item.images).toEqual([{ url: 'https://lemmy.world/pictrs/image/b.jpeg', licence: null, credit: null }])
  })

  it('keeps no picture from another host, and opens a post by its page URL only', async () => {
    const plan = trialPlanFor('lemmy.world/c/memes')!
    const { fetcher } = setup({
      [`${API}/post?id=7`]: { post_view: view(7, { url: 'https://i.imgur.com/x.png', thumbnail_url: 'https://lemmy.world/pictrs/image/t.webp' }) },
      [comments(7)]: { comments: [] },
    })
    const item = await plan.open(fetcher, 'https://lemmy.world/post/7')
    expect(item.images.map((i) => i.url)).toEqual(['https://lemmy.world/pictrs/image/t.webp'])
    expect(item.text).toContain('links to a page on i.imgur.com')
    await expect(plan.open(fetcher, 'https://example.com/post/7')).rejects.toMatchObject({ code: 'not-allowed' })
  })

  it('refuses a post marked NSFW, removed or deleted', async () => {
    const { fetcher } = setup({ [`${API}/post?id=9`]: { post_view: view(9, { nsfw: true }) }, [comments(9)]: { comments: [] } })
    await expect(lemmyPost(fetcher, 'memes', 9, [])).rejects.toThrow()
  })

  it('counts how many posts would be readable without their comments, for the report', async () => {
    const plan = trialPlanFor('lemmy.world/c/memes')!
    const { fetcher } = setup({
      [list('memes')]: { posts: [view(1)] },
      [`${API}/post?id=1`]: { post_view: view(1) },
      [comments(1)]: { comments: [{ comment: { content: 'word '.repeat(50), removed: false, deleted: false } }] },
    })
    plan.reset?.()
    await plan.start(fetcher, 0, 0)
    expect(plan.note?.()).toContain('0 of 1')
    expect(plan.note?.()).toContain('Crawl-delay: 60')
  })
})
