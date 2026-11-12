import type { Fetcher } from './fetch.ts'
import type { Item } from './item.ts'
import { articRandomId, articWork, commonsFeatured, esolangFeatured, githubRepo, githubTopicRepos, imgflipFormat, imgflipTopLinks, wikipediaFeatured } from './sources/index.ts'

/** How a trial starts on a host: from what the host itself puts forward, never a topic picked here (spec 6.5). */
export interface HostPlan {
  /** The host as listed in `allowlist.ts`. */
  host: string
  /** The host of the item URLs it gives, when they differ (a GitHub repository is `github.com`). */
  itemHost: string
  /** Paths the engine fetches there, checked against robots.txt. */
  paths: string[]
  /** A feed host (spec 6.1): it only offers starting points, so the trial does not mark what a read keeps or how interesting it was. */
  feed?: boolean
  /** Seed number to a starting item. `offset` gives a different mix on another run. */
  start(f: Fetcher, seed: number, offset: number): Promise<Item>
}

const at = <T>(xs: readonly T[], n: number): T => xs[((n % xs.length) + xs.length) % xs.length]!

const GITHUB_TOPICS = ['creative-coding', 'generative-art', 'demoscene']

export const HOST_PLANS: readonly HostPlan[] = [
  { host: 'en.wikipedia.org', itemHost: 'en.wikipedia.org', paths: ['/wiki/Main_Page', '/wiki/Lighthouse'], start: (f, seed, offset) => wikipediaFeatured(f, offset + seed) },
  { host: 'esolangs.org', itemHost: 'esolangs.org', paths: ['/wiki/Main_Page', '/wiki/Brainfuck'], start: (f, seed, offset) => esolangFeatured(f, offset + seed) },
  { host: 'commons.wikimedia.org', itemHost: 'commons.wikimedia.org', paths: ['/wiki/Main_Page', '/wiki/File:Example.jpg'], start: (f, seed, offset) => commonsFeatured(f, offset + seed) },
  {
    host: 'api.github.com',
    itemHost: 'github.com',
    paths: ['/repos/', '/search/repositories'],
    start: async (f, seed, offset) => githubRepo(f, at(await githubTopicRepos(f, at(GITHUB_TOPICS, seed)), offset + Math.floor(seed / GITHUB_TOPICS.length))),
  },
  {
    host: 'api.imgflip.com',
    itemHost: 'imgflip.com',
    paths: ['/get_memes'],
    feed: true,
    start: async (f, seed, offset) => imgflipFormat(f, at(await imgflipTopLinks(f, 100), offset + seed).url.split('/').pop()!),
  },
  { host: 'api.artic.edu', itemHost: 'www.artic.edu', paths: ['/api/v1/artworks/'], start: async (f, seed, offset) => articWork(f, await articRandomId(f, 1 + ((offset * 97 + seed * 331) % 900))) },
]

export const planFor = (host: string): HostPlan | undefined => HOST_PLANS.find((p) => p.host === host || p.itemHost === host)
