import type { WorkLibrary } from '@forkling/schema'
import { isAllowed } from '../allowlist.ts'
import { cutToTokens, htmlToText } from '../clean.ts'
import type { Fetcher } from '../fetch.ts'
import { capLinks, type Item, type ItemLink } from '../item.ts'

/** The library manuals of spec 6.1. They are for tinker only: a wander is refused them. */
export const MANUAL_HOSTS = ['p5js.org', 'tonejs.github.io', 'threejs.org', 'developer.mozilla.org'] as const

/**
 * Where Merge starts reading about each library it may use in a work. p5 starts at its Get Started page, not the reference
 * index: that index is over the 2 MB cap (QA #314). Tone.js starts at its docs, which send a reader on with a meta refresh.
 */
export const MANUAL_START: Record<WorkLibrary, string> = {
  p5: 'https://p5js.org/tutorials/get-started/',
  tone: 'https://tonejs.github.io/docs/',
  three: 'https://threejs.org/docs/',
}

/** How many manual pages a tinker call is offered, and how long each may be: a small part of a prompt. */
const MAX_MANUALS = 2
const MANUAL_TOKENS = 1_500
/** How many meta refreshes a manual page may pass on before its page is taken as it is. */
const MAX_REFRESHES = 3

/** Where a page's `<meta http-equiv="refresh">` sends a reader, when it is on the same host; otherwise nothing. */
function sameHostRefresh(html: string, base: string): string | undefined {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (!/http-equiv\s*=\s*["']?refresh/i.test(tag)) continue
    const content = /content\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag)
    const target = /url\s*=\s*['"]?([^'"]+)/i.exec(content?.[1] ?? content?.[2] ?? '')?.[1]?.trim()
    if (!target) return undefined
    try {
      const url = new URL(target, base)
      url.hash = ''
      return url.hostname === new URL(base).hostname && url.toString() !== base ? url.toString() : undefined
    } catch {
      return undefined
    }
  }
  return undefined
}

/** Links in a page's HTML, resolved against the page. The page itself is left out. */
function linksOf(html: string, base: string): ItemLink[] {
  const found: ItemLink[] = []
  for (const m of html.matchAll(/<a\s[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const url = new URL(m[1]!, base)
      url.hash = ''
      if (url.toString() === base) continue
      found.push({ title: htmlToText(m[2]!).slice(0, 100) || url.pathname, url: url.toString() })
    } catch {
      // Not a URL: skipped.
    }
  }
  return found
}

/**
 * A manual page as text, with the links that stay on the manuals. The fetcher must be a tinker one, or the host is refused.
 * A page that is only a meta refresh to the same host (Tone.js docs to `latest/` to a version, QA #315) is followed, a few
 * times at most; the item is the page the reader ended on.
 */
export async function manualPage(f: Fetcher, start: string): Promise<Item> {
  let url = start
  let html = await f.text(url, { accept: 'text/html' })
  for (let hop = 0; hop < MAX_REFRESHES; hop++) {
    const next = sameHostRefresh(html, url)
    if (!next) break
    url = next
    html = await f.text(url, { accept: 'text/html' })
  }
  const title = htmlToText(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '') || new URL(url).pathname
  return {
    source: new URL(url).hostname,
    kind: 'page',
    tier: 'reference',
    url,
    title,
    text: cutToTokens(htmlToText(html)),
    links: capLinks(linksOf(html, url), undefined, (u) => isAllowed(u, 'tinker')),
    images: [],
  }
}

/**
 * The manual pages a tinker call is offered (spec 12.4, untried things): the front page of the manual for each of the first
 * two libraries it has never used, each cut short. A page that cannot be read is skipped and never fails the call: a manual
 * is help, not a need.
 */
export async function manualPagesFor(f: Fetcher, libraries: readonly WorkLibrary[]): Promise<{ title: string; url: string; text: string }[]> {
  const pages: { title: string; url: string; text: string }[] = []
  for (const library of libraries.slice(0, MAX_MANUALS)) {
    try {
      const item = await manualPage(f, MANUAL_START[library])
      pages.push({ title: item.title, url: item.url, text: cutToTokens(item.text, MANUAL_TOKENS) })
    } catch {
      // Skipped.
    }
  }
  return pages
}
