import { createPrng } from '@forkling/sim'
import type { Fetcher } from './fetch.ts'
import type { Item } from './item.ts'
import {
  apod, articRandomId, articWork, commonsFile, esolangRandom, githubRepo, githubTopicRepos, hackerNewsIds, hackerNewsStory, imgflipFormat, imgflipIds,
  manualPage, wikipediaRandom,
} from './sources/index.ts'

/** How a trial starts on a host: random or featured items, never a topic picked here (spec 6.5). */
export interface HostPlan {
  /** The host as listed in `allowlist.ts`. */
  host: string
  /** The host of the item URLs it gives, when they differ (a Hacker News story is `news.ycombinator.com`). */
  itemHost: string
  /** Paths the engine fetches there, checked against robots.txt. */
  paths: string[]
  /** Seed number to a starting item. `offset` gives a different mix on another run. */
  start(f: Fetcher, seed: number, offset: number): Promise<Item>
}

const at = <T>(xs: readonly T[], n: number): T => xs[((n % xs.length) + xs.length) % xs.length]!

/** Entry pages of the library manuals, from each site's own front door. */
const MANUAL_ENTRIES: Record<string, string[]> = {
  'p5js.org': ['https://p5js.org/reference/', 'https://p5js.org/tutorials/', 'https://p5js.org/examples/'],
  'tonejs.github.io': ['https://tonejs.github.io/docs/', 'https://tonejs.github.io/'],
  'threejs.org': ['https://threejs.org/docs/', 'https://threejs.org/manual/', 'https://threejs.org/examples/'],
  'developer.mozilla.org': [
    'https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API',
    'https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API',
    'https://developer.mozilla.org/en-US/docs/Web/CSS',
    'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
  ],
}

const manual = (host: string): HostPlan => ({
  host,
  itemHost: host,
  paths: ['/'],
  start: (f, seed, offset) => manualPage(f, at(MANUAL_ENTRIES[host]!, seed + offset)),
})

const GITHUB_TOPICS = ['creative-coding', 'generative-art', 'demoscene']
const APOD_FIRST = Date.UTC(2015, 0, 1)

export const HOST_PLANS: readonly HostPlan[] = [
  { host: 'en.wikipedia.org', itemHost: 'en.wikipedia.org', paths: ['/w/api.php', '/wiki/', '/w/rest.php/', '/api/rest_v1/'], start: (f) => wikipediaRandom(f) },
  { host: 'esolangs.org', itemHost: 'esolangs.org', paths: ['/w/api.php', '/wiki/'], start: (f) => esolangRandom(f) },
  manual('p5js.org'),
  manual('tonejs.github.io'),
  manual('threejs.org'),
  manual('developer.mozilla.org'),
  {
    host: 'hacker-news.firebaseio.com',
    itemHost: 'news.ycombinator.com',
    paths: ['/v0/'],
    start: async (f, seed, offset) => {
      const ids = await hackerNewsIds(f, seed % 2 === 0 ? 'showstories' : 'topstories')
      return hackerNewsStory(f, at(ids, offset + Math.floor(seed / 2) * 3))
    },
  },
  {
    host: 'api.github.com',
    itemHost: 'github.com',
    paths: ['/repos/', '/search/repositories'],
    start: async (f, seed, offset) => githubRepo(f, at(await githubTopicRepos(f, at(GITHUB_TOPICS, seed)), offset + Math.floor(seed / GITHUB_TOPICS.length))),
  },
  { host: 'api.imgflip.com', itemHost: 'imgflip.com', paths: ['/get_memes'], start: async (f, seed, offset) => imgflipFormat(f, at(await imgflipIds(f), offset * 7 + seed * 13)) },
  {
    host: 'commons.wikimedia.org',
    itemHost: 'commons.wikimedia.org',
    paths: ['/w/api.php'],
    start: async (f) => {
      const r = (await f.json('https://commons.wikimedia.org/w/api.php?action=query&format=json&list=random&rnnamespace=6&rnlimit=1')) as any
      return commonsFile(f, r.query.random[0].title)
    },
  },
  { host: 'api.artic.edu', itemHost: 'www.artic.edu', paths: ['/api/v1/artworks/'], start: async (f, seed, offset) => articWork(f, await articRandomId(f, 1 + ((offset * 97 + seed * 331) % 900))) },
  {
    host: 'api.nasa.gov',
    itemHost: 'apod.nasa.gov',
    paths: ['/planetary/apod'],
    start: (f, seed, offset) => {
      const days = Math.floor((Date.now() - APOD_FIRST) / 86_400_000) - 2
      const day = Math.floor(createPrng(offset * 1000 + seed + 1).next() * days)
      return apod(f, new Date(APOD_FIRST + day * 86_400_000).toISOString().slice(0, 10))
    },
  },
]

export const planFor = (host: string): HostPlan | undefined => HOST_PLANS.find((p) => p.host === host || p.itemHost === host)
