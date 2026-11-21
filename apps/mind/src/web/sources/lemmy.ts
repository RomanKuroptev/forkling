/**
 * Lemmy (lemmy.world), read through its public API: two humour communities as feeds of starting points (spec 6.1; Roman,
 * 20 November 2026, after their source trials in `docs/spec/w2-trials/lemmy.world-c-*.md`). robots.txt allows `/api/` and
 * asks for `Crawl-delay: 60`, so the allowlist gives the host one request a minute. A post is a voices record: its title,
 * its words and its five top comments, a picture only when lemmy.world itself serves it, and the community's other hot posts
 * as links. Pinned, NSFW, removed and deleted posts are never offered or read.
 */
import { cutToTokens } from '../clean.ts'
import { WebError, type Fetcher } from '../fetch.ts'
import { capLinks, MAX_RECORD_LINKS, type Item, type ItemImage, type ItemLink } from '../item.ts'

export const LEMMY = 'lemmy.world'
const API = `https://${LEMMY}/api/v3`
/** The communities Merge is offered, each a feed of its hot posts. */
export const LEMMY_COMMUNITIES = ['memes', 'showerthoughts'] as const
/** How many hot posts are kept from a list (one request gives 20). */
const HOT = 20

export const lemmyPostUrl = (id: number) => `https://${LEMMY}/post/${id}`
export const onLemmy = (url: string): boolean => {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname === LEMMY && u.port === '' && u.username === '' && u.password === ''
  } catch {
    return false
  }
}
/** A picture Lemmy itself serves (pict-rs). A picture on any other host is not kept. */
const PICTURE = /^\/pictrs\/image\/[^/?#]+\.(jpe?g|png|webp|gif)$/i
export const isLemmyPicture = (url: string): boolean => onLemmy(url) && PICTURE.test(new URL(url).pathname)

/** The post a Lemmy page URL names (`https://lemmy.world/post/<id>`), or null. */
export const lemmyPostId = (url: string): number | null => {
  const m = onLemmy(url) ? /^\/post\/(\d+)$/.exec(new URL(url).pathname) : null
  return m ? Number(m[1]) : null
}

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

interface Post {
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
export interface PostView {
  post: Post
  community?: { name?: string; nsfw?: boolean }
  counts?: { score?: number; comments?: number }
}

const isPost = (p: unknown): p is Post => !!p && typeof (p as Post).id === 'number' && typeof (p as Post).name === 'string'
/** A post that may be read: not NSFW (the post or its community), removed or deleted. */
const usable = (v: unknown): v is PostView => {
  const p = (v as PostView | null)?.post
  return isPost(p) && !p.nsfw && (v as PostView).community?.nsfw !== true && !p.removed && !p.deleted
}
/** A pinned post (a community's rules, an announcement) is not one of its posts. */
const pinned = (v: PostView) => v.post.featured_community === true || v.post.featured_local === true

/** Each fetcher's hot lists, so a trip asks for a community's list once (one request is a minute on this host). */
const lists = new WeakMap<Fetcher, Map<string, Promise<PostView[]>>>()

/** A community's hot posts that may be read, pinned posts left out. */
export function lemmyHot(f: Fetcher, community: string): Promise<PostView[]> {
  let mine = lists.get(f)
  if (!mine) lists.set(f, (mine = new Map()))
  let list = mine.get(community)
  if (!list) {
    list = (async () => {
      const r = (await f.json(`${API}/post/list?community_name=${encodeURIComponent(community)}&sort=Hot&limit=${HOT}&page=1`)) as { posts?: unknown }
      if (!Array.isArray(r?.posts)) throw new WebError('http', `Lemmy gave no list for c/${community}`, 502)
      return r.posts.filter(usable).filter((v) => !pinned(v))
    })()
    list.catch(() => mine!.delete(community))
    mine.set(community, list)
  }
  return list
}

/** A community's hot posts as starting points: the title and the post's page. */
export async function lemmyMorningLinks(f: Fetcher, community: string, n: number): Promise<ItemLink[]> {
  return (await lemmyHot(f, community)).slice(0, n).map((v) => ({ title: v.post.name.trim().slice(0, 200), url: lemmyPostUrl(v.post.id) }))
}

const hostName = (url: string): string => {
  try {
    return new URL(url).hostname
  } catch {
    return 'another site'
  }
}

/**
 * One post with its five top comments. Its comments are asked for first: each comment carries its post, so a post with
 * comments is one request. A post with none is asked for on its own. The community's other hot posts are its links.
 */
export async function lemmyPost(f: Fetcher, id: number): Promise<Item> {
  const c = ((await f.json(`${API}/comment/list?post_id=${id}&sort=Top&type_=All&max_depth=1&limit=5`)) as { comments?: unknown })?.comments
  const views = Array.isArray(c) ? (c as { comment?: { content?: unknown; removed?: boolean; deleted?: boolean }; post?: unknown; community?: { name?: string } }[]) : []
  const carried = views.find((x) => isPost(x?.post) && (x.post as Post).id === id)
  const v: unknown = carried ? { post: carried.post, community: carried.community } : ((await f.json(`${API}/post?id=${id}`)) as { post_view?: unknown })?.post_view
  if (!usable(v) || pinned(v)) throw new WebError('http', `no readable post ${id} (missing, pinned, NSFW, removed or deleted)`, 404)
  const replies = views
    .map((x) => x?.comment)
    .filter((x): x is { content: string } => !!x && typeof x.content === 'string' && !x.removed && !x.deleted)
    .map((x) => markdownToText(x.content).slice(0, 600))
    .filter(Boolean)
  const p = v.post
  const community = typeof v.community?.name === 'string' ? v.community.name : null
  const head = [
    `Post${community ? ` in c/${community}` : ''} on Lemmy: ${p.name.trim()}`,
    p.body ? markdownToText(p.body) : '',
    p.url && !onLemmy(p.url) ? `It links to a page on ${hostName(p.url)}.` : '',
  ]
    .filter(Boolean)
    .join('\n')
  const images: ItemImage[] = [p.url, p.thumbnail_url].filter((u): u is string => typeof u === 'string' && isLemmyPicture(u)).slice(0, 1).map((url) => ({ url, licence: null, credit: null }))
  const counts = v.counts?.score !== undefined ? [`Score ${v.counts.score}, ${v.counts.comments ?? 'unknown'} comments.`] : []
  const text = [head, ...counts, ...(replies.length ? ['Top comments:', ...replies.map((r) => `- ${r}`)] : [])].join('\n')
  // Its neighbours in the community's hot list; a community Merge is not offered gives none (no request for it).
  const others = community && (LEMMY_COMMUNITIES as readonly string[]).includes(community) ? await lemmyHot(f, community).catch(() => []) : []
  const links: ItemLink[] = others.filter((o) => o.post.id !== id).map((o) => ({ title: o.post.name.trim().slice(0, 100), url: lemmyPostUrl(o.post.id) }))
  return { source: LEMMY, kind: 'record', tier: 'voices', url: lemmyPostUrl(id), title: p.name.trim().slice(0, 200), text: cutToTokens(text), links: capLinks(links, MAX_RECORD_LINKS), images }
}
