import type { SouvenirLicence } from '@forkling/schema'
import { isReadable, type Tier } from './allowlist.ts'

/** Spec 6.2: a page offers up to 40 links and 10 images; a record has no links of its own, so code offers up to 8. */
export const MAX_LINKS = 40
export const MAX_IMAGES = 10
export const MAX_RECORD_LINKS = 8

/** A picture on an item. The licence is read by code from the site; null when the code cannot read an allowed one. */
export interface ItemImage {
  url: string
  licence: SouvenirLicence | null
  credit: string | null
}

export interface ItemLink {
  title: string
  url: string
}

/** What one read gives the read call: cleaned text (cut to 3,000 tokens), links it may follow, pictures it may look at. */
export interface Item {
  /** The host the item belongs to, as it is listed in `allowlist.ts` (a Hacker News story is `news.ycombinator.com`). */
  source: string
  kind: 'page' | 'record'
  tier: Tier
  url: string
  title: string
  text: string
  links: ItemLink[]
  images: ItemImage[]
}

/** Only links the code may read (or that `ok` accepts), each once, at most `max`. Anything else is dropped, so the model is never offered it. */
export function capLinks(links: readonly ItemLink[], max = MAX_LINKS, ok: (url: string) => boolean = isReadable): ItemLink[] {
  const seen = new Set<string>()
  const kept: ItemLink[] = []
  for (const link of links) {
    if (kept.length >= max) break
    if (!ok(link.url) || seen.has(link.url)) continue
    seen.add(link.url)
    kept.push(link)
  }
  return kept
}

export function wikipediaSearchLink(query: string): ItemLink {
  const q = query.trim().slice(0, 100)
  return { title: `${q} (Wikipedia search)`, url: `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(q)}` }
}

/** The licences the code allows (spec 6.3), from the words a site uses. Anything it cannot read is null. */
export function normalizeLicence(name: string | undefined | null): SouvenirLicence | null {
  const n = (name ?? '').trim()
  if (/^cc0\b/i.test(n)) return 'CC0'
  if (/^(public domain|pd\b)/i.test(n)) return 'public domain'
  if (/^cc[ -]by[ -]sa\b/i.test(n)) return 'CC BY-SA'
  if (/^cc[ -]by(?:[ -]\d|$)/i.test(n)) return 'CC BY'
  return null
}
