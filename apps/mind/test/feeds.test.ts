import { describe, expect, it } from 'vitest'
import { github } from '../src/feeds/github.ts'
import { hackerNews } from '../src/feeds/hackernews.ts'
import { readFeeds, FEEDS } from '../src/feeds/index.ts'
import { lemmy, LEMMY_COMMUNITIES } from '../src/feeds/lemmy.ts'
import { mastodon } from '../src/feeds/mastodon.ts'
import { moonPhase, sky } from '../src/feeds/sky.ts'
import { clip, type GetJson } from '../src/feeds/types.ts'
import { onThisDay, randomPage } from '../src/feeds/wikipedia-history.ts'
import { wikipediaTop } from '../src/feeds/wikipedia-top.ts'

const NOW = Date.parse('2026-11-03T06:30:00Z')

/** Answers each URL from a table; any other URL is an error, like a broken source. */
const serve =
  (table: Record<string, unknown>): GetJson =>
  async (url) => {
    const hit = Object.entries(table).find(([prefix]) => url.startsWith(prefix))
    if (!hit) throw new Error(`unexpected ${url}`)
    return hit[1]
  }

describe('clip', () => {
  it('cuts to a length, collapsing whitespace and ending with an ellipsis', () => {
    expect(clip('a   b\n c', 20)).toBe('a b c')
    expect(clip('abcdefghij', 5)).toBe('abcd…')
  })
})

describe('wikipediaTop', () => {
  const get = serve({
    'https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/2026/11/02': {
      items: [
        {
          articles: [
            { article: 'Main_Page', views: 9_000_000, rank: 1 },
            { article: 'Special:Search', views: 800_000, rank: 2 },
            { article: 'Logic_gate', views: 120_000, rank: 3 },
            { article: 'Wikipedia:About', views: 90_000, rank: 4 },
            { article: 'Comet_C/2026_A1', views: 80_000, rank: 5 },
          ],
        },
      ],
    },
  })

  it("asks for yesterday's most read, leaving out the front page and the project's own pages", async () => {
    const items = await wikipediaTop(get, NOW)
    expect(items.map((i) => i.title)).toEqual(['Logic gate', 'Comet C/2026 A1'])
    expect(items[0]).toMatchObject({ source: 'wikipedia-top', id: 'wikitop:Logic_gate', url: 'https://en.wikipedia.org/wiki/Logic_gate' })
    expect(items[0]!.summary).toMatch(/120,?000/)
  })

  it('gives nothing when the answer is not what it expects', async () => {
    expect(await wikipediaTop(async () => ({ nope: 1 }), NOW)).toEqual([])
  })
})

describe('hackerNews', () => {
  const get = serve({
    'https://hacker-news.firebaseio.com/v0/topstories.json': [11, 12, 13],
    'https://hacker-news.firebaseio.com/v0/item/11.json': { id: 11, title: 'A CPU built in Minecraft', url: 'https://example.com/cpu', score: 420, type: 'story' },
    'https://hacker-news.firebaseio.com/v0/item/12.json': { id: 12, title: 'Ask HN: anything?', score: 50, type: 'story' },
    'https://hacker-news.firebaseio.com/v0/item/13.json': null,
  })

  it('reads the top stories, with a link back to the discussion when there is no url', async () => {
    const items = await hackerNews(get, NOW)
    expect(items.map((i) => i.id)).toEqual(['hn:11', 'hn:12'])
    expect(items[0]).toMatchObject({ title: 'A CPU built in Minecraft', url: 'https://example.com/cpu', summary: '420 points' })
    expect(items[1]!.url).toBe('https://news.ycombinator.com/item?id=12')
  })

  it('lets a broken source fail, so readFeeds can say so', async () => {
    await expect(hackerNews(async () => { throw new Error('down') }, NOW)).rejects.toThrow('down')
  })
})

describe('github', () => {
  it('lists the repos that gained the most stars while young', async () => {
    const get = serve({
      'https://api.github.com/search/repositories?q=created%3A%3E2026-10-27': {
        items: [{ full_name: 'a/b', description: 'A tiny logic simulator', html_url: 'https://github.com/a/b', stargazers_count: 900 }, { full_name: 'c/d', description: null, html_url: 'https://github.com/c/d', stargazers_count: 5 }],
      },
    })
    const items = await github(get, NOW)
    expect(items[0]).toMatchObject({ id: 'gh:a/b', title: 'a/b', summary: 'A tiny logic simulator', url: 'https://github.com/a/b' })
    expect(items[1]!.summary).toBe('5 stars')
  })
})

describe('sky', () => {
  it('knows the moon: full on a known full-moon night, new on a known new-moon night', () => {
    expect(moonPhase(Date.parse('2026-11-09T12:00:00Z')).name).toBe('new moon') // new moon 2026-11-09
    expect(moonPhase(Date.parse('2026-11-24T12:00:00Z')).name).toBe('full moon') // full moon 2026-11-24
  })

  it('always reports the moon, and the picture of the day when NASA answers', async () => {
    const get = serve({ 'https://api.nasa.gov/planetary/apod': { title: 'The Pillars', explanation: 'Gas and dust. '.repeat(50), url: 'https://apod.nasa.gov/x.jpg', date: '2026-11-03' } })
    const items = await sky(get, NOW)
    expect(items.map((i) => i.id)).toEqual(['sky:moon:2026-11-03', 'sky:apod:2026-11-03'])
    expect(items[1]!.summary.length).toBeLessThanOrEqual(300)
  })

  it('still reports the moon when NASA is down', async () => {
    const items = await sky(async () => { throw new Error('rate limited') }, NOW)
    expect(items.map((i) => i.source)).toEqual(['sky'])
    expect(items[0]!.id).toBe('sky:moon:2026-11-03')
  })
})

