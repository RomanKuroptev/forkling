/**
 * W0 voice test: fetches real items from the first allowlist (spec 6.1). Read-only GETs, one host at a time, a fixed
 * rate per host, a 10 second timeout and a 2 MB cap. Throwaway: W2 builds the real adapters in `src/web/`.
 *
 * Starting points are random articles and today's feeds, never topics picked here, so the test shows Merge's own taste.
 */
import { cutToTokens, htmlToText, PAGE_TOKENS, wordCount } from '../../src/web/clean.ts'

export type Kind = 'page' | 'record'
export type Tier = 'reference' | 'voices'

export interface Item {
  source: string
  kind: Kind
  tier: Tier
  url: string
  title: string
  /** Cleaned and cut to 3,000 tokens. */
  text: string
  links: { title: string; url: string }[]
  image?: string
}

export const USER_AGENT = 'forkling-voice-test/0.1 (+https://github.com/RomanKuroptev/forkling)'
const MAX_BYTES = 2 * 1024 * 1024
const GAP_MS: Record<string, number> = { 'en.wikipedia.org': 2000, 'esolangs.org': 2000, 'api.artic.edu': 2000 }
const lastAt = new Map<string, number>()

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** A record's picture as JPEG, at most 2 MB, for the read call to look at (spec 7.8). Null for anything else. */
export async function fetchJpeg(url: string): Promise<string | null> {
  try {
    const host = new URL(url).host
    const wait = (lastAt.get(host) ?? 0) + (GAP_MS[host] ?? 1000) - Date.now()
    if (wait > 0) await sleep(wait)
    lastAt.set(host, Date.now())
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(10_000) })
    fetchLog.push({ url, status: res.status })
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('jpeg')) return null
    const bytes = Buffer.from(await res.arrayBuffer())
    return bytes.length <= MAX_BYTES ? bytes.toString('base64') : null
  } catch {
    return null
  }
}

export const fetchLog: { url: string; status: number | string }[] = []

async function get(url: string, accept = 'application/json'): Promise<string> {
  const host = new URL(url).host
  const gap = GAP_MS[host] ?? 1000
  const wait = (lastAt.get(host) ?? 0) + gap - Date.now()
  if (wait > 0) await sleep(wait)
  lastAt.set(host, Date.now())
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: accept }, signal: AbortSignal.timeout(10_000), redirect: 'follow' })
  fetchLog.push({ url, status: res.status })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  const body = await res.text()
  if (body.length > MAX_BYTES) throw new Error(`over 2 MB: ${url}`)
  return body
}

const json = async (url: string): Promise<any> => JSON.parse(await get(url))

const wiki = 'https://en.wikipedia.org'

async function wikipediaArticle(title: string): Promise<Item> {
  const q = `${wiki}/w/api.php?action=query&format=json&formatversion=2&prop=extracts|links|pageimages&explaintext=1&pllimit=40&plnamespace=0&piprop=original&redirects=1&titles=${encodeURIComponent(title)}`
  const page = (await json(q)).query.pages[0]
  return {
    source: 'en.wikipedia.org',
    kind: 'page',
    tier: 'reference',
    url: `${wiki}/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`,
    title: page.title,
    text: cutToTokens(htmlToText(page.extract ?? ''), PAGE_TOKENS),
    links: (page.links ?? []).map((l: any) => ({ title: l.title, url: `${wiki}/wiki/${encodeURIComponent(l.title.replace(/ /g, '_'))}` })),
    image: page.original?.source,
  }
}

async function wikipediaRandom(): Promise<Item> {
  const r = await json(`${wiki}/w/api.php?action=query&format=json&list=random&rnnamespace=0&rnlimit=1`)
  return wikipediaArticle(r.query.random[0].title)
}

async function wikipediaOnThisDay(now: Date, pick: number): Promise<Item> {
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const feed = await json(`${wiki}/api/rest_v1/feed/onthisday/selected/${mm}/${dd}`)
  const events = feed.selected as { pages: { title: string }[] }[]
  const event = events[pick % events.length]!
  return wikipediaArticle(event.pages[0]!.title.replace(/_/g, ' '))
}

