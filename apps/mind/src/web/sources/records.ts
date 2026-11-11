import { WebError, type Fetcher } from '../fetch.ts'
import { cutToTokens, htmlToText } from '../clean.ts'
import { capLinks, MAX_RECORD_LINKS, normalizeLicence, wikipediaSearchLink, type Item, type ItemLink } from '../item.ts'

/** A search that fails just gives fewer links: a record is still worth reading without them. */
async function soft<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run()
  } catch {
    return null
  }
}

// ---- Imgflip: the 100 most-captioned meme formats of the last 30 days ----

interface Meme {
  id: string
  name: string
  url: string
  box_count: number
  captions?: number
}

async function memes(f: Fetcher): Promise<Meme[]> {
  return ((await f.json('https://api.imgflip.com/get_memes')) as any).data.memes
}

/** The ids of the top formats, in rank order: where a trip may start. */
export async function imgflipIds(f: Fetcher): Promise<string[]> {
  return (await memes(f)).map((m) => m.id)
}

/** One format. Its links are the formats next to it in the ranking and a Wikipedia search for its name. */
export async function imgflipFormat(f: Fetcher, id: string): Promise<Item> {
  const all = await memes(f)
  const at = all.findIndex((m) => m.id === id)
  if (at < 0) throw new WebError('http', `no Imgflip format ${id}`, 404)
  const m = all[at]!
  const near = [-1, 1, -2, 2].flatMap((d) => (all[at + d] ? [all[at + d]!] : []))
  return {
    source: 'api.imgflip.com',
    kind: 'record',
    tier: 'voices',
    url: `https://imgflip.com/meme/${m.id}`,
    title: m.name,
    text: `Meme format: ${m.name}\nRank among the 100 most-captioned formats of the last 30 days: ${at + 1}\nCaption boxes: ${m.box_count}\nCaptions in the last 30 days: ${m.captions ?? 'unknown'}`,
    links: capLinks([...near.map((n) => ({ title: n.name, url: `https://imgflip.com/meme/${n.id}` })), wikipediaSearchLink(m.name)], MAX_RECORD_LINKS),
    images: [{ url: m.url, licence: null, credit: null }],
  }
}

// ---- Art Institute of Chicago ----

const ARTIC_FIELDS = 'id,title,artist_display,artist_title,date_display,medium_display,place_of_origin,description,short_description,image_id,is_public_domain,subject_titles'

async function articMore(f: Fetcher, query: string | undefined, not: number): Promise<ItemLink[]> {
  if (!query) return []
  const found = await soft(async () => ((await f.json(`https://api.artic.edu/api/v1/artworks/search?q=${encodeURIComponent(query)}&limit=4&fields=id,title`)) as any).data as { id: number; title: string }[])
  return (found ?? []).filter((r) => r.id !== not).slice(0, 3).map((r) => ({ title: r.title, url: `https://www.artic.edu/artworks/${r.id}` }))
}

/** The id of a public-domain artwork on a result page, for a trip that starts at random. */
export async function articRandomId(f: Fetcher, page: number): Promise<number> {
  const r = (await f.json(`https://api.artic.edu/api/v1/artworks/search?query[term][is_public_domain]=true&page=${page}&limit=1&fields=id`)) as any
  const id = r?.data?.[0]?.id
  if (!id) throw new WebError('http', 'no artwork on that page', 404)
  return id
}

/** An artwork: its fields as text, its picture with a licence only if the museum calls it public domain, and links to other records. */
export async function articWork(f: Fetcher, id: number | string): Promise<Item> {
  const a = ((await f.json(`https://api.artic.edu/api/v1/artworks/${id}?fields=${ARTIC_FIELDS}`)) as any)?.data
  if (!a) throw new WebError('http', `no artwork ${id}`, 404)
  const text = [
    `Title: ${a.title}`,
    `Artist: ${a.artist_display ?? 'unknown'}`,
    `Date: ${a.date_display ?? 'unknown'}`,
    `Medium: ${a.medium_display ?? 'unknown'}`,
    `Place of origin: ${a.place_of_origin ?? 'unknown'}`,
    a.description ? htmlToText(a.description) : (a.short_description ?? ''),
  ]
    .filter(Boolean)
    .join('\n')
  const maker: string | undefined = a.artist_title ?? undefined
  const subject: string | undefined = a.subject_titles?.[0]
  const [byMaker, fromPlace, bySubject] = await Promise.all([articMore(f, maker, a.id), articMore(f, a.place_of_origin ?? undefined, a.id), articMore(f, subject, a.id)])
  return {
    source: 'api.artic.edu',
    kind: 'record',
    tier: 'reference',
    url: `https://www.artic.edu/artworks/${a.id}`,
    title: a.title,
    text: cutToTokens(text),
    links: capLinks([...byMaker, ...fromPlace, ...bySubject, ...(maker ? [wikipediaSearchLink(maker)] : []), ...(subject ? [wikipediaSearchLink(subject)] : [])], MAX_RECORD_LINKS),
    images: a.image_id
      ? [{ url: `https://www.artic.edu/iiif/2/${a.image_id}/full/843,/0/default.jpg`, licence: a.is_public_domain ? 'public domain' : null, credit: `${maker ?? 'unknown artist'}, Art Institute of Chicago` }]
      : [],
  }
}