describe('wikipedia history', () => {
  it('picks a few events of the day and links to the page', async () => {
    const events = Array.from({ length: 10 }, (_, n) => ({ text: `Event ${n}`, year: 1900 + n, pages: [{ titles: { normalized: `Page ${n}` }, content_urls: { desktop: { page: `https://en.wikipedia.org/wiki/Page_${n}` } } }] }))
    const items = await onThisDay(serve({ 'https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/11/03': { events } }), NOW)
    expect(items).toHaveLength(4)
    expect(items[0]!.title).toMatch(/^\d{4}: Event \d/)
    expect(items[0]!.url).toMatch(/^https:\/\/en\.wikipedia\.org\/wiki\/Page_/)
  })

  it('picks one random article', async () => {
    const items = await randomPage(serve({ 'https://en.wikipedia.org/api/rest_v1/page/random/summary': { pageid: 77, title: 'Okapi', extract: 'A forest giraffe.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Okapi' } } } }), NOW)
    expect(items).toEqual([{ source: 'wikipedia-random', id: 'rand:77', title: 'Okapi', summary: 'A forest giraffe.', url: 'https://en.wikipedia.org/wiki/Okapi' }])
  })
})

describe('lemmy', () => {
  it('only ever asks the allowlisted communities', async () => {
    const asked: string[] = []
    const get: GetJson = async (url) => {
      asked.push(url)
      const name = new URL(url).searchParams.get('community_name')
      return { posts: [{ post: { id: asked.length, name: `Post in ${name}`, ap_id: `https://lemmy.world/post/${asked.length}` } }] }
    }
    const items = await lemmy(get, NOW)
    expect(asked.every((u) => u.startsWith('https://lemmy.world/api/v3/post/list?'))).toBe(true)
    expect(new Set(asked.map((u) => new URL(u).searchParams.get('community_name')))).toEqual(new Set(LEMMY_COMMUNITIES))
    expect(items).toHaveLength(LEMMY_COMMUNITIES.length)
    expect(items[0]!.summary).toMatch(/^from c\//)
  })

  it('skips a community that fails and keeps the rest', async () => {
    const get: GetJson = async (url) => {
      if (url.includes('community_name=pics')) throw new Error('gone')
      return { posts: [{ post: { id: 1, name: 'A post', ap_id: 'https://lemmy.world/post/1' } }] }
    }
    expect((await lemmy(get, NOW)).length).toBe(LEMMY_COMMUNITIES.length - 1)
  })
})

describe('mastodon', () => {
  const get = serve({
    'https://mastodon.social/api/v1/trends/tags': [
      { name: 'caturday', url: 'https://mastodon.social/tags/caturday', history: [{ uses: '120' }, { uses: '80' }] },
      { name: 'ElectionDay', url: 'https://mastodon.social/tags/ElectionDay', history: [{ uses: '900' }] },
      { name: 'BreakingNews', url: 'https://mastodon.social/tags/BreakingNews', history: [{ uses: '500' }] },
      { name: 'solarpunk', url: 'https://mastodon.social/tags/solarpunk', history: [{ uses: '40' }] },
    ],
  })

  it('keeps hashtags, and leaves out politics and news', async () => {
    const items = await mastodon(get, NOW)
    expect(items.map((i) => i.title)).toEqual(['#caturday', '#solarpunk'])
    expect(items[0]).toMatchObject({ id: 'masto:caturday', summary: '200 posts in recent days' })
  })
})

describe('readFeeds', () => {
  it('collects every source, and says which ones failed', async () => {
    const get: GetJson = async (url) => {
      if (url.includes('hacker-news')) throw new Error('down')
      if (url.includes('mastodon')) return [{ name: 'tea', url: 'https://mastodon.social/tags/tea', history: [{ uses: '3' }] }]
      throw new Error('not in this test')
    }
    const { items, failed } = await readFeeds(get, NOW)
    expect(items.some((i) => i.source === 'mastodon')).toBe(true)
    expect(items.some((i) => i.source === 'sky')).toBe(true)
    expect(failed).toContain('hackernews')
    expect(failed).not.toContain('mastodon')
    expect(failed).not.toContain('sky')
  })

  it('has one adapter per source, with unique names', () => {
    const names = FEEDS.map((f) => f.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toEqual(expect.arrayContaining(['wikipedia-top', 'hackernews', 'github', 'sky', 'wikipedia-history', 'lemmy', 'mastodon']))
  })

  it('cuts every title and summary to a safe length', async () => {
    const huge = 'x'.repeat(5000)
    const get = serve({ 'https://mastodon.social/api/v1/trends/tags': [{ name: huge, url: 'https://mastodon.social/tags/x', history: [{ uses: '1' }] }] })
    const { items } = await readFeeds(get, NOW)
    for (const i of items) {
      expect(i.title.length).toBeLessThanOrEqual(120)
      expect(i.summary.length).toBeLessThanOrEqual(300)
    }
  })
})
