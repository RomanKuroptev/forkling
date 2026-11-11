import { isAllowed } from '../allowlist.ts'
import { cutToTokens, htmlToText } from '../clean.ts'
import type { Fetcher } from '../fetch.ts'
import { capLinks, MAX_IMAGES, type Item, type ItemImage, type ItemLink } from '../item.ts'

/**
 * Reading a MediaWiki site (Wikipedia, the Esolang wiki, Commons) through the pages a visitor reads, `/wiki/<Title>`. Their
 * robots.txt files allow those pages and disallow the API paths, so the engine reads the page and cleans it itself.
 */

/** The path of a page: spaces as underscores, and only what a URL must escape. */
export function wikiPath(title: string): string {
  return encodeURIComponent(title.trim().replace(/ /g, '_')).replace(/%3A/gi, ':')
}

/** A topic as a page title: its first letter in capitals, the rest as it was typed. */
export function topicTitle(topic: string): string {
  const t = topic.trim().replace(/\s+/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** Furniture and notes that are not the article: removed with everything inside them. */
const FURNITURE = /\b(navbox|navbox-inner|vertical-navbox|sidebar|reflist|mw-references-wrap|references|toc|mw-editsection|reference|noprint|metadata|ambox|catlinks|printfooter|mw-empty-elt|mw-jump-link|sistersitebox|mw-cite-backlink)\b/

/** The index just past the closing tag that matches an opening tag that ended at `from`. */
function closeOf(html: string, tag: string, from: number): number {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi')
  re.lastIndex = from
  let depth = 1
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1
    if (depth === 0) return m.index + m[0].length
  }
  return html.length
}

/** Removes every element whose class says it is furniture, with its children. */
export function stripFurniture(html: string): string {
  const open = /<(div|ol|ul|span|sup|table|style|figure|section|aside)\b[^>]*?\bclass="([^"]*)"[^>]*>/gi
  let out = ''
  let pos = 0
  for (let m = open.exec(html); m; m = open.exec(html)) {
    if (!FURNITURE.test(m[2]!)) continue
    const end = closeOf(html, m[1]!.toLowerCase(), m.index + m[0].length)
    out += html.slice(pos, m.index)
    pos = end
    open.lastIndex = end
  }
  return out + html.slice(pos)
}

const NAMESPACE = /^(file|image|category|special|help|wikipedia|wp|template|talk|user|portal|draft|module|mediawiki|media|commons|esolang|topic|book)(_talk)?:/i

/** The article body: from the content div to the print footer, furniture removed, cut before the notes and references. */
export function articleHtml(html: string): string {
  const start = html.search(/<div id="mw-content-text"/)
  let body = start >= 0 ? html.slice(start) : html
  const end = body.search(/<div class="printfooter"|<div id="catlinks"|<footer/)
  if (end >= 0) body = body.slice(0, end)
  body = stripFurniture(body)
  const cut = body.search(/<h2[^>]*\bid="(See_also|Notes|Footnotes|References|Further_reading|External_links|Bibliography|Sources|Citations)"/)
  return cut >= 0 ? body.slice(0, cut) : body
}

/** The heading of a page, or the part of the `<title>` before the site name. */
export function pageTitle(html: string, fallback: string): string {
  const h1 = /<h1[^>]*\bid="firstHeading"[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]
  if (h1) return htmlToText(h1) || fallback
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]
  return t ? htmlToText(t).replace(/\s+[-–|]\s+[^-–|]*$/, '') || fallback : fallback
}

/** The links to other pages of the site in some HTML, in order and each once, with namespaces, fragments and edit links left out. */
export function wikiLinks(html: string, host: string, not: string): ItemLink[] {
  const links: ItemLink[] = []
  const self = not.trim().toLowerCase()
  for (const m of html.matchAll(/<a\s[^>]*?href="\/wiki\/([^"#?]+)(?:#[^"]*)?"[^>]*>/gi)) {
    const path = m[1]!
    let title: string
    try {
      title = decodeURIComponent(path).replace(/_/g, ' ')
    } catch {
      continue
    }
    if (NAMESPACE.test(title) || title.toLowerCase() === self) continue
    links.push({ title, url: `https://${host}/wiki/${path}` })
  }
  return links
}

/** The pictures of an article that sit on a host the engine knows, at the address a browser would use, without tracking parameters. */
export function wikiImages(html: string): ItemImage[] {
  const found: ItemImage[] = []
  for (const m of html.matchAll(/<img\b[^>]*\bsrc="(?:https:)?\/\/(?:thumb|upload)\.wikimedia\.org\/(wikipedia\/[^"?]+)[^"]*"/gi)) {
    const url = `https://upload.wikimedia.org/${m[1]}`
    if (/\/(static|Commons-logo|OOjs)|Icon|Question_book/i.test(url) || found.some((i) => i.url === url) || !isAllowed(url)) continue
    found.push({ url, licence: null, credit: null })
    if (found.length === MAX_IMAGES) break
  }
  return found
}

/** One page of a MediaWiki site as an item: its text, up to 40 links to other pages, and its pictures. */
export async function mediawikiPage(f: Fetcher, host: string, title: string): Promise<Item> {
  const html = await f.text(`https://${host}/wiki/${wikiPath(title)}`, { accept: 'text/html' })
  const heading = pageTitle(html, title)
  const body = articleHtml(html)
  return {
    source: host,
    kind: 'page',
    tier: 'reference',
    url: `https://${host}/wiki/${wikiPath(heading)}`,
    title: heading,
    text: cutToTokens(htmlToText(body)),
    links: capLinks(wikiLinks(body, host, heading)),
    images: wikiImages(body),
  }
}

/** The article links on a site's front page: where a trip may start when nothing else asks. Never random, never a topic picked here. */
export async function frontPageLinks(f: Fetcher, host: string): Promise<ItemLink[]> {
  const html = await f.text(`https://${host}/wiki/Main_Page`, { accept: 'text/html' })
  return capLinks(wikiLinks(articleHtml(html), host, 'Main Page'))
}
