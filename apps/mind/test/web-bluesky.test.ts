import { describe, expect, it } from 'vitest'
import { WebError, type Fetcher } from '../src/web/fetch.ts'
import { hostRule, isAllowed, isReadable } from '../src/web/allowlist.ts'
import { blueskyFeedOf, blueskyMorningLinks, blueskyTopic, blueskyTrending } from '../src/web/sources/bluesky.ts'
import { readUrl } from '../src/web/sources/index.ts'
import { planFor } from '../src/web/starts.ts'
import { judgeSouvenir, type ReadAnswer } from '../src/web/read.ts'

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
  // Roman, 20 November: only Bluesky's own topic text (its name and summary) is read and kept, never a person's post.
  it("holds only Bluesky's own topic text, its name and summary, with the other topics as links, and never asks for posts", async () => {
    const f = fake({
      [TRENDING]: topics,
      [getFeed('a1')]: { feed: [post('ann.bsky.social', 'Happy birthday Fiona! She is the best hippo.')] },
    })
    const item = await blueskyTopic(f, feedUrl('a1'))
    expect(item).toMatchObject({ source: 'public.api.bsky.app', kind: 'record', tier: 'voices', url: feedUrl('a1'), title: 'Fiona the hippo turns ten', images: [] })
    expect(item.text).toBe('Trending on Bluesky today: Fiona the hippo turns ten\nPeople talk about it.')
    expect(item.text).not.toMatch(/@|ann\.bsky|Happy birthday|best hippo/)
    expect(f.asked.some((u) => u.includes('getFeed'))).toBe(false)
    expect(item.links.map((l) => l.url)).toEqual([feedUrl('c3'), feedUrl('f6')])
  })

  it("says only the topic's name when Bluesky's summary is empty, and never adds post text", async () => {
    const f = fake({ [TRENDING]: { topics: [topic('a1', 'Fiona the hippo turns ten', '')] } })
    expect((await blueskyTopic(f, feedUrl('a1'))).text).toBe('Trending on Bluesky today: Fiona the hippo turns ten')
  })

  it("a post's text cannot become a souvenir; Bluesky's own summary can", async () => {
    const f = fake({
      [TRENDING]: { topics: [topic('a1', 'Fiona the hippo turns ten', 'The Cincinnati Zoo hippo celebrates a birthday.')] },
      [getFeed('a1')]: { feed: [post('ann.bsky.social', 'Happy birthday Fiona! She is the best hippo.')] },
    })
    const item = await blueskyTopic(f, feedUrl('a1'))
    const offer = (content: string) => judgeSouvenir({ souvenir: { kind: 'quote', content, evidence: '', picture: null, why: 'I like it.' }, reaction: '', topics: [], interest: 5, next: null, look: null } satisfies ReadAnswer, item)
    expect(offer('Happy birthday Fiona! She is the best hippo.')).toEqual({ dropped: 'quote not found word for word' })
    expect(offer('She is the best hippo.')).toEqual({ dropped: 'quote not found word for word' })
    expect(offer('@ann.bsky.social')).toEqual({ dropped: 'quote not found word for word' })
    expect(offer('The Cincinnati Zoo hippo celebrates a birthday.').kept).toMatchObject({ kind: 'quote', content: 'The Cincinnati Zoo hippo celebrates a birthday.' })
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
    expect(planFor('public.api.bsky.app')).toMatchObject({ itemHost: 'bsky.app', feed: true, paths: ['/xrpc/app.bsky.unspecced.getTrendingTopics'] })
    const f = fake({ [TRENDING]: topics, [getFeed('a1')]: { feed: [post('ann.bsky.social', 'Happy birthday Fiona!')] } })
    expect((await readUrl(f, feedUrl('a1'))).title).toBe('Fiona the hippo turns ten')
    await expect(readUrl(f, 'https://bsky.app/profile/ann.bsky.social')).rejects.toMatchObject({ code: 'not-allowed' })
    // A topic the news rule skips is not trending for Merge, so it is never read, even by its address.
    await expect(readUrl(f, feedUrl('b2'))).rejects.toMatchObject({ status: 404 })
  })
})