// ---- NASA: astronomy picture of the day ----

const DAY_MS = 86_400_000
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const apodPage = (date: string) => `https://apod.nasa.gov/apod/ap${date.slice(2).replace(/-/g, '')}.html`

/**
 * The astronomy picture of a date (YYYY-MM-DD). A picture with no copyright line is NASA's and in the public domain; one
 * with a credit belongs to its photographer, so the code gives it no licence. Links: earlier days, and a Wikipedia search.
 */
export async function apod(f: Fetcher, date: string, key = 'DEMO_KEY'): Promise<Item> {
  const a = (await f.json(`https://api.nasa.gov/planetary/apod?api_key=${key}&date=${date}&thumbs=true`)) as any
  if (!a || a.media_type !== 'image') throw new WebError('http', `no APOD picture on ${date}`, 404)
  const day = Date.parse(`${date}T00:00:00Z`)
  return {
    source: 'api.nasa.gov',
    kind: 'record',
    tier: 'reference',
    url: apodPage(date),
    title: a.title,
    text: cutToTokens(`Astronomy picture of the day, ${date}: ${a.title}\n\n${a.explanation ?? ''}${a.copyright ? `\n\nImage credit: ${a.copyright}` : ''}`),
    links: capLinks(
      [...[1, 2, 7, 30].map((d) => ({ title: `Astronomy picture of ${isoDay(day - d * DAY_MS)}`, url: apodPage(isoDay(day - d * DAY_MS)) })), wikipediaSearchLink(a.title)],
      MAX_RECORD_LINKS,
    ),
    images: [{ url: a.url, licence: a.copyright ? null : 'public domain', credit: a.copyright ? String(a.copyright).trim() : 'NASA' }],
  }
}

// ---- GitHub ----

/** Repositories under a topic, newest activity first: where a trip may start. */
export async function githubTopicRepos(f: Fetcher, topic: string, per = 10): Promise<string[]> {
  const r = (await f.json(`https://api.github.com/search/repositories?q=topic:${encodeURIComponent(topic)}+stars:%3E20&sort=updated&per_page=${per}`)) as any
  return (r.items ?? []).map((x: { full_name: string }) => x.full_name)
}

/** A repository: its description, topics and README. Links: other repositories under its first topic, and Wikipedia searches for its topics. */
export async function githubRepo(f: Fetcher, fullName: string): Promise<Item> {
  const repo = (await f.json(`https://api.github.com/repos/${fullName}`)) as any
  if (!repo?.full_name) throw new WebError('http', `no repository ${fullName}`, 404)
  const readme = (await soft(() => f.text(`https://api.github.com/repos/${fullName}/readme`, { accept: 'application/vnd.github.raw' }))) ?? ''
  const topics: string[] = repo.topics ?? []
  const similar = topics[0] ? ((await soft(() => githubTopicRepos(f, topics[0]!, 5))) ?? []) : []
  return {
    source: 'api.github.com',
    kind: 'record',
    tier: 'reference',
    url: repo.html_url,
    title: repo.full_name,
    text: cutToTokens(`${repo.full_name}: ${repo.description ?? ''}\nTopics: ${topics.join(', ')}\nStars: ${repo.stargazers_count}\n\n${htmlToText(readme)}`),
    links: capLinks(
      [...similar.filter((n) => n !== repo.full_name).slice(0, 4).map((n) => ({ title: n, url: `https://github.com/${n}` })), ...topics.slice(0, 3).map(wikipediaSearchLink)],
      MAX_RECORD_LINKS,
    ),
    images: [],
  }
}

// ---- Wikimedia Commons: image file pages ----

/** A file page: the image, its licence read from the licence name (null if the code cannot read an allowed one) and its credit. */
export async function commonsFile(f: Fetcher, title: string): Promise<Item> {
  const q = `https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&prop=imageinfo&iiprop=url|extmetadata&titles=${encodeURIComponent(title)}`
  const page = ((await f.json(q)) as any)?.query?.pages?.[0]
  const info = page?.imageinfo?.[0]
  if (!page || page.missing || !info?.url) throw new WebError('http', `no Commons file "${title}"`, 404)
  const meta = info.extmetadata ?? {}
  const licenceName: string = meta.LicenseShortName?.value ?? ''
  const credit = htmlToText(meta.Artist?.value ?? '') || htmlToText(meta.Credit?.value ?? '') || null
  const bare = String(page.title).replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ')
  return {
    source: 'commons.wikimedia.org',
    kind: 'record',
    tier: 'reference',
    url: `https://commons.wikimedia.org/wiki/${encodeURIComponent(String(page.title).replace(/ /g, '_')).replace('%3A', ':')}`,
    title: page.title,
    text: cutToTokens([`File: ${page.title}`, htmlToText(meta.ImageDescription?.value ?? ''), `Licence: ${licenceName || 'unknown'}`, credit ? `Credit: ${credit}` : ''].filter(Boolean).join('\n')),
    links: capLinks([wikipediaSearchLink(bare)], MAX_RECORD_LINKS),
    images: [{ url: info.url, licence: normalizeLicence(licenceName), credit }],
  }
}
