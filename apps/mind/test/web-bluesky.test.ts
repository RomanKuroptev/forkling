import { describe, expect, it } from 'vitest'
import { WebError, type Fetcher } from '../src/web/fetch.ts'
import { hostRule, isAllowed, isReadable } from '../src/web/allowlist.ts'
import { blueskyFeedOf, blueskyMorningLinks, blueskyTopic, blueskyTrending } from '../src/web/sources/bluesky.ts'
import { readUrl } from '../src/web/sources/index.ts'
import { planFor } from '../src/web/starts.ts'

const XRPC = 'https://public.api.bsky.app/xrpc'
const TRENDING = `${XRPC}/app.bsky.unspecced.getTrendingTopics?limit=25`
const DID = 'did:plc:qrz3lhbyuxbeilrc6nekdqme'
const feedUrl = (rkey: string) => `https://bsky.app/profile/${DID}/feed/${rkey}`
const getFeed = (rkey: string) => `${XRPC}/app.bsky.feed.getFeed?feed=${encodeURIComponent(`at://${DID}/app.bsky.feed.generator/${rkey}`)}&limit=20`

function fake(answers: Record<string, unknown>): Fetcher & { asked: string[] } {
  const asked: string[] = []
  return {
    asked,
    log: [],
    pausedHosts: () => ({}),
    text: async () => '',
    json: async (url) => {
      asked.push(url)
      if (!(url in answers)) throw new WebError('http', `404 ${url}`, 404)
      return answers[url]
    },
    bytes: async (url) => ({ bytes: new Uint8Array(), contentType: 'image/jpeg', url }),
  }
}

const topic = (rkey: string, displayName: string, description = 'People talk about it.') => ({ topic: displayName, displayName, description, link: `/profile/${DID}/feed/${rkey}` })
const topics = {
  topics: [
    topic('a1', 'Fiona the hippo turns ten'),
    topic('b2', 'Death of a famous parrot'),
    topic('c3', 'Star Wars trailer'),
    topic('d4', 'Snap election called', 'Voters go to the polls.'),
    topic('e5', 'Moss art', 'Artists grow pictures from moss, and others report violence nowhere.'),
    topic('f6', 'Award season'),
    { topic: 'no link', displayName: 'No link' },
    topic('g7', 'War of words between two bakeries'),
  ],
}
const post = (handle: string, text: string, extra: Record<string, unknown> = {}) => ({ post: { author: { handle, labels: [] }, record: { text, langs: ['en'] }, labels: [], ...extra } })

describe('Bluesky trending topics', () => {
  it('skips topics about deaths, violence, war and politics by whole words, and keeps Star Wars and awards', async () => {
    const list = await blueskyTrending(fake({ [TRENDING]: topics }))
    expect(list.map((t) => t.displayName)).toEqual(['Fiona the hippo turns ten', 'Star Wars trailer', 'Award season'])
    expect(list[0]!.url).toBe(feedUrl('a1'))
  })

  it('gives the morning the first topics as links to their bsky.app pages', async () => {
    expect(await blueskyMorningLinks(fake({ [TRENDING]: topics }), 2)).toEqual([
      { title: 'Fiona the hippo turns ten', url: feedUrl('a1') },
      { title: 'Star Wars trailer', url: feedUrl('c3') },
    ])
  })

  it('names each topic it skipped and the word, for the report', async () => {
    const skipped: string[] = []
    await blueskyTrending(fake({ [TRENDING]: topics }), 25, (t, w) => skipped.push(`${t}: ${w}`))
    expect(skipped).toEqual(['Death of a famous parrot: death', 'Snap election called: election', 'Moss art: violence', 'War of words between two bakeries: war'])
  })

  it('throws on an answer that is not a list', async () => {
    await expect(blueskyTrending(fake({ [TRENDING]: { nope: 1 } }))).rejects.toBeInstanceOf(WebError)
  })
})

describe('a Bluesky topic as a record', () => {
  it('has the topic, what it is about, the posts people wrote (no labelled ones, English only), and the other topics as links', async () => {
    const f = fake({
      [TRENDING]: topics,
      [getFeed('a1')]: {
        feed: [
          post('ann.bsky.social', 'Happy birthday Fiona! She is the   best hippo.'),
          post('bob.bsky.social', 'labelled', { labels: [{ val: 'porn' }] }),
          { post: { author: { handle: 'cat.bsky.social', labels: [{ val: 'spam' }] }, record: { text: 'author labelled', langs: ['en'] }, labels: [] } },
          post('dee.bsky.social', 'Hallo zusammen', { record: { text: 'Hallo zusammen', langs: ['de'] } }),
          post('eve.bsky.social', 'Ten years of Fiona already.'),
        ],
      },
    })
    const item = await blueskyTopic(f, feedUrl('a1'))
    expect(item).toMatchObject({ source: 'public.api.bsky.app', kind: 'record', tier: 'voices', url: feedUrl('a1'), title: 'Fiona the hippo turns ten', images: [] })
    expect(item.text).toContain('Trending on Bluesky today: Fiona the hippo turns ten')
    expect(item.text).toContain('- @ann.bsky.social: Happy birthday Fiona! She is the best hippo.')
    expect(item.text).toContain('- @eve.bsky.social: Ten years of Fiona already.')
    expect(item.text).not.toMatch(/labelled|Hallo/)
    expect(item.links.map((l) => l.url)).toEqual([feedUrl('c3'), feedUrl('f6')])
  })

  it('refuses a topic the skip rule catches, and any address that is not a feed page', async () => {
    const f = fake({ [TRENDING]: { topics: [topic('b2', 'Death of a famous parrot')] }, [getFeed('b2')]: { feed: [] } })
    await expect(blueskyTopic(f, feedUrl('b2'), [{ topic: 'x', displayName: 'Death of a famous parrot', description: '', url: feedUrl('b2') }])).rejects.toMatchObject({ code: 'not-allowed' })
    expect(f.asked).toEqual([])
    await expect(blueskyTopic(f, feedUrl('zz'), [])).rejects.toMatchObject({ status: 404 })
    for (const url of ['https://bsky.app/profile/someone.bsky.social', 'https://bsky.app/search?q=x', `http://bsky.app/profile/${DID}/feed/a1`, `https://bsky.app/profile/${DID}/feed/a1?x=1`])
      expect(blueskyFeedOf(url), url).toBeNull()
  })
})

describe('Bluesky on the allowlist', () => {
  it('is a voices record host for wander and meme, and a topic page on bsky.app may be offered and read', async () => {
    expect(hostRule('public.api.bsky.app')).toMatchObject({ kind: 'record', tier: 'voices', verbs: ['wander', 'meme'] })
    expect(isAllowed(`${XRPC}/app.bsky.unspecced.getTrendingTopics`, 'tinker')).toBe(false)
    expect(isReadable(feedUrl('a1'))).toBe(true)
    expect(planFor('public.api.bsky.app')).toMatchObject({ itemHost: 'bsky.app', feed: true })
    const f = fake({ [TRENDING]: topics, [getFeed('a1')]: { feed: [post('ann.bsky.social', 'Happy birthday Fiona!')] } })
    expect((await readUrl(f, feedUrl('a1'))).title).toBe('Fiona the hippo turns ten')
    await expect(readUrl(f, 'https://bsky.app/profile/ann.bsky.social')).rejects.toMatchObject({ code: 'not-allowed' })
    // A topic the news rule skips is not trending for Merge, so it is never read, even by its address.
    await expect(readUrl(f, feedUrl('b2'))).rejects.toMatchObject({ status: 404 })
  })
})
