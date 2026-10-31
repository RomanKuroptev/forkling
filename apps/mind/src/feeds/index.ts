import { github } from './github.ts'
import { hackerNews } from './hackernews.ts'
import { lemmy } from './lemmy.ts'
import { mastodon } from './mastodon.ts'
import { sky } from './sky.ts'
import { item, MAX_SUMMARY, MAX_TITLE, type Feed, type FeedItem, type GetJson } from './types.ts'
import { onThisDay, randomPage } from './wikipedia-history.ts'
import { wikipediaTop } from './wikipedia-top.ts'

export type { FeedItem, GetJson } from './types.ts'

/** History and weirdness is two requests; it only fails when both do. */
const wikipediaHistory: Feed = async (get, nowMs) => {
  const parts = await Promise.allSettled([onThisDay(get, nowMs), randomPage(get, nowMs)])
  if (parts.every((p) => p.status === 'rejected')) throw (parts[0] as PromiseRejectedResult).reason
  return parts.flatMap((p) => (p.status === 'fulfilled' ? p.value : []))
}

/** One adapter per source. Adding a source is adding a line here. */
export const FEEDS: readonly { name: string; read: Feed }[] = [
  { name: 'wikipedia-top', read: wikipediaTop },
  { name: 'hackernews', read: hackerNews },
  { name: 'github', read: github },
  { name: 'sky', read: sky },
  { name: 'wikipedia-history', read: wikipediaHistory },
  { name: 'lemmy', read: lemmy },
  { name: 'mastodon', read: mastodon },
]

export interface FeedsResult {
  items: FeedItem[]
  /** Sources that broke, by name. A broken source is skipped, never fatal. */
  failed: string[]
}

/** Reads every source at once. Each fails soft. Whatever comes back is cut to safe lengths. */
export async function readFeeds(get: GetJson, nowMs: number): Promise<FeedsResult> {
  const results = await Promise.allSettled(FEEDS.map((f) => f.read(get, nowMs)))
  const items: FeedItem[] = []
  const failed: string[] = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') items.push(...r.value.map((it) => item(it.source, it.id, it.title.slice(0, MAX_TITLE * 4), it.summary.slice(0, MAX_SUMMARY * 4), it.url)))
    else failed.push(FEEDS[i]!.name)
  })
  return { items, failed }
}

const TIMEOUT_MS = 5000
const MAX_BYTES = 2_000_000

/** The real GET: a timeout, an honest user agent, and a size limit. Public, read-only, no logins. */
export const httpGetJson: GetJson = async (url) => {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'user-agent': 'forkling/0.6 (a read-only reader for an autonomous pet; https://github.com/RomanKuroptev/forkling)', accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}`)
  const text = await res.text()
  if (text.length > MAX_BYTES) throw new Error(`answer from ${new URL(url).host} is too big`)
  return JSON.parse(text)
}
