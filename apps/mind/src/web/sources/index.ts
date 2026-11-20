import { isReadable } from '../allowlist.ts'
import { WebError, type Fetcher } from '../fetch.ts'
import type { Item } from '../item.ts'
import { commonsFile } from './commons.ts'
import { imgflipNewFormat } from './imgflip-new.ts'
import { articWork, githubRepo, imgflipFormat } from './records.ts'
import { esolangPage, wikipediaArticle } from './wikipedia.ts'

export * from './commons.ts'
export * from './imgflip-new.ts'
export * from './mediawiki.ts'
export * from './records.ts'
export * from './wikipedia.ts'

const decode = (segment: string) => decodeURIComponent(segment).replace(/_/g, ' ')

/**
 * Turns a link Merge chose into an item, with the adapter for its host. A URL that is not on the allowlist is refused here,
 * before anything is asked of the network. A host with no adapter is refused rather than guessed at.
 */
export async function readUrl(f: Fetcher, url: string): Promise<Item> {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    throw new WebError('not-allowed', `${url} is not a URL`)
  }
  if (!isReadable(url)) throw new WebError('not-allowed', `${url} is not on the allowlist`)
  const parts = u.pathname.split('/').filter(Boolean)
  const nothing = () => new WebError('not-allowed', `no adapter reads ${url}`)

  switch (u.hostname) {
    case 'en.wikipedia.org':
      if (parts[0] === 'wiki' && parts[1]) return wikipediaArticle(f, decode(parts.slice(1).join('/')))
      throw nothing()
    case 'esolangs.org':
      if (parts[0] === 'wiki' && parts[1]) return esolangPage(f, decode(parts.slice(1).join('/')))
      throw nothing()
    case 'www.artic.edu':
      if (parts[0] === 'artworks' && parts[1] && /^\d+$/.test(parts[1])) return articWork(f, parts[1])
      throw nothing()
    case 'github.com':
      if (parts.length === 2) return githubRepo(f, `${parts[0]}/${parts[1]}`)
      throw nothing()
    case 'imgflip.com':
      // A format in the 30-day ranking, else a new one on the Top New page (`/memetemplates` itself is never a page to read).
      if (parts.length === 2 && parts[0] === 'meme' && parts[1] && /^\d+$/.test(parts[1])) {
        const id = parts[1]
        try {
          return await imgflipFormat(f, id)
        } catch (error) {
          if (error instanceof WebError && error.status === 404) return imgflipNewFormat(f, id)
          throw error
        }
      }
      throw nothing()
    case 'commons.wikimedia.org':
      if (parts[0] === 'wiki' && parts[1]?.startsWith('File:')) return commonsFile(f, decode(parts.slice(1).join('/')))
      throw nothing()
    default:
      throw nothing()
  }
}
