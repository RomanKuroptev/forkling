import { isReadable } from '../allowlist.ts'
import { WebError, type Fetcher } from '../fetch.ts'
import type { Item } from '../item.ts'
import { MANUAL_HOSTS, manualPage } from './manuals.ts'
import { apod, articWork, commonsFile, githubRepo, imgflipFormat } from './records.ts'
import { hackerNewsStory } from './voices.ts'
import { esolangPage, wikipediaArticle, wikipediaSearch } from './wikipedia.ts'

export * from './manuals.ts'
export * from './records.ts'
export * from './voices.ts'
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
    case 'en.wikipedia.org': {
      if (parts[0] === 'wiki' && parts[1]) return wikipediaArticle(f, decode(parts.slice(1).join('/')))
      const search = u.searchParams.get('search')
      if (u.pathname === '/w/index.php' && search) {
        const found = await wikipediaSearch(f, search)
        if (!found) throw new WebError('http', `Wikipedia has nothing for "${search}"`, 404)
        return found
      }
      throw nothing()
    }
    case 'esolangs.org':
      if (parts[0] === 'wiki' && parts[1]) return esolangPage(f, decode(parts.slice(1).join('/')))
      throw nothing()
    case 'news.ycombinator.com': {
      const id = u.searchParams.get('id')
      if (u.pathname === '/item' && id && /^\d+$/.test(id)) return hackerNewsStory(f, id)
      throw nothing()
    }
    case 'imgflip.com':
      if (parts[0] === 'meme' && parts[1]) return imgflipFormat(f, parts[1])
      throw nothing()
    case 'www.artic.edu':
      if (parts[0] === 'artworks' && parts[1] && /^\d+$/.test(parts[1])) return articWork(f, parts[1])
      throw nothing()
    case 'apod.nasa.gov': {
      const m = /^ap(\d{2})(\d{2})(\d{2})\.html$/.exec(parts[1] ?? '')
      if (parts[0] === 'apod' && m) return apod(f, `20${m[1]}-${m[2]}-${m[3]}`)
      throw nothing()
    }
    case 'github.com':
      if (parts.length === 2) return githubRepo(f, `${parts[0]}/${parts[1]}`)
      throw nothing()
    case 'commons.wikimedia.org':
      if (parts[0] === 'wiki' && parts[1]?.startsWith('File:')) return commonsFile(f, decode(parts.slice(1).join('/')))
      throw nothing()
    default:
      if ((MANUAL_HOSTS as readonly string[]).includes(u.hostname)) return manualPage(f, url)
      throw nothing()
  }
}