async function esolang(): Promise<Item> {
  const api = 'https://esolangs.org/w/api.php'
  const r = await json(`${api}?action=query&format=json&list=random&rnnamespace=0&rnlimit=1`)
  const title = r.query.random[0].title
  const p = (await json(`${api}?action=parse&format=json&formatversion=2&prop=text|links&page=${encodeURIComponent(title)}`)).parse
  return {
    source: 'esolangs.org',
    kind: 'page',
    tier: 'reference',
    url: `https://esolangs.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
    title,
    text: cutToTokens(htmlToText(p.text), PAGE_TOKENS),
    links: (p.links ?? []).filter((l: any) => l.ns === 0 && l.exists).slice(0, 40).map((l: any) => ({ title: l.title, url: `https://esolangs.org/wiki/${encodeURIComponent(l.title.replace(/ /g, '_'))}` })),
  }
}

const hn = 'https://hacker-news.firebaseio.com/v0'

async function hackerNews(list: 'showstories' | 'topstories', index: number): Promise<Item> {
  const ids: number[] = await json(`${hn}/${list}.json`)
  for (const id of ids.slice(index, index + 15)) {
    const s = await json(`${hn}/item/${id}.json`)
    if (!s || (s.descendants ?? 0) < 5) continue
    const comments: string[] = []
    for (const kid of (s.kids ?? []).slice(0, 5)) {
      const c = await json(`${hn}/item/${kid}.json`)
      if (c?.text && !c.deleted) comments.push(`${c.by ?? 'someone'} said:\n${htmlToText(c.text)}`)
    }
    const body = [s.title, s.text ? htmlToText(s.text) : '', s.url ? `Link: ${s.url}` : '', ...comments].filter(Boolean).join('\n\n')
    return { source: 'news.ycombinator.com', kind: 'page', tier: 'voices', url: `https://news.ycombinator.com/item?id=${id}`, title: s.title, text: cutToTokens(body), links: [] }
  }
  throw new Error(`no ${list} story with comments`)
}

async function lobsters(index: number): Promise<Item> {
  const hot: any[] = await json('https://lobste.rs/hottest.json')
  const busy = hot.filter((s) => s.comment_count >= 5)
  const s = busy[index % busy.length]
  const full = await json(`https://lobste.rs/s/${s.short_id}.json`)
  const comments = (full.comments ?? [])
    .filter((c: any) => !c.is_deleted && !c.parent_comment)
    .slice(0, 5)
    .map((c: any) => `${c.commenting_user?.username ?? c.commenting_user ?? 'someone'} said:\n${htmlToText(c.comment)}`)
  const body = [s.title, `Tags: ${s.tags.join(', ')}`, s.description_plain || '', s.url ? `Link: ${s.url}` : '', ...comments].filter(Boolean).join('\n\n')
  return { source: 'lobste.rs', kind: 'page', tier: 'voices', url: s.short_id_url ?? `https://lobste.rs/s/${s.short_id}`, title: s.title, text: cutToTokens(body), links: [] }
}

async function imgflip(index: number): Promise<Item> {
  const memes: any[] = (await json('https://api.imgflip.com/get_memes')).data.memes
  const m = memes[index % memes.length]
  const rank = memes.indexOf(m) + 1
  return {
    source: 'api.imgflip.com',
    kind: 'record',
    tier: 'voices',
    url: `https://imgflip.com/meme/${m.id}`,
    title: m.name,
    text: `Meme format: ${m.name}\nRank among the 100 most-captioned formats of the last 30 days: ${rank}\nCaption boxes: ${m.box_count}\nCaptions in the last 30 days: ${m.captions ?? 'unknown'}`,
    links: [{ title: `${m.name} (Wikipedia search)`, url: `${wiki}/w/index.php?search=${encodeURIComponent(m.name)}` }],
    image: m.url,
  }
}

async function artic(page: number): Promise<Item> {
  const fields = 'id,title,artist_display,date_display,medium_display,place_of_origin,description,short_description,image_id,is_public_domain'
  const a = (await json(`https://api.artic.edu/api/v1/artworks/search?query[term][is_public_domain]=true&page=${page}&limit=1&fields=${fields}`)).data[0]
  const text = [
    `Title: ${a.title}`,
    `Artist: ${a.artist_display ?? 'unknown'}`,
    `Date: ${a.date_display ?? 'unknown'}`,
    `Medium: ${a.medium_display ?? 'unknown'}`,
    `Place of origin: ${a.place_of_origin ?? 'unknown'}`,
    a.description ? htmlToText(a.description) : a.short_description ?? '',
  ].filter(Boolean).join('\n')
  return {
    source: 'api.artic.edu',
    kind: 'record',
    tier: 'reference',
    url: `https://www.artic.edu/artworks/${a.id}`,
    title: a.title,
    text: cutToTokens(text),
    links: [
      { title: `${a.artist_display?.split('\n')[0] ?? 'the artist'} (Wikipedia search)`, url: `${wiki}/w/index.php?search=${encodeURIComponent(a.artist_display?.split('\n')[0] ?? a.title)}` },
    ],
    image: a.image_id ? `https://www.artic.edu/iiif/2/${a.image_id}/full/843,/0/default.jpg` : undefined,
  }
}

