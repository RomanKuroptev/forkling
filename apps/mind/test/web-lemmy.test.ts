import { describe, expect, it } from 'vitest'
import { hostRule, isAllowed, isReadable } from '../src/web/allowlist.ts'
import { WebError, type Fetcher } from '../src/web/fetch.ts'
import { lemmyHot, lemmyMorningLinks, lemmyPost, readUrl } from '../src/web/sources/index.ts'
import { planFor } from '../src/web/starts.ts'

const API = 'https://lemmy.world/api/v3'
const list = (c: string) => `${API}/post/list?community_name=${c}&sort=Hot&limit=20&page=1`
const comments = (id: number) => `${API}/comment/list?post_id=${id}&sort=Top&type_=All&max_depth=1&limit=5`

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

const post = (id: number, extra: Record<string, unknown> = {}) => ({ id, name: `Post ${id}`, body: null, url: null, thumbnail_url: null, nsfw: false, removed: false, deleted: false, featured_community: false, featured_local: false, ...extra })
const view = (id: number, extra: Record<string, unknown> = {}, community = 'memes') => ({ post: post(id, extra), community: { name: community }, counts: { score: 100 + id, comments: 3 } })
const comment = (postId: number, content: string, extra: Record<string, unknown> = {}, community = 'memes') => ({ comment: { content, removed: false, deleted: false, ...extra }, post: post(postId), community: { name: community } })

describe('lemmy.world on the allowlist', () => {
  it('is a voices record host for wander and meme, one request a minute (Crawl-delay: 60)', () => {
    expect(hostRule('lemmy.world')).toMatchObject({ kind: 'record', tier: 'voices', verbs: ['wander', 'meme'] })
    expect(hostRule('lemmy.world')!.gapMs).toBeGreaterThanOrEqual(60_000)
    expect(isAllowed('https://lemmy.world/api/v3/post/list', 'wander')).toBe(true)
    expect(isAllowed('https://lemmy.world/api/v3/post/list', 'tinker')).toBe(false)
    expect(isReadable('https://lemmy.world/post/5')).toBe(true)
  })

  it('has a trial plan that is a feed', () => {
    expect(planFor('lemmy.world')).toMatchObject({ host: 'lemmy.world', feed: true })
  })
})

describe('Lemmy hot lists', () => {
  it('leave out pinned, NSFW, removed and deleted posts, and are asked for once per fetcher', async () => {
    const f = fake({ [list('memes')]: { posts: [view(1), view(2, { featured_community: true }), view(3, { featured_local: true }), view(4, { nsfw: true }), view(5, { removed: true }), view(6, { deleted: true }), view(7)] } })
    expect((await lemmyHot(f, 'memes')).map((v) => v.post.id)).toEqual([1, 7])
    expect(await lemmyMorningLinks(f, 'memes', 1)).toEqual([{ title: 'Post 1', url: 'https://lemmy.world/post/1' }])
    expect(f.asked.filter((u) => u === list('memes'))).toHaveLength(1)
  })

  it('throw on an answer that is not a list, and ask again next time', async () => {
    const f = fake({ [list('memes')]: { nothing: true } })
    await expect(lemmyHot(f, 'memes')).rejects.toBeInstanceOf(WebError)
    await expect(lemmyHot(f, 'memes')).rejects.toBeInstanceOf(WebError)
    expect(f.asked).toHaveLength(2)
  })
})

describe('a Lemmy post', () => {
  it('is read from its comments in one request, with the top comments, its neighbours as links and a lemmy.world picture', async () => {
    const f = fake({
      [comments(1)]: {
        comments: [
          { ...comment(1, 'Ha, **true**.'), post: post(1, { body: 'If you think about it, [a link](https://example.com/x)', url: 'https://lemmy.world/pictrs/image/b.jpeg' }) },
          comment(1, 'gone', { removed: true }),
        ],
      },
      [list('memes')]: { posts: [view(1), view(2), view(3, { featured_community: true })] },
    })
    const item = await readUrl(f, 'https://lemmy.world/post/1')
    expect(f.asked).not.toContain(`${API}/post?id=1`)
    expect(item).toMatchObject({ source: 'lemmy.world', kind: 'record', tier: 'voices', url: 'https://lemmy.world/post/1', title: 'Post 1' })
    expect(item.text).toContain('Post in c/memes on Lemmy: Post 1')
    expect(item.text).toContain('If you think about it, a link')
    expect(item.text).not.toContain('example.com')
    expect(item.text).toContain('- Ha, true .')
    expect(item.text).not.toContain('gone')
    expect(item.links).toEqual([{ title: 'Post 2', url: 'https://lemmy.world/post/2' }])
    expect(item.images).toEqual([{ url: 'https://lemmy.world/pictrs/image/b.jpeg', licence: null, credit: null }])
  })

  it('is asked for on its own when it has no comments, and keeps no picture from another host', async () => {
    const f = fake({
      [comments(7)]: { comments: [] },
      [`${API}/post?id=7`]: { post_view: view(7, { url: 'https://i.imgur.com/x.png', thumbnail_url: 'https://lemmy.world/pictrs/image/t.webp' }, 'showerthoughts') },
      [list('showerthoughts')]: { posts: [view(7), view(8)] },
    })
    const item = await lemmyPost(f, 7)
    expect(item.text).toContain('It links to a page on i.imgur.com.')
    expect(item.text).toContain('Score 107, 3 comments.')
    expect(item.images.map((i) => i.url)).toEqual(['https://lemmy.world/pictrs/image/t.webp'])
    expect(item.links.map((l) => l.url)).toEqual(['https://lemmy.world/post/8'])
  })

  it('offers no links, and asks for no list, from a community Merge is not offered', async () => {
    const f = fake({ [comments(9)]: { comments: [comment(9, 'a reply', {}, 'politics')] } })
    const item = await lemmyPost(f, 9)
    expect(item.links).toEqual([])
    expect(f.asked).toEqual([comments(9)])
  })

  it('is refused when it is pinned, NSFW, removed or deleted', async () => {
    for (const extra of [{ nsfw: true }, { removed: true }, { deleted: true }, { featured_community: true }]) {
      const f = fake({ [comments(9)]: { comments: [] }, [`${API}/post?id=9`]: { post_view: view(9, extra) } })
      await expect(lemmyPost(f, 9)).rejects.toBeInstanceOf(WebError)
    }
  })

  it('is read only from a post page; any other lemmy.world address has no adapter', async () => {
    const f = fake({})
    for (const url of ['https://lemmy.world/c/memes', 'https://lemmy.world/post/1?x=1', 'https://lemmy.world/post/abc', 'https://lemmy.world/u/someone']) {
      await expect(readUrl(f, url)).rejects.toMatchObject({ code: 'not-allowed' })
    }
    expect(f.asked).toEqual([])
  })
})
