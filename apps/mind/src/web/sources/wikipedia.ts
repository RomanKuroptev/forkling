import { WebError, type Fetcher } from '../fetch.ts'
import { cutToTokens, htmlToText } from '../clean.ts'
import { capLinks, MAX_IMAGES, type Item } from '../item.ts'

const wiki = 'https://en.wikipedia.org'
const underscored = (title: string) => encodeURIComponent(title.replace(/ /g, '_'))

/** An English Wikipedia article through the action API: its text, up to 40 links to other articles, and its picture. */
export async function wikipediaArticle(f: Fetcher, title: string): Promise<Item> {
  const q = `${wiki}/w/api.php?action=query&format=json&formatversion=2&prop=extracts|links|pageimages&explaintext=1&pllimit=40&plnamespace=0&piprop=original&redirects=1&titles=${encodeURIComponent(title)}`
  const page = ((await f.json(q)) as any)?.query?.pages?.[0]
  if (!page || page.missing) throw new WebError('http', `no Wikipedia article called "${title}"`, 404)
  return {
    source: 'en.wikipedia.org',
    kind: 'page',
    tier: 'reference',
    url: `${wiki}/wiki/${underscored(page.title)}`,
    title: page.title,
    text: cutToTokens(htmlToText(page.extract ?? '')),
    links: capLinks((page.links ?? []).map((l: { title: string }) => ({ title: l.title, url: `${wiki}/wiki/${underscored(l.title)}` }))),
    images: page.original?.source ? [{ url: page.original.source, licence: null, credit: null }].slice(0, MAX_IMAGES) : [],
  }
}

/** The best match for a topic, or null when Wikipedia has nothing. A trip that starts from a topic begins here. */
export async function wikipediaSearch(f: Fetcher, topic: string): Promise<Item | null> {
  const found = (await f.json(`${wiki}/w/rest.php/v1/search/title?q=${encodeURIComponent(topic)}&limit=1`)) as any
  const first = found?.pages?.[0]
  return first ? wikipediaArticle(f, first.title) : null
}

export async function wikipediaRandom(f: Fetcher): Promise<Item> {
  const r = (await f.json(`${wiki}/w/api.php?action=query&format=json&list=random&rnnamespace=0&rnlimit=1`)) as any
  return wikipediaArticle(f, r.query.random[0].title)
}

/** One of the selected events of a day in history. `pick` chooses which, so the same seed reads the same one. */
export async function wikipediaOnThisDay(f: Fetcher, now: Date, pick: number): Promise<Item> {
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(now.getUTCDate()).padStart(2, '0')
  const feed = (await f.json(`${wiki}/api/rest_v1/feed/onthisday/selected/${mm}/${dd}`)) as { selected?: { pages: { title: string }[] }[] }
  const events = feed.selected ?? []
  if (events.length === 0) throw new WebError('http', 'no events for this day', 404)
  return wikipediaArticle(f, events[pick % events.length]!.pages[0]!.title.replace(/_/g, ' '))
}

/** An Esolang wiki page through the MediaWiki API (its content is CC0): text and the links to pages that exist. */
export async function esolangPage(f: Fetcher, title: string): Promise<Item> {
  const api = 'https://esolangs.org/w/api.php'
  const p = ((await f.json(`${api}?action=parse&format=json&formatversion=2&prop=text|links&page=${encodeURIComponent(title)}`)) as any)?.parse
  if (!p) throw new WebError('http', `no Esolang page called "${title}"`, 404)
  return {
    source: 'esolangs.org',
    kind: 'page',
    tier: 'reference',
    url: `https://esolangs.org/wiki/${underscored(title)}`,
    title,
    text: cutToTokens(htmlToText(p.text ?? '')),
    links: capLinks((p.links ?? []).filter((l: any) => l.ns === 0 && l.exists).map((l: { title: string }) => ({ title: l.title, url: `https://esolangs.org/wiki/${underscored(l.title)}` }))),
    images: [],
  }
}

export async function esolangRandom(f: Fetcher): Promise<Item> {
  const r = (await f.json('https://esolangs.org/w/api.php?action=query&format=json&list=random&rnnamespace=0&rnlimit=1')) as any
  return esolangPage(f, r.query.random[0].title)
}
