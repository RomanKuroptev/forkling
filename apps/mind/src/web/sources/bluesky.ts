/**
 * Bluesky's trending topics, read through its public AppView API (`public.api.bsky.app`, no login; robots.txt allows
 * everything and asks only that 429 be respected). A feed (spec 6.1): the day's topics are starting points, and a topic is a
 * voices record of what people post about it. Topics about deaths, violence, war or politics are skipped (`news-skip.ts`).
 *
 * A topic's page is its feed on bsky.app (`https://bsky.app/profile/<did>/feed/<rkey>`); the code reads it through the API.
 * Posts with any moderation label, or by an author with one, are left out, and so are their pictures (cdn.bsky.app is not read).
 */
import { cutToTokens } from '../clean.ts'
import { WebError, type Fetcher } from '../fetch.ts'
import { capLinks, MAX_RECORD_LINKS, type Item, type ItemLink } from '../item.ts'
import { isSkippedNews, newsSkipWord } from '../news-skip.ts'

export const BLUESKY_API = 'public.api.bsky.app'
const XRPC = `https://${BLUESKY_API}/xrpc`
/** How many posts of a topic are read. */
const POSTS = 10

export interface TrendingTopic {
  topic: string
  displayName: string
  description: string
  /** The topic's feed page on bsky.app. */
  url: string
}

const FEED_PATH = /^\/profile\/(did:[a-z]+:[A-Za-z0-9._:%-]+)\/feed\/([A-Za-z0-9._~-]+)$/

/** The feed a bsky.app topic page names, as an AT URI, or null. */
export function blueskyFeedOf(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' || u.hostname !== 'bsky.app' || u.port !== '' || u.username !== '' || u.password !== '' || u.search !== '') return null
    const m = FEED_PATH.exec(u.pathname)
    return m ? `at://${m[1]}/app.bsky.feed.generator/${m[2]}` : null
  } catch {
    return null
  }
}

/** The day's trending topics, those about deaths, violence, war or politics left out. */
export async function blueskyTrending(f: Fetcher, limit = 25, skipped?: (topic: string, word: string) => void): Promise<TrendingTopic[]> {
  const r = (await f.json(`${XRPC}/app.bsky.unspecced.getTrendingTopics?limit=${limit}`)) as { topics?: unknown }
  if (!Array.isArray(r?.topics)) throw new WebError('http', 'Bluesky gave no trending topics', 502)
  const out: TrendingTopic[] = []
  for (const t of r.topics as Record<string, unknown>[]) {
    const topic = typeof t?.topic === 'string' ? t.topic : ''
    const displayName = typeof t?.displayName === 'string' ? t.displayName : topic
    const description = typeof t?.description === 'string' ? t.description : ''
    const link = typeof t?.link === 'string' ? t.link : ''
    const url = `https://bsky.app${link}`
    if (!displayName || !link.startsWith('/') || !blueskyFeedOf(url)) continue
    const word = newsSkipWord(`${topic} ${displayName} ${description}`)
    if (word) {
      skipped?.(displayName, word)
      continue
    }
    out.push({ topic, displayName: displayName.slice(0, 200), description: description.slice(0, 500), url })
  }
  return out
}

/** The morning's starting points: the first `n` topics, each its feed page. */
export async function blueskyMorningLinks(f: Fetcher, n: number): Promise<ItemLink[]> {
  return (await blueskyTrending(f)).slice(0, n).map((t) => ({ title: t.displayName, url: t.url }))
}

interface FeedPost {
  post?: { author?: { handle?: unknown; labels?: unknown[] }; record?: { text?: unknown; langs?: unknown }; labels?: unknown[]; likeCount?: unknown }
}

const unlabelled = (p: FeedPost['post']) => (p?.labels?.length ?? 0) === 0 && (p?.author?.labels?.length ?? 0) === 0
const english = (langs: unknown) => !Array.isArray(langs) || langs.length === 0 || langs.some((l) => typeof l === 'string' && l.toLowerCase().startsWith('en'))

/**
 * A trending topic as a record: its name, what it is about, and what people post about it, with the other topics as links.
 * `topics` is today's list when the caller has it (one request fewer). A topic that is not trending today is refused, and so
 * is one the skip rule catches (today's list never has one), before its posts are asked for.
 */
export async function blueskyTopic(f: Fetcher, url: string, topics?: readonly TrendingTopic[]): Promise<Item> {
  const feed = blueskyFeedOf(url)
  if (!feed) throw new WebError('not-allowed', `no adapter reads ${url}`)
  const all = topics ?? (await blueskyTrending(f))
  const me = all.find((t) => t.url === url)
  if (!me) throw new WebError('http', `${url} is not trending on Bluesky today`, 404)
  if (isSkippedNews(`${me.topic} ${me.displayName} ${me.description}`)) throw new WebError('not-allowed', `${url} is news Merge skips`)
  const r = (await f.json(`${XRPC}/app.bsky.feed.getFeed?feed=${encodeURIComponent(feed)}&limit=${POSTS * 2}`)) as { feed?: unknown }
  if (!Array.isArray(r?.feed)) throw new WebError('http', `Bluesky gave no posts for ${url}`, 502)
  const posts = (r.feed as FeedPost[])
    .map((x) => x?.post)
    .filter((p) => unlabelled(p) && english(p?.record?.langs) && typeof p?.record?.text === 'string' && (p.record.text as string).trim().length > 0)
    .slice(0, POSTS)
    .map((p) => `- ${typeof p!.author?.handle === 'string' ? `@${p!.author.handle}` : 'someone'}: ${(p!.record!.text as string).replace(/\s+/g, ' ').trim().slice(0, 400)}`)
  const title = me.displayName
  const text = [`Trending on Bluesky today: ${title}`, me.description, posts.length ? 'What people post about it:' : 'No posts could be read.', ...posts].filter(Boolean).join('\n')
  const links: ItemLink[] = all.filter((t) => t.url !== url).map((t) => ({ title: t.displayName, url: t.url }))
  return { source: BLUESKY_API, kind: 'record', tier: 'voices', url, title, text: cutToTokens(text), links: capLinks(links, MAX_RECORD_LINKS), images: [] }
}
