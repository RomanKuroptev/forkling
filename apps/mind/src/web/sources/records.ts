import { WebError, type Fetcher } from '../fetch.ts'
import { cutToTokens, htmlToText } from '../clean.ts'
import { capLinks, MAX_RECORD_LINKS, wikipediaTopicLink, type Item, type ItemLink } from '../item.ts'

/** A search that fails just gives fewer links: a record is still worth reading without them. */
async function soft<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run()
  } catch {
    return null
  }
}

// ---- Imgflip: the 100 most-captioned meme formats of the last 30 days (the pulse of memes, spec 6.1) ----

interface Format {
  id: string
  name: string
  url: string
  boxes: number | null
  captions: number | null
}

/**
 * The ranking, in rank order. The reply is a stranger's data: an entry that does not have a text id, a name and an https
 * picture on i.imgflip.com is dropped, and a reply with no list at all is an error.
 */
async function formats(f: Fetcher): Promise<Format[]> {
  const list = ((await f.json('https://api.imgflip.com/get_memes')) as { data?: { memes?: unknown } } | null)?.data?.memes
  if (!Array.isArray(list)) throw new WebError('http', 'Imgflip gave no list of formats', 502)
  const out: Format[] = []
  for (const m of list as Record<string, unknown>[]) {
    if (!m || typeof m.id !== 'string' || !/^\d{1,20}$/.test(m.id) || typeof m.name !== 'string' || !m.name.trim() || typeof m.url !== 'string' || !m.url.startsWith('https://i.imgflip.com/')) continue
    out.push({ id: m.id, name: m.name.trim().slice(0, 100), url: m.url, boxes: typeof m.box_count === 'number' ? m.box_count : null, captions: typeof m.captions === 'number' ? m.captions : null })
  }
  return out
}

const imgflipPage = (id: string) => `https://imgflip.com/meme/${id}`

/** The top formats as links, most captioned first: starting points for a morning. Nothing is kept from the feed itself. */
export async function imgflipTopLinks(f: Fetcher, n: number): Promise<ItemLink[]> {
  return (await formats(f)).slice(0, n).map((m) => ({ title: m.name, url: imgflipPage(m.id) }))
}

/** One format. Its links are the formats next to it in the ranking and the Wikipedia page for its name. */
export async function imgflipFormat(f: Fetcher, id: string): Promise<Item> {
  const all = await formats(f)
  const at = all.findIndex((m) => m.id === id)
  if (at < 0) throw new WebError('http', `no Imgflip format ${id}`, 404)
  const m = all[at]!
  const near = [-1, 1, -2, 2].flatMap((d) => (all[at + d] ? [all[at + d]!] : []))
  return {
    source: 'api.imgflip.com',
    kind: 'record',
    tier: 'voices',
    url: imgflipPage(m.id),
    title: m.name,
    text: `Meme format: ${m.name}\nRank among the 100 most-captioned formats of the last 30 days: ${at + 1}\nCaption boxes: ${m.boxes ?? 'unknown'}\nCaptions in the last 30 days: ${m.captions ?? 'unknown'}`,
    links: capLinks([...near.map((n) => ({ title: n.name, url: imgflipPage(n.id) })), wikipediaTopicLink(m.name)], MAX_RECORD_LINKS),
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
    links: capLinks([...byMaker, ...fromPlace, ...bySubject, ...(maker ? [wikipediaTopicLink(maker)] : []), ...(subject ? [wikipediaTopicLink(subject)] : [])], MAX_RECORD_LINKS),
    images: a.image_id
      ? [{ url: `https://www.artic.edu/iiif/2/${a.image_id}/full/843,/0/default.jpg`, licence: a.is_public_domain ? 'public domain' : null, credit: `${maker ?? 'unknown artist'}, Art Institute of Chicago` }]
      : [],
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
      [...similar.filter((n) => n !== repo.full_name).slice(0, 4).map((n) => ({ title: n, url: `https://github.com/${n}` })), ...topics.slice(0, 3).map(wikipediaTopicLink)],
      MAX_RECORD_LINKS,
    ),
    images: [],
  }
}
