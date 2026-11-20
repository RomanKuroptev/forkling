/**
 * Source trials of hosts that are NOT on the allowlist (spec 6.5), for the trial CLI only. Nothing the mind runs imports this
 * file: the fetcher reads these hosts only when it is given `TRIAL_HOSTS`, and only `trial-cli.ts` does that. A host moves to
 * `allowlist.ts` (and its plan to `starts.ts`) only when Roman adds it after reading its report.
 *
 * Lemmy (issue #304): a community's hot posts, read through Lemmy's public API. robots.txt on lemmy.world allows `/api/` and
 * asks for `Crawl-delay: 60`, so there is one request a minute.
 */
import type { HostRule } from './allowlist.ts'
import { cutToTokens, wordCount } from './clean.ts'
import { WebError, type Fetcher } from './fetch.ts'
import { capLinks, MAX_RECORD_LINKS, type Item, type ItemImage, type ItemLink } from './item.ts'
import { MIN_RECORD_WORDS } from './skip.ts'
import type { HostPlan } from './starts.ts'

const LEMMY = 'lemmy.world'
const API = `https://${LEMMY}/api/v3`

export const TRIAL_HOSTS: readonly HostRule[] = [{ host: LEMMY, kind: 'record', tier: 'voices', gapMs: 60_000 }]

export interface TrialPlan extends HostPlan {
  /** What the trial is called and its report's file name: `lemmy.world/c/<community>` (saved as `lemmy.world-c-<community>.md`). */
  id: string
  community: string
  rule: HostRule
  /** A link to an item, read by this plan's own adapter (the mind's `readUrl` refuses hosts that are not on the list). */
  open(f: Fetcher, url: string): Promise<Item>
  /** A line for the report about what the trial saw. */
  note(): string
  reset(): void
}

const pageOf = (id: number) => `https://${LEMMY}/post/${id}`
const onLemmy = (url: string): boolean => {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname === LEMMY && u.port === ''
  } catch {
    return false
  }
}
const PICTURE = /\/pictrs\/image\/[^/?#]+\.(jpe?g|png|webp|gif)(\?.*)?$/i

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

interface PostView {
  post: { id: number; name: string; body?: string | null; url?: string | null; thumbnail_url?: string | null; nsfw?: boolean; removed?: boolean; deleted?: boolean }
  counts?: { score?: number; comments?: number }
}

const usable = (v: unknown): v is PostView => {
  const p = (v as PostView | null)?.post
  return !!p && typeof p.id === 'number' && typeof p.name === 'string' && !p.nsfw && !p.removed && !p.deleted
}

async function hot(f: Fetcher, community: string, page: number): Promise<PostView[]> {
  const r = (await f.json(`${API}/post/list?community_name=${encodeURIComponent(community)}&sort=Hot&limit=20&page=${page}`)) as { posts?: unknown }
  if (!Array.isArray(r?.posts)) throw new WebError('http', `Lemmy gave no list for ${community}`, 502)
  return r.posts.filter(usable)
}

/** One post with its five top comments. `others` are the community's other hot posts, offered as links. */
export async function lemmyPost(f: Fetcher, community: string, id: number, others: readonly PostView[], seen?: (postOnly: boolean) => void): Promise<Item> {
  const v = ((await f.json(`${API}/post?id=${id}`)) as { post_view?: unknown })?.post_view
  if (!usable(v)) throw new WebError('http', `no readable post ${id} (missing, NSFW, removed or deleted)`, 404)
  const c = ((await f.json(`${API}/comment/list?post_id=${id}&sort=Top&type_=All&max_depth=1&limit=5`)) as { comments?: unknown })?.comments
  const replies = (Array.isArray(c) ? c : [])
    .map((x) => (x as { comment?: { content?: unknown; removed?: boolean; deleted?: boolean } })?.comment)
    .filter((x): x is { content: string } => !!x && typeof x.content === 'string' && !x.removed && !x.deleted)
    .map((x) => markdownToText(x.content).slice(0, 600))
    .filter(Boolean)
  const p = v.post
  const head = [`Post in c/${community}: ${p.name.trim()}`, p.body ? markdownToText(p.body) : '', p.url && !onLemmy(p.url) ? `It links to a page on ${new URL(p.url).hostname}.` : '']
    .filter(Boolean)
    .join('\n')
  const images: ItemImage[] = [p.url, p.thumbnail_url].filter((u): u is string => typeof u === 'string' && onLemmy(u) && PICTURE.test(u)).slice(0, 1).map((url) => ({ url, licence: null, credit: null }))
  seen?.(images.length > 0 || wordCount(head) >= MIN_RECORD_WORDS)
  const text = [head, `Score ${v.counts?.score ?? 'unknown'}, ${v.counts?.comments ?? 'unknown'} comments.`, ...(replies.length ? ['Top comments:', ...replies.map((r) => `- ${r}`)] : [])].join('\n')
  const links: ItemLink[] = others.filter((o) => o.post.id !== id).map((o) => ({ title: o.post.name.slice(0, 100), url: pageOf(o.post.id) }))
  return { source: LEMMY, kind: 'record', tier: 'voices', url: pageOf(id), title: p.name.trim().slice(0, 200), text: cutToTokens(text), links: capLinks(links, MAX_RECORD_LINKS, onLemmy), images }
}

function lemmyPlan(community: string): TrialPlan {
  const lists = new Map<number, PostView[]>()
  let postOnly = 0
  let all = 0
  const listOf = async (f: Fetcher, page: number) => {
    if (!lists.has(page)) lists.set(page, await hot(f, community, page))
    return lists.get(page)!
  }
  const count = (readable: boolean) => {
    all++
    if (readable) postOnly++
  }
  return {
    id: `${LEMMY}/c/${community}`,
    community,
    host: LEMMY,
    itemHost: LEMMY,
    rule: TRIAL_HOSTS[0]!,
    paths: ['/api/v3/post/list', '/api/v3/post', '/api/v3/comment/list'],
    async start(f, seed, offset) {
      const posts = await listOf(f, 1 + offset)
      if (posts.length === 0) throw new WebError('http', `c/${community} has no hot posts`, 404)
      const at = posts[(seed * 4) % posts.length]!
      return lemmyPost(f, community, at.post.id, posts, count)
    },
    async open(f, url) {
      const m = onLemmy(url) ? /^\/post\/(\d+)$/.exec(new URL(url).pathname) : null
      if (!m) throw new WebError('not-allowed', `no trial adapter reads ${url}`)
      return lemmyPost(f, community, Number(m[1]), [...lists.values()].flat(), count)
    },
    note: () => `Without their comments, ${postOnly} of ${all} posts read would be readable (a picture on ${LEMMY} or ${MIN_RECORD_WORDS} words).`,
    reset() {
      lists.clear()
      postOnly = 0
      all = 0
    },
  }
}

/** Humour communities on lemmy.world whose posts are mostly words (issue #304; c/memes was 63% readable). Never Reddit, never Know Your Meme. */
export const TRIAL_PLANS: readonly TrialPlan[] = ['showerthoughts', 'dadjokes', 'microblogmemes'].map(lemmyPlan)

export const trialPlanFor = (id: string): TrialPlan | undefined => TRIAL_PLANS.find((p) => p.id === id)
