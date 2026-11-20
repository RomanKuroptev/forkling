import { htmlToText } from '../clean.ts'
import { WebError, type Fetcher } from '../fetch.ts'
import { capLinks, MAX_RECORD_LINKS, type Item, type ItemLink } from '../item.ts'

// ---- Imgflip Top New: the templates made lately that people caption most (the newest of the pulse of memes) ----

/** The page: robots.txt allows it (it disallows only /orig/ and /browse/). */
export const TOP_NEW_URL = 'https://imgflip.com/memetemplates?sort=top-new'

/**
 * Roman's rule (20 November 2026): a template whose name is sexual or a slur is skipped. Whole words, any case, so "Essex"
 * or "cocktail" pass. The list is short on purpose: a name that slips through still meets the meme rules (no real person's
 * likeness, never making fun of a private person) and the work check.
 */
const BLOCKED_WORDS = [
  // sexual
  'sex', 'sexy', 'sexual', 'porn', 'porno', 'pornhub', 'nsfw', 'nude', 'nudes', 'naked', 'horny', 'hentai', 'rule34', 'onlyfans', 'boob', 'boobs', 'tits', 'titties',
  'dick', 'dicks', 'cock', 'cocks', 'pussy', 'cum', 'cumming', 'orgasm', 'erotic', 'fetish', 'milf', 'thot', 'slut', 'sluts', 'whore', 'whores', 'hooker', 'stripper', 'rape', 'rapist', 'pedo', 'pedophile', 'gooning', 'gooner', 'goon',
  // slurs
  'nigger', 'niggers', 'nigga', 'niggas', 'faggot', 'faggots', 'fag', 'fags', 'retard', 'retarded', 'retards', 'tranny', 'trannies', 'chink', 'chinks', 'spic', 'spics', 'kike', 'kikes', 'gook', 'gooks', 'wetback', 'coon', 'coons', 'dyke', 'dykes', 'raghead', 'towelhead', 'beaner', 'gypsy', 'gyp', 'paki', 'pakis', 'cripple', 'spaz', 'mongoloid',
] as const
const BLOCKED = new RegExp(`(?:^|[^a-z0-9])(?:${BLOCKED_WORDS.join('|')})(?=$|[^a-z0-9])`, 'i')

/** Whether a template's name is sexual or a slur (a whole word from the list). */
export const nameIsBlocked = (name: string): boolean => BLOCKED.test(name)

export interface NewTemplate {
  id: string
  name: string
  /** Its thumbnail on i.imgflip.com: a look may see it, nothing keeps it. */
  picture: string
}

/**
 * The template boxes of the Top New page, in page order. The page is a stranger's HTML: a box without a format id, a name and
 * a picture on i.imgflip.com is dropped, and so is a name on the blocked list.
 */
export function parseTopNew(html: string): NewTemplate[] {
  const out: NewTemplate[] = []
  for (const part of html.split('class="mt-box"').slice(1)) {
    const title = /class="mt-title"[^>]*>\s*<a\b[^>]*href="\/meme\/(\d{1,20})\/[^"]*"[^>]*>([^<]{1,200})<\/a>/.exec(part)
    const img = /<img\b[^>]*\bsrc="((?:https:)?\/\/i\.imgflip\.com\/[^"\s]+\.(?:jpe?g|png|gif|webp))"/i.exec(part)
    if (!title || !img) continue
    const name = htmlToText(title[2]!).replace(/\s+/g, ' ').trim().slice(0, 100)
    if (!name || nameIsBlocked(name) || out.some((t) => t.id === title[1])) continue
    out.push({ id: title[1]!, name, picture: img[1]!.startsWith('//') ? `https:${img[1]}` : img[1]! })
  }
  return out
}

async function topNew(f: Fetcher): Promise<NewTemplate[]> {
  const list = parseTopNew(await f.text(TOP_NEW_URL))
  if (list.length === 0) throw new WebError('http', 'Imgflip Top New gave no templates', 502)
  return list
}

const NEIGHBOURS = 4
const formatPage = (id: string) => `https://imgflip.com/meme/${id}`

/** The newest templates as format links, in the page's order: starting points for a morning. Nothing is kept from the feed itself. */
export async function imgflipNewLinks(f: Fetcher, n: number): Promise<ItemLink[]> {
  return (await topNew(f)).slice(0, n).map((t) => ({ title: t.name, url: formatPage(t.id) }))
}

/** One new template, as a voices record: its name, where it stands on the page, its picture to look at, and its neighbours as links. */
export async function imgflipNewFormat(f: Fetcher, id: string): Promise<Item> {
  const all = await topNew(f)
  const at = all.findIndex((t) => t.id === id)
  if (at < 0) throw new WebError('http', `no new Imgflip template ${id}`, 404)
  const t = all[at]!
  // The four nearest on the page, so the first and the last template have four too.
  const near = [-1, 1, -2, 2, -3, 3, -4, 4].flatMap((d) => (all[at + d] ? [all[at + d]!] : [])).slice(0, NEIGHBOURS)
  return {
    source: 'imgflip.com',
    kind: 'record',
    tier: 'voices',
    url: formatPage(t.id),
    title: t.name,
    text: `Meme format: ${t.name}\nA new template: number ${at + 1} of the ${all.length} templates made lately that people caption most (Imgflip's Top New page).`,
    links: capLinks(near.map((n) => ({ title: n.name, url: formatPage(n.id) })), MAX_RECORD_LINKS, (url) => url.startsWith('https://imgflip.com/meme/')),
    images: [{ url: t.picture, licence: null, credit: null }],
  }
}
