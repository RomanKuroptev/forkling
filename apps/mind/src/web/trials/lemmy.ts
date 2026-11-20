/**
 * Trial-only plans for Lemmy communities (issue #304), read through Lemmy's public API. robots.txt on lemmy.world allows
 * `/api/` and asks for `Crawl-delay: 60`, so there is one request a minute. A community is a feed (spec 6.1): it gives
 * starting points, so its trial shows "gives something" and "not boring" without marking them.
 */
import type { HostRule } from '../allowlist.ts'
import { cutToTokens, wordCount } from '../clean.ts'
import { WebError, type Fetcher } from '../fetch.ts'
import { capLinks, MAX_RECORD_LINKS, type Item, type ItemImage, type ItemLink } from '../item.ts'
import { MIN_RECORD_WORDS } from '../skip.ts'
import type { TrialPlan } from '../trial-plans.ts'

export const LEMMY = 'lemmy.world'
const API = `https://${LEMMY}/api/v3`

export const LEMMY_RULE: HostRule = { host: LEMMY, kind: 'record', tier: 'voices', gapMs: 60_000, verbs: ['wander', 'meme'] }

const pageOf = (id: number) => `https://${LEMMY}/post/${id}`
export const onLemmy = (url: string): boolean => {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname === LEMMY && u.port === '' && u.username === '' && u.password === ''
  } catch {
    return false
  }
}
/** A picture Lemmy itself serves (pict-rs). Pictures on any other host are not kept. */
export const PICTURE = /^\/pictrs\/image\/[^/?#]+\.(jpe?g|png|webp|gif)$/i
const isPicture = (url: string): boolean => onLemmy(url) && PICTURE.test(new URL(url).pathname)

/** Markdown as plain words: pictures dropped, links kept as their words, the rest of the marks taken off. */
export function markdownToText(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^:::.*$/gm, ' ')
    .replace(/[*_`>#~]+/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export interface PostView {
  post: {
    id: number
    name: string
    body?: string | null
    url?: string | null
    thumbnail_url?: string | null
    nsfw?: boolean
    removed?: boolean
    deleted?: boolean
    featured_community?: boolean
    featured_local?: boolean
  }
  counts?: { score?: number; comments?: number }
}

/** A post that may be read: not NSFW, removed or deleted. */
const usable = (v: unknown): v is PostView => {
  const p = (v as PostView | null)?.post
  return !!p && typeof p.id === 'number' && typeof p.name === 'string' && !p.nsfw && !p.removed && !p.deleted
}
/** A pinned post (a community's rules, an announcement) is not one of its posts. */
const pinned = (v: PostView) => v.post.featured_community === true || v.post.featured_local === true

/** A community's hot posts that may be read, pinned posts left out. */
export async function lemmyHot(f: Fetcher, community: string, page = 1): Promise<PostView[]> {
  const r = (await f.json(`${API}/post/list?community_name=${encodeURIComponent(community)}&sort=Hot&limit=20&page=${page}`)) as { posts?: unknown }
  if (!Array.isArray(r?.posts)) throw new WebError('http', `Lemmy gave no list for ${community}`, 502)
  return r.posts.filter(usable).filter((v) => !pinned(v))
}

/**
 * One post with its five top comments. `others` are the community's other hot posts, offered as links; a post among them is
 * not asked for again, so a read is one request (its comments), one minute, not two.
 */
export async function lemmyPost(f: Fetcher, community: string, id: number, others: readonly PostView[], seen?: (postOnly: boolean) => void): Promise<Item> {
  const v = others.find((o) => o.post.id === id) ?? ((await f.json(`${API}/post?id=${id}`)) as { post_view?: unknown })?.post_view
  if (!usable(v)) throw new WebError('http', `no readable post ${id} (missing, NSFW, removed or deleted)`, 404)
  const c = ((await f.json(`${API}/comment/list?post_id=${id}&sort=Top&type_=All&max_depth=1&limit=5`)) as { comments?: unknown })?.comments
  const replies = (Array.isArray(c) ? c : [])
    .map((x) => (x as { comment?: { content?: unknown; removed?: boolean; deleted?: boolean } })?.comment)
    .filter((x): x is { content: string } => !!x && typeof x.content === 'string' && !x.removed && !x.deleted)
    .map((x) => markdownToText(x.content).slice(0, 600))
    .filter(Boolean)
  const p = v.post
  const head = [`Post in c/${community}: ${p.name.trim()}`, p.body ? markdownToText(p.body) : '', p.url && !onLemmy(p.url) ? `It links to a page on ${hostName(p.url)}.` : '']
    .filter(Boolean)
    .join('\n')
  const images: ItemImage[] = [p.url, p.thumbnail_url].filter((u): u is string => typeof u === 'string' && isPicture(u)).slice(0, 1).map((url) => ({ url, licence: null, credit: null }))
  seen?.(images.length > 0 || wordCount(head) >= MIN_RECORD_WORDS)
  const text = [head, `Score ${v.counts?.score ?? 'unknown'}, ${v.counts?.comments ?? 'unknown'} comments.`, ...(replies.length ? ['Top comments:', ...replies.map((r) => `- ${r}`)] : [])].join('\n')
  const links: ItemLink[] = others.filter((o) => o.post.id !== id).map((o) => ({ title: o.post.name.slice(0, 100), url: pageOf(o.post.id) }))
  return { source: LEMMY, kind: 'record', tier: 'voices', url: pageOf(id), title: p.name.trim().slice(0, 200), text: cutToTokens(text), links: capLinks(links, MAX_RECORD_LINKS, onLemmy), images }
}

const hostName = (url: string): string => {
  try {
    return new URL(url).hostname
  } catch {
    return 'another site'
  }
}

/** The post a Lemmy page URL names (`https://lemmy.world/post/<id>`), or null. */
export const lemmyPostId = (url: string): number | null => {
  const m = onLemmy(url) ? /^\/post\/(\d+)$/.exec(new URL(url).pathname) : null
  return m ? Number(m[1]) : null
}

function lemmyTrial(community: string): TrialPlan {
  const lists = new Map<number, PostView[]>()
  let postOnly = 0
  let all = 0
  const listOf = async (f: Fetcher, page: number) => {
    if (!lists.has(page)) lists.set(page, await lemmyHot(f, community, page))
    return lists.get(page)!
  }
  const count = (readable: boolean) => {
    all++
    if (readable) postOnly++
  }
  return {
    id: `${LEMMY}/c/${community}`,
    host: LEMMY,
    itemHost: LEMMY,
    rules: [LEMMY_RULE],
    paths: ['/api/v3/post/list', '/api/v3/post', '/api/v3/comment/list'],
    feed: true,
    async start(f, seed, offset) {
      const posts = await listOf(f, 1 + offset)
      if (posts.length === 0) throw new WebError('http', `c/${community} has no hot posts`, 404)
      const at = posts[(seed * 4) % posts.length]!
      return lemmyPost(f, community, at.post.id, posts, count)
    },
    async open(f, url) {
      const id = lemmyPostId(url)
      if (id === null) throw new WebError('not-allowed', `no trial adapter reads ${url}`)
      return lemmyPost(f, community, id, [...lists.values()].flat(), count)
    },
    note: () =>
      `${LEMMY} asks for Crawl-delay: 60 in robots.txt, so the trial made one request every ${LEMMY_RULE.gapMs / 1000} seconds. ` +
      `Without their comments, ${postOnly} of ${all} posts read would be readable (a picture on ${LEMMY} or ${MIN_RECORD_WORDS} words).`,
    reset() {
      lists.clear()
      postOnly = 0
      all = 0
    },
  }
}

/** Lemmy communities on trial (Roman, 20 November 2026). Never Reddit, never Know Your Meme. */
export const LEMMY_TRIALS: readonly TrialPlan[] = ['memes', 'showerthoughts'].map(lemmyTrial)
