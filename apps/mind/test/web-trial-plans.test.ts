import { describe, expect, it } from 'vitest'
import { isAllowed, isReadable } from '../src/web/allowlist.ts'
import { createFetcher, type FetchImpl } from '../src/web/fetch.ts'
import { readUrl } from '../src/web/sources/index.ts'
import { HOST_PLANS, planFor } from '../src/web/starts.ts'
import { lemmyPost, TRIAL_HOSTS, TRIAL_PLANS, trialPlanFor } from '../src/web/trial-plans.ts'

const NOW = Date.parse('2026-11-20T10:00:00Z')

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
  post: { id, name: `Post ${id}`, body: null, url: null, thumbnail_url: null, nsfw: false, removed: false, deleted: false, ...extra },
  community: { name: 'showerthoughts' },
  counts: { score: 100 + id, comments: 3 },
})

const API = 'https://lemmy.world/api/v3'
const list = (community: string) => `${API}/post/list?community_name=${community}&sort=Hot&limit=20&page=1`
const comments = (id: number) => `${API}/comment/list?post_id=${id}&sort=Top&type_=All&max_depth=1&limit=5`

describe('the trial-only Lemmy plans', () => {
  it('are not on the allowlist and not among the plans the mind and the harness use', () => {
    expect(isAllowed('https://lemmy.world/api/v3/post/list')).toBe(false)
    expect(isReadable('https://lemmy.world/post/1')).toBe(false)
    expect(HOST_PLANS.some((p) => p.host === 'lemmy.world')).toBe(false)
    expect(planFor('lemmy.world')).toBeUndefined()
    expect(TRIAL_PLANS.length).toBeGreaterThanOrEqual(2)
    for (const p of TRIAL_PLANS) expect(p.host).toBe('lemmy.world')
  })

  it('never read Reddit or Know Your Meme', () => {
    for (const p of TRIAL_PLANS) expect(`${p.id} ${p.host}`).not.toMatch(/reddit|knowyourmeme/i)
    for (const r of TRIAL_HOSTS) expect(r.host).not.toMatch(/reddit|knowyourmeme/i)
  })

  it('wait the 60 seconds robots.txt asks for between two requests', () => {
    expect(TRIAL_HOSTS.find((r) => r.host === 'lemmy.world')!.gapMs).toBeGreaterThanOrEqual(60_000)
  })

  it('are found by their id, lemmy.world/c/<community>', () => {
    expect(trialPlanFor('lemmy.world/c/showerthoughts')?.community).toBe('showerthoughts')
    expect(trialPlanFor('lemmy.world/c/nothing')).toBeUndefined()
  })
})

describe('a fetcher with trial hosts', () => {
  it('refuses lemmy.world without them, as the mind does', async () => {
    const { fetcher } = setup({}, false)
    await expect(fetcher.json(`${API}/post?id=1`)).rejects.toMatchObject({ code: 'not-allowed' })
    await expect(readUrl(fetcher, 'https://lemmy.world/post/1')).rejects.toMatchObject({ code: 'not-allowed' })
  })

  it('reads lemmy.world with them, waiting the crawl delay between requests', async () => {
    const { fetcher, sleeps, calls } = setup({ [`${API}/post?id=1`]: { post_view: view(1) }, [`${API}/post?id=2`]: { post_view: view(2) } })
    await fetcher.json(`${API}/post?id=1`)
    await fetcher.json(`${API}/post?id=2`)
    expect(calls).toHaveLength(3)
    expect(sleeps).toHaveLength(2)
    for (const s of sleeps) expect(s).toBeGreaterThanOrEqual(60_000)
  })
})

describe('a Lemmy post as an item', () => {
  it('has the title, the body and the top comments as text, other hot posts as links, and only lemmy.world pictures', async () => {
    const plan = trialPlanFor('lemmy.world/c/showerthoughts')!
    const body = 'If you think about it, ' + 'every '.repeat(10) + '[a link](https://example.com/x) ![pic](https://lemmy.world/pictrs/image/a.png)'
    const { fetcher } = setup({
      [list('showerthoughts')]: { posts: [view(1, { body }), view(2), view(3, { nsfw: true }), view(4, { removed: true }), view(5)] },
      [`${API}/post?id=1`]: { post_view: view(1, { body, url: 'https://lemmy.world/pictrs/image/b.jpeg' }) },
      [comments(1)]: { comments: [{ comment: { content: 'Ha, true.', removed: false, deleted: false } }, { comment: { content: 'gone', removed: true, deleted: false } }] },
    })
    const item = await plan.start(fetcher, 0, 0)
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
    expect(item.links.map((l) => l.url)).toEqual(['https://lemmy.world/post/2', 'https://lemmy.world/post/5'])
    expect(item.images).toEqual([{ url: 'https://lemmy.world/pictrs/image/b.jpeg', licence: null, credit: null }])
  })

  it('keeps no picture from another host, and opens a post by its page URL only', async () => {
    const plan = trialPlanFor('lemmy.world/c/showerthoughts')!
    const { fetcher } = setup({
      [list('showerthoughts')]: { posts: [view(7)] },
      [`${API}/post?id=7`]: { post_view: view(7, { url: 'https://i.imgur.com/x.png', thumbnail_url: 'https://lemmy.world/pictrs/image/t.webp' }) },
      [comments(7)]: { comments: [] },
    })
    const item = await plan.open(fetcher, 'https://lemmy.world/post/7')
    expect(item.images.map((i) => i.url)).toEqual(['https://lemmy.world/pictrs/image/t.webp'])
    await expect(plan.open(fetcher, 'https://example.com/post/7')).rejects.toMatchObject({ code: 'not-allowed' })
  })

  it('refuses a post marked NSFW, removed or deleted', async () => {
    const { fetcher } = setup({ [`${API}/post?id=9`]: { post_view: view(9, { nsfw: true }) }, [comments(9)]: { comments: [] } })
    await expect(lemmyPost(fetcher, 'showerthoughts', 9, [])).rejects.toThrow()
  })

  it('counts how many posts would be readable without their comments, for the report', async () => {
    const plan = trialPlanFor('lemmy.world/c/dadjokes')!
    const { fetcher } = setup({
      [list('dadjokes')]: { posts: [view(1)] },
      [`${API}/post?id=1`]: { post_view: view(1) },
      [comments(1)]: { comments: [{ comment: { content: 'word '.repeat(50), removed: false, deleted: false } }] },
    })
    plan.reset()
    await plan.start(fetcher, 0, 0)
    expect(plan.note()).toContain('0 of 1')
  })
})
