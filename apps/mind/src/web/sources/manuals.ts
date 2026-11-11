import type { Fetcher } from '../fetch.ts'
import { cutToTokens, htmlToText } from '../clean.ts'
import { capLinks, type Item, type ItemLink } from '../item.ts'

/** The library manuals of spec 6.1. */
export const MANUAL_HOSTS = ['p5js.org', 'tonejs.github.io', 'threejs.org', 'developer.mozilla.org'] as const

/** Links in a page's HTML, resolved against the page. Only allowed ones survive `capLinks`; the page itself is left out. */
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

/** A manual page as text, with the links that stay on allowed sites. Merge reads the manual for the tool it is using. */
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
    links: capLinks(linksOf(html, url)),
    images: [],
  }
}
