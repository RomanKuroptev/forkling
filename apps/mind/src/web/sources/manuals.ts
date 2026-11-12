import type { WorkLibrary } from '@forkling/schema'
import { isAllowed } from '../allowlist.ts'
import { cutToTokens, htmlToText } from '../clean.ts'
import type { Fetcher } from '../fetch.ts'
import { capLinks, type Item, type ItemLink } from '../item.ts'

/** The library manuals of spec 6.1. They are for tinker only: a wander is refused them. */
export const MANUAL_HOSTS = ['p5js.org', 'tonejs.github.io', 'threejs.org', 'developer.mozilla.org'] as const

/** Where Merge starts reading about each library it may use in a work. */
export const MANUAL_START: Record<WorkLibrary, string> = {
  p5: 'https://p5js.org/reference/',
  tone: 'https://tonejs.github.io/docs/',
  three: 'https://threejs.org/docs/',
}

/** How many manual pages a tinker call is offered, and how long each may be: a small part of a prompt. */
const MAX_MANUALS = 2
const MANUAL_TOKENS = 1_500

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

/** A manual page as text, with the links that stay on the manuals. The fetcher must be a tinker one, or the host is refused. */
export async function manualPage(f: Fetcher, url: string): Promise<Item> {
  const html = await f.text(url, { accept: 'text/html' })
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
