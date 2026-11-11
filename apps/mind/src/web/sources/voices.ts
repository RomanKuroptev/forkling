import { WebError, type Fetcher } from '../fetch.ts'
import { cutToTokens, htmlToText } from '../clean.ts'
import { isAllowed } from '../allowlist.ts'
import { capLinks, MAX_LINKS, type Item } from '../item.ts'

const hn = 'https://hacker-news.firebaseio.com/v0'
const COMMENTS = 5

/** The ids on a Hacker News list, in order: where a trip may start. */
export async function hackerNewsIds(f: Fetcher, list: 'showstories' | 'topstories'): Promise<number[]> {
  return (await f.json(`${hn}/${list}.json`)) as number[]
}

/**
 * A Hacker News story with its top 5 comments. It is a voices page: what people said, each line with the name they posted
 * under. The story's own link is offered only when its site is on the allowlist.
 */
export async function hackerNewsStory(f: Fetcher, id: number | string): Promise<Item> {
  const s = (await f.json(`${hn}/item/${id}.json`)) as any
  if (!s || s.deleted || s.dead) throw new WebError('http', `no Hacker News story ${id}`, 404)
  const comments: string[] = []
  for (const kid of (s.kids ?? []).slice(0, COMMENTS)) {
    const c = (await f.json(`${hn}/item/${kid}.json`)) as any
    if (c?.text && !c.deleted && !c.dead) comments.push(`${c.by ?? 'someone'} said:\n${htmlToText(c.text)}`)
  }
  const body = [s.title, s.text ? htmlToText(s.text) : '', s.url ? `Link: ${s.url}` : '', ...comments].filter(Boolean).join('\n\n')
  return {
    source: 'news.ycombinator.com',
    kind: 'page',
    tier: 'voices',
    url: `https://news.ycombinator.com/item?id=${s.id ?? id}`,
    title: s.title ?? `Story ${id}`,
    text: cutToTokens(body),
    links: s.url ? capLinks([{ title: s.title, url: s.url }], MAX_LINKS, isAllowed) : [],
    images: [],
  }
}

/** The short ids of the hottest stories on lobste.rs that have comments. */
export async function lobstersHot(f: Fetcher): Promise<string[]> {
  const hot = (await f.json('https://lobste.rs/hottest.json')) as { short_id: string; comment_count: number }[]
  return hot.filter((s) => s.comment_count >= COMMENTS).map((s) => s.short_id)
}

/** A lobste.rs story with its tags and its top 5 top-level comments, as a voices page. */
export async function lobstersStory(f: Fetcher, shortId: string): Promise<Item> {
  const s = (await f.json(`https://lobste.rs/s/${shortId}.json`)) as any
  if (!s?.title) throw new WebError('http', `no lobste.rs story ${shortId}`, 404)
  const comments = (s.comments ?? [])
    .filter((c: any) => !c.is_deleted && !c.parent_comment)
    .slice(0, COMMENTS)
    .map((c: any) => `${c.commenting_user?.username ?? c.commenting_user ?? 'someone'} said:\n${htmlToText(c.comment)}`)
  const body = [s.title, `Tags: ${(s.tags ?? []).join(', ')}`, s.description_plain || '', s.url ? `Link: ${s.url}` : '', ...comments].filter(Boolean).join('\n\n')
  return {
    source: 'lobste.rs',
    kind: 'page',
    tier: 'voices',
    url: s.short_id_url ?? `https://lobste.rs/s/${shortId}`,
    title: s.title,
    text: cutToTokens(body),
    links: s.url ? capLinks([{ title: s.title, url: s.url }], MAX_LINKS, isAllowed) : [],
    images: [],
  }
}
