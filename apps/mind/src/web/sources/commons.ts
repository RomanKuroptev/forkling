import { isAllowed } from '../allowlist.ts'
import { cutToTokens, htmlToText } from '../clean.ts'
import { WebError, type Fetcher } from '../fetch.ts'
import { capLinks, normalizeLicence, wikipediaTopicLink, type Item, MAX_RECORD_LINKS } from '../item.ts'
import { pageTitle, wikiPath } from './mediawiki.ts'

const HOST = 'commons.wikimedia.org'
const PICTURE = /\.(jpe?g|png|gif|svg|tiff?|webp)$/i

/**
 * A Commons file page (`/wiki/File:<Name>`): the picture, its licence read from the licence name on the page (null when the
 * code cannot read an allowed one), the author, and the description. Pages with no picture (video, sound) are refused.
 */
export async function commonsFile(f: Fetcher, title: string): Promise<Item> {
  // Commons writes some underscores in its ids as `&#95;`.
  const html = (await f.text(`https://${HOST}/wiki/${wikiPath(title)}`, { accept: 'text/html' })).replace(/&#95;/g, '_')
  const href = /<div class="fullImageLink"[^>]*>\s*<a href="([^"]+)"/i.exec(html)?.[1]
  const url = href?.replace(/&amp;/g, '&').split('?')[0]
  if (!url || !isAllowed(url) || !PICTURE.test(url)) throw new WebError('http', `${title} has no picture`, 404)
  const heading = pageTitle(html, title)
  const licenceName = htmlToText(/class="licensetpl_short"[^>]*>([\s\S]*?)<\/span>/i.exec(html)?.[1] ?? '')
  const credit = htmlToText(/id="fileinfotpl_aut"[^>]*>[\s\S]*?<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/i.exec(html)?.[1] ?? '') || null
  const description = htmlToText(/<div class="description[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html)?.[1] ?? '')
  const bare = heading.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ')
  return {
    source: HOST,
    kind: 'record',
    tier: 'reference',
    url: `https://${HOST}/wiki/${wikiPath(heading)}`,
    title: heading,
    text: cutToTokens([`File: ${heading}`, description, `Licence: ${licenceName || 'unknown'}`, credit ? `Credit: ${credit}` : ''].filter(Boolean).join('\n')),
    links: capLinks([wikipediaTopicLink(bare)], MAX_RECORD_LINKS),
    images: [{ url, licence: normalizeLicence(licenceName), credit }],
  }
}

/** The pictures the Commons front page links to, leaving out video and sound. The seed picks which. */
export async function commonsFeatured(f: Fetcher, seed: number): Promise<Item> {
  const html = await f.text(`https://${HOST}/wiki/Main_Page`, { accept: 'text/html' })
  const files = [...new Set([...html.matchAll(/<a\s[^>]*?href="\/wiki\/(File:[^"#?]+)"/gi)].map((m) => decodeURIComponent(m[1]!).replace(/_/g, ' ')))].filter((t) => PICTURE.test(t))
  if (files.length === 0) throw new WebError('http', 'the Commons front page links to no pictures', 404)
  return commonsFile(f, files[((seed % files.length) + files.length) % files.length]!)
}
