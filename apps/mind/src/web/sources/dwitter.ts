import { WebError, type Fetcher } from '../fetch.ts'
import { capLinks, MAX_RECORD_LINKS, type Item, type ItemLink } from '../item.ts'

// ---- Dwitter: JavaScript programs of at most 140 characters that draw on a canvas (www.dwitter.net) ----
// Read through the API the site's own pages use (`/apiv2beta/`): the hot list, one dweet with its comments, and a maker's
// other dweets. A dweet's code is text here: it is never run by this adapter.

export const DWITTER = 'www.dwitter.net'
const API = `https://${DWITTER}/apiv2beta/dweets/`
const HOT_LIMIT = 20
const COMMENTS = 5
const COMMENT_CHARS = 300

export const dweetPage = (id: number | string) => `https://${DWITTER}/d/${id}`

/** The id in a dweet's page address, or null. */
export function dweetIdOf(url: string): number | null {
  const m = /^https:\/\/www\.dwitter\.net\/d\/(\d{1,9})\/?$/.exec(url)
  return m ? Number(m[1]) : null
}

/**
 * The code a packed dweet stands for, or null when it is not packed. Many dweets pack two characters into one with
 * `eval(unescape(escape`...`.replace(/u\D*\/g,'')))`; this undoes that with string functions only, never `eval`.
 */
export function unpackDweet(code: string): string | null {
  const m = /^\s*eval\(unescape\(escape\s*`([\s\S]*)`\.replace\(\/u\\D\*\/g,\s*(['"])\2\)\)\)\s*;?\s*$/.exec(code)
  if (!m) return null
  try {
    return unescape(escape(m[1]!).replace(/u\D*/g, ''))
  } catch {
    return null
  }
}

export interface Dweet {
  id: number
  code: string
  /** The code as it runs, when the dweet was packed; else the code itself. */
  plain: string
  author: string
  likes: number
  posted: string
  remixOf: { id: number; author: string } | null
  remixes: number[]
  comments: { author: string; text: string }[]
}

const USERNAME = /^[\w.@+-]{1,150}$/

/** A dweet from the API, or null. The reply is a stranger's data: a deleted dweet, or one without an id, code and maker, is dropped. */
export function parseDweet(v: unknown): Dweet | null {
  const d = v as Record<string, any> | null
  if (!d || typeof d.id !== 'number' || typeof d.code !== 'string' || d.deleted === true || !d.code.trim()) return null
  const author = d.author?.username
  if (typeof author !== 'string' || !USERNAME.test(author)) return null
  const r = d.remix_of
  const remixOf = r && typeof r === 'object' && typeof r.id === 'number' && typeof r.author?.username === 'string' && USERNAME.test(r.author.username) ? { id: r.id, author: r.author.username } : null
  const code = d.code.slice(0, 2000)
  return {
    id: d.id,
    code,
    plain: unpackDweet(code) ?? code,
    author,
    likes: typeof d.awesome_count === 'number' ? d.awesome_count : 0,
    posted: typeof d.posted === 'string' ? d.posted.slice(0, 10) : 'unknown',
    remixOf,
    remixes: Array.isArray(d.remixes) ? d.remixes.flatMap((x: unknown) => (typeof x === 'number' ? [x] : typeof (x as { id?: unknown })?.id === 'number' ? [(x as { id: number }).id] : [])) : [],
    comments: (Array.isArray(d.comments) ? d.comments : [])
      .flatMap((c: any) => (typeof c?.text === 'string' && c.text.trim() && typeof c.author?.username === 'string' ? [{ author: String(c.author.username).slice(0, 60), text: c.text.trim().slice(0, COMMENT_CHARS) }] : []))
      .slice(0, COMMENTS),
  }
}

async function list(f: Fetcher, query: string): Promise<Dweet[]> {
  const r = (await f.json(`${API}?${query}`)) as { results?: unknown } | null
  if (!Array.isArray(r?.results)) throw new WebError('http', 'Dwitter gave no list of dweets', 502)
  return r.results.flatMap((x) => parseDweet(x) ?? [])
}

/** The hot dweets, hottest first: what the site's front page shows. */
export const dwitterHot = (f: Fetcher, n = HOT_LIMIT): Promise<Dweet[]> => list(f, `order_by=-hotness&limit=${n}`)

const linkOf = (d: { id: number; author: string }): ItemLink => ({ title: `Dweet ${d.id} by ${d.author}`, url: dweetPage(d.id) })

/** The hot dweets as links, for a morning. */
export async function dwitterHotLinks(f: Fetcher, n: number): Promise<ItemLink[]> {
  return (await dwitterHot(f, n)).map(linkOf)
}

/** One dweet, or a 404 when it is gone or cannot be read. */
export async function dwitterGet(f: Fetcher, id: number): Promise<Dweet> {
  const d = parseDweet(await f.json(`${API}${id}/`))
  if (!d) throw new WebError('http', `no readable dweet ${id}`, 404)
  return d
}

/** What a dweet is, in one line, so the code makes sense to a reader who has not seen Dwitter. */
const WHAT = 'A dweet is a JavaScript program of at most 140 characters, run 60 times a second as u(t): c is a 1920 by 1080 canvas, x its 2D context, t the time in seconds, S, C and T are Math.sin, cos and tan, and R(r,g,b,a) makes a colour.'

/** The dweet as text: who made it, its likes, its code, and its first comments. */
export function dweetText(d: Dweet): string {
  return [
    `Dweet ${d.id} by ${d.author}, posted ${d.posted}, ${d.likes} likes${d.remixOf ? `, a remix of dweet ${d.remixOf.id} by ${d.remixOf.author}` : ''}.`,
    WHAT,
    d.plain !== d.code ? 'Its code was packed; unpacked, it is:' : 'Its code:',
    d.plain,
    ...(d.comments.length > 0 ? ['Comments:', ...d.comments.map((c) => `${c.author}: ${c.text}`)] : []),
  ].join('\n')
}

/**
 * One dweet. Its links: the dweet it remixes, its remixes, other dweets by its maker, and the hot dweets beside it. No
 * picture: a dweet is drawn by running it, which only the sandbox may do.
 */
export async function dwitterDweet(f: Fetcher, id: number, hot: readonly Dweet[] = [], onDweet?: (d: Dweet) => void): Promise<Item> {
  const d = await dwitterGet(f, id)
  onDweet?.(d)
  const byMaker = await list(f, `username=${encodeURIComponent(d.author)}&limit=6`).catch(() => [] as Dweet[])
  const links = [
    ...(d.remixOf ? [linkOf(d.remixOf)] : []),
    ...d.remixes.slice(0, 2).map((r) => ({ title: `A remix of dweet ${d.id}`, url: dweetPage(r) })),
    ...byMaker.filter((x) => x.id !== d.id).slice(0, 3).map(linkOf),
    ...hot.filter((x) => x.id !== d.id).slice(0, 4).map(linkOf),
  ]
  return {
    source: DWITTER,
    kind: 'record',
    tier: 'voices',
    url: dweetPage(d.id),
    title: `Dweet ${d.id} by ${d.author}`,
    text: dweetText(d),
    links: capLinks(links, MAX_RECORD_LINKS),
    images: [],
  }
}
