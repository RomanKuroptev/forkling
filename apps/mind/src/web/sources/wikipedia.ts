import { WebError, type Fetcher } from '../fetch.ts'
import type { Item, ItemLink } from '../item.ts'
import { frontPageLinks, mediawikiPage, topicTitle } from './mediawiki.ts'

const at = <T>(xs: readonly T[], n: number): T => xs[((n % xs.length) + xs.length) % xs.length]!

/** An English Wikipedia article, read from `/wiki/<Title>`. */
export const wikipediaArticle = (f: Fetcher, title: string): Promise<Item> => mediawikiPage(f, 'en.wikipedia.org', title)

/** The page for a topic, or null when Wikipedia has no page of that name. A trip that starts from a topic goes straight to it. */
export async function wikipediaSearch(f: Fetcher, topic: string): Promise<Item | null> {
  try {
    return await wikipediaArticle(f, topicTitle(topic))
  } catch (error) {
    if (error instanceof WebError && error.code === 'http' && error.status === 404) return null
    throw error
  }
}

async function pick(f: Fetcher, host: string, seed: number): Promise<ItemLink> {
  const links = await frontPageLinks(f, host)
  if (links.length === 0) throw new WebError('http', `${host} front page offers no pages`, 404)
  return at(links, seed)
}

/** An article the front page links to (today's featured article, the news, "did you know"): the seed picks which. */
export async function wikipediaFeatured(f: Fetcher, seed: number): Promise<Item> {
  const link = await pick(f, 'en.wikipedia.org', seed)
  return wikipediaArticle(f, decodeURIComponent(new URL(link.url).pathname.replace(/^\/wiki\//, '')).replace(/_/g, ' '))
}

/** An Esolang wiki page, read from `/wiki/<Title>`. */
export const esolangPage = (f: Fetcher, title: string): Promise<Item> => mediawikiPage(f, 'esolangs.org', title)

/** The pages the Esolang front page links to. */
export const esolangMainLinks = (f: Fetcher): Promise<ItemLink[]> => frontPageLinks(f, 'esolangs.org')

/** A language the Esolang front page links to: the seed picks which. */
export async function esolangFeatured(f: Fetcher, seed: number): Promise<Item> {
  const link = await pick(f, 'esolangs.org', seed)
  return esolangPage(f, decodeURIComponent(new URL(link.url).pathname.replace(/^\/wiki\//, '')).replace(/_/g, ' '))
}