async function apod(): Promise<Item> {
  const found: any[] = await json('https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY&count=5&thumbs=true')
  const a = found.find((x) => x.media_type === 'image' && wordCount(x.explanation ?? '') >= 40)
  if (!a) throw new Error('no APOD picture with an explanation')
  return {
    source: 'api.nasa.gov',
    kind: 'record',
    tier: 'reference',
    url: `https://apod.nasa.gov/apod/ap${a.date.slice(2).replace(/-/g, '')}.html`,
    title: a.title,
    text: cutToTokens(`Astronomy picture of the day, ${a.date}: ${a.title}\n\n${a.explanation}${a.copyright ? `\n\nImage credit: ${a.copyright}` : ''}`),
    links: [],
    image: a.url,
  }
}

async function github(index: number): Promise<Item> {
  const topics = ['creative-coding', 'generative-art', 'demoscene']
  const topic = topics[index % topics.length]
  const r = await json(`https://api.github.com/search/repositories?q=topic:${topic}+stars:%3E20&sort=updated&per_page=10`)
  const repo = r.items[index % r.items.length]
  let readme = ''
  try {
    readme = htmlToText(await get(`https://api.github.com/repos/${repo.full_name}/readme`, 'application/vnd.github.raw'))
  } catch {
    readme = ''
  }
  return {
    source: 'api.github.com',
    kind: 'record',
    tier: 'reference',
    url: repo.html_url,
    title: repo.full_name,
    text: cutToTokens(`${repo.full_name}: ${repo.description ?? ''}\nTopics: ${(repo.topics ?? []).join(', ')}\nStars: ${repo.stargazers_count}\n\n${readme}`),
    links: [],
  }
}

/** Pages under 300 words and records with no image and under 40 words are skipped before any model call (spec 6.6). */
export function readable(item: Item): boolean {
  if (item.kind === 'page') return wordCount(item.text) >= 300 || item.tier === 'voices' && wordCount(item.text) >= 120
  return Boolean(item.image) || wordCount(item.text) >= 40
}

type Source = { name: string; take: number; next: (n: number) => Promise<Item> }

/** The mix for 20 reads. Voices sites get a lower word floor: a thread is short but has a lot in it. */
export function plan(now: Date, offset: number): Source[] {
  return [
    { name: 'wikipedia random', take: 3, next: () => wikipediaRandom() },
    { name: 'wikipedia on this day', take: 2, next: (n) => wikipediaOnThisDay(now, offset + n * 3) },
    { name: 'esolangs random', take: 3, next: () => esolang() },
    { name: 'hacker news show', take: 2, next: (n) => hackerNews('showstories', offset + n * 15) },
    { name: 'hacker news top', take: 2, next: (n) => hackerNews('topstories', offset + n * 15) },
    { name: 'lobste.rs hottest', take: 2, next: (n) => lobsters(offset + n) },
    { name: 'imgflip top formats', take: 2, next: (n) => imgflip(offset * 7 + n * 13) },
    { name: 'art institute of chicago', take: 2, next: (n) => artic(1 + ((offset * 97 + n * 331) % 900)) },
    { name: 'nasa apod', take: 1, next: () => apod() },
    { name: 'github creative coding', take: 1, next: (n) => github(offset + n) },
  ]
}

/** Fetches the planned mix. A failed or unreadable item is logged and replaced, up to 8 extra tries per source. */
export async function gather(now: Date, offset: number, log: (line: string) => void): Promise<{ items: Item[]; skipped: string[] }> {
  const items: Item[] = []
  const skipped: string[] = []
  for (const source of plan(now, offset)) {
    let got = 0
    for (let attempt = 0; got < source.take && attempt < source.take + 8; attempt++) {
      try {
        const item = await source.next(attempt)
        if (items.some((i) => i.url === item.url)) continue
        if (!readable(item)) {
          skipped.push(`${source.name}: "${item.title}" too short (${wordCount(item.text)} words)`)
          continue
        }
        items.push(item)
        got++
        log(`  ${source.name}: ${item.title} (${wordCount(item.text)} words)`)
      } catch (error) {
        skipped.push(`${source.name}: ${(error as Error).message}`)
      }
    }
  }
  return { items, skipped }
}
