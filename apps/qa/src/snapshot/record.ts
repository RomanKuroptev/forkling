import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { USER_AGENT } from '@forkling/mind/src/web/allowlist.ts'
import { createFetcher, type Fetcher, type FetchImpl, WebError } from '@forkling/mind/src/web/fetch.ts'
import type { Item, ItemLink } from '@forkling/mind/src/web/item.ts'
import { robotsAllows } from '@forkling/mind/src/web/robots.ts'
import { recordingFetch, type SnapshotEntry, type SnapshotManifest, itemsPerSource } from '@forkling/mind/src/web/snapshot.ts'
import {
  blueskyTopic,
  blueskyTrending,
  dwitterHotLinks,
  frontPageLinks,
  githubRisingRepos,
  githubTopicRepos,
  imgflipTopLinks,
  LEMMY_COMMUNITIES,
  lemmyMorningLinks,
  readUrl,
  RISING_TOPICS,
  weekBefore,
  wikipediaMorningLinks,
} from '@forkling/mind/src/web/sources/index.ts'
import { MANUAL_START, manualPage } from '@forkling/mind/src/web/sources/manuals.ts'
import { HOST_PLANS } from '@forkling/mind/src/web/starts.ts'
import type { SourceList } from '../sources/list.ts'

/**
 * Records the web snapshot (QB.4, `pnpm qa web-snapshot`): the engine's own source code reads what a morning offers (the
 * Wikipedia Main Page links, the Esolang front page, the Imgflip formats, the hot dweets, the creative-coding repositories and
 * the ones rising this week, the hot posts of Lemmy c/memes and c/showerthoughts, Bluesky's trending topics), each host's own
 * starting item (Commons, the Art Institute), the template pictures a look fetches on i.imgflip.com, the pages all those lead
 * to two steps further, and the library manuals. All through the engine's fetcher (allowlist, rates: lemmy.world is one
 * request a minute, so it is read alongside the rest), with robots.txt read first on each host and obeyed for every address.
 * It stops when the size budget is spent, so the snapshot stays small enough to commit.
 */

export interface RecordOptions {
  dir: string
  list: SourceList
  fetchImpl?: FetchImpl
  sleep?: (ms: number) => Promise<void>
  now?: () => Date
  engine: string
  /** Stop reading new pages past this many bytes kept. Default 25 MB. */
  maxBytes?: number
  /** `Authorization` headers per host (a GitHub token lifts its search limit). */
  authorization?: Record<string, string>
  log?: (line: string) => void
}

/** Pages kept per source, at most. The rest of the budget is shared. */
const MDN_START = 'https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API'
const PER_SOURCE: Record<string, number> = {
  wikipedia: 140,
  esolang: 60,
  // A repository is three answers (it, its README, its topic's list), and the rising searches are seven more.
  'github-creative-coding': 90,
  commons: 8,
  artic: 8,
  // The ranking and the template pictures.
  imgflip: 30,
  dwitter: 12,
  'lemmy-memes': 14,
  'bluesky-trending': 16,
}
const DEFAULT_PER_SOURCE = 3
/** Links followed from each page read, and how many steps from the pages a morning offers. */
const LINKS_PER_PAGE = 6
const STEPS = 2
const MORNING = { wikipedia: 4, memes: 6, github: 4, githubTopic: 'creative-coding', dweets: 4 }
/** Hot posts read per Lemmy community: the morning shows three, a trip goes on to its neighbours (each is a minute). */
const LEMMY_POSTS = 4
/** Bluesky topics read: the morning shows three, a topic links to the others. */
const BLUESKY_TOPICS = 12
/** Template pictures kept, from the top of the Imgflip ranking (the morning shows six, a format links to its neighbours). */
const IMGFLIP_PICTURES = 24
/**
 * The rising-this-week search names a date, so a run on another day asks another address. Its answer on the day of the
 * recording is kept for every day from a week before to this many days after, so a run on any of them sees this week's list.
 */
const RISING_DAYS_AFTER = 60
const RISING_DAYS_BEFORE = 7

/**
 * Addresses asked for every time, whatever the morning offers: the planted snapshot-misses test
 * (test/planted/behaviour-snapshot-misses.test.ts) needs a page the snapshot recorded as a real 404, and this Wikipedia
 * address (a guess from a meme format's name, before #401) is one.
 */
const PINNED = ['https://en.wikipedia.org/wiki/Drake_Hotline_Bling']
/** And pages never read: the same planted test uses them as real pages the snapshot never recorded (snapshot misses). */
export const NEVER_READ: ReadonlySet<string> = new Set(['https://en.wikipedia.org/wiki/Procopius', 'https://en.wikipedia.org/wiki/Fish_ladders', 'https://en.wikipedia.org/wiki/Two_Buttons', 'https://github.com/dy/jz'])

const addDays = (day: string, n: number): string => {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

export async function recordWebSnapshot(o: RecordOptions): Promise<SnapshotManifest> {
  const log = o.log ?? (() => undefined)
  const maxBytes = o.maxBytes ?? 25_000_000
  for (const p of ['files', 'manifest.json']) if (existsSync(join(o.dir, p))) rmSync(join(o.dir, p), { recursive: true, force: true })
  const sourceOf = (host: string) => o.list.sources.find((s) => s.hosts.includes(host))?.id ?? (host === 'github.com' ? 'github-creative-coding' : 'unknown')
  const rec = recordingFetch(o.fetchImpl ?? ((url, init) => fetch(url, init)), o.dir, sourceOf)
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const auth = o.authorization ? { authorization: o.authorization } : {}
  const plain = { wander: createFetcher({ fetchImpl: rec, verb: 'wander', sleep, ...auth }), tinker: createFetcher({ fetchImpl: rec, verb: 'tinker', sleep, ...auth }) }

  // robots.txt, once per host: a missing one sets no rules; one that cannot be read means the host is not read at all.
  const robots = new Map<string, Promise<string | null>>()
  const robotsFor = (f: Fetcher, host: string): Promise<string | null> => {
    if (!robots.has(host))
      robots.set(
        host,
        f.text(`https://${host}/robots.txt`).catch((e: unknown) => (e instanceof WebError && e.status === 404 ? '' : null)),
      )
    return robots.get(host)!
  }
  const guard = (f: Fetcher): Fetcher => {
    const check = async (url: string) => {
      const u = new URL(url)
      const txt = await robotsFor(f, u.hostname)
      if (txt === null || !robotsAllows(txt, `${u.pathname}${u.search}`)) throw new WebError('not-allowed', `robots.txt of ${u.hostname} does not allow ${u.pathname}`)
    }
    return {
      log: f.log,
      pausedHosts: () => f.pausedHosts(),
      text: async (url, opt) => (await check(url), f.text(url, opt)),
      json: async (url) => (await check(url), f.json(url)),
      bytes: async (url, opt) => (await check(url), f.bytes(url, opt)),
    }
  }
  const wander = guard(plain.wander)
  const tinker = guard(plain.tinker)

  const over = () => rec.bytes() > maxBytes
  const kept = (url: string) => itemsPerSource(rec.entries)[sourceOf(new URL(url).hostname)]?.items ?? 0
  const room = (url: string) => {
    try {
      return !over() && kept(url) < (PER_SOURCE[sourceOf(new URL(url).hostname)] ?? DEFAULT_PER_SOURCE)
    } catch {
      return false
    }
  }
  const soft = async <T>(what: string, fn: () => Promise<T>): Promise<T | null> => {
    if (over()) return null
    try {
      return await fn()
    } catch (e) {
      log(`${what}: ${e instanceof Error ? e.message : String(e)}`)
      return null
    }
  }
  const readPage = async (url: string): Promise<Item> => {
    if (NEVER_READ.has(url)) throw new WebError('not-allowed', `${url} is kept out of the snapshot (a planted snapshot miss)`)
    return readUrl(wander, url)
  }
  const repoLinks = (names: string[] | null): ItemLink[] => (names ?? []).map((name) => ({ title: name, url: `https://github.com/${name}` }))

  // 1. What a morning offers, as the engine reads it.
  const takenOn = (o.now ?? (() => new Date()))().toISOString().slice(0, 10)
  const starts: ItemLink[] = [
    ...((await soft('Wikipedia Main Page', () => wikipediaMorningLinks(wander, MORNING.wikipedia))) ?? []),
    ...((await soft('Esolang front page', () => frontPageLinks(wander, 'esolangs.org'))) ?? []),
    ...((await soft('Imgflip formats', () => imgflipTopLinks(wander, MORNING.memes))) ?? []),
    ...((await soft('Dwitter hot list', () => dwitterHotLinks(wander, MORNING.dweets))) ?? []),
    ...repoLinks(await soft('GitHub topic', () => githubTopicRepos(wander, MORNING.githubTopic, MORNING.github))),
  ]
  // Every rising topic (a morning draws two by its seed and the day), each one search.
  const risingUrls: string[] = []
  for (const topic of RISING_TOPICS) {
    const before = new Set(rec.entries.map((e) => e.url))
    starts.push(...repoLinks(await soft(`GitHub rising ${topic}`, () => githubRisingRepos(wander, topic, takenOn, MORNING.github))))
    risingUrls.push(...rec.entries.filter((e) => !before.has(e.url) && e.file && e.url.includes('created:')).map((e) => e.url))
  }

  for (const url of PINNED) await soft(url, () => wander.text(url))

  // Lemmy is one request a minute: its morning lists and hot posts are read while the rest goes on.
  const lemmy = (async () => {
    const posts: Item[] = []
    for (const community of LEMMY_COMMUNITIES) {
      const links = (await soft(`Lemmy c/${community}`, () => lemmyMorningLinks(wander, community, LEMMY_POSTS))) ?? []
      for (const link of links) {
        if (!room(link.url)) continue
        const item = await soft(link.url, () => readPage(link.url))
        if (item) posts.push(item)
      }
    }
    log(`Lemmy: ${posts.length} hot posts`)
    return posts
  })()

  const read: Item[] = []
  // 2. Bluesky's trending topics (the news rule leaves some out), each topic's feed.
  const topics = (await soft('Bluesky trending', () => blueskyTrending(wander))) ?? []
  for (const t of topics.slice(0, BLUESKY_TOPICS)) {
    if (over()) break
    const item = await soft(t.url, () => blueskyTopic(wander, t.url, topics))
    if (item) read.push(item)
  }
  // 3. The template pictures a look fetches, from the top of the ranking the morning read.
  const ranking = rec.entries.find((e) => e.url === 'https://api.imgflip.com/get_memes' && e.file)
  const formats = ranking ? ((JSON.parse(readFileSync(join(o.dir, ranking.file!), 'utf8')) as { data?: { memes?: { url?: unknown }[] } }).data?.memes ?? []) : []
  for (const m of formats.slice(0, IMGFLIP_PICTURES)) {
    if (typeof m?.url !== 'string' || !m.url.startsWith('https://i.imgflip.com/') || !room(m.url)) continue
    const url = m.url
    await soft(url, () => wander.bytes(url))
  }
  // 4. Each host's own starting item (the trials' plans), which is how Commons and the Art Institute are reached. Lemmy and
  // Bluesky are read above.
  for (const plan of HOST_PLANS) {
    if (over()) break
    if (plan.host === 'lemmy.world' || plan.host === 'public.api.bsky.app') continue
    const item = await soft(`${plan.host} start`, () => plan.start(wander, 0, 0))
    if (item) read.push(item)
  }
  // 5. The morning's pages, every one of them.
  const asked = new Set<string>()
  for (const link of starts) {
    if (over() || asked.has(link.url)) continue
    asked.add(link.url)
    const item = await soft(link.url, () => readPage(link.url))
    if (item) read.push(item)
  }
  // 6. The library manuals (tinker reads them), and a page of MDN they link to: small, so before the budget goes on step 7.
  const manuals: Item[] = []
  for (const url of Object.values(MANUAL_START)) {
    if (!room(url)) continue
    const page = await soft(url, () => manualPage(tinker, url))
    if (page) manuals.push(page)
  }
  // No manual front page links to MDN today, so its Canvas page (what a sketch draws with) stands in.
  const mdn = manuals.flatMap((m) => m.links).find((l) => l.url.startsWith('https://developer.mozilla.org/'))?.url ?? MDN_START
  if (room(mdn)) await soft(mdn, () => manualPage(tinker, mdn))
  // 7. Further from every page read, a few links each, step by step, while the budget lasts.
  read.push(...(await lemmy))
  let frontier = read
  for (let step = 0; step < STEPS && !over(); step++) {
    const next: Item[] = []
    for (const item of frontier) {
      for (const link of item.links.slice(0, LINKS_PER_PAGE)) {
        if (asked.has(link.url) || !room(link.url)) continue
        asked.add(link.url)
        const got = await soft(link.url, () => readPage(link.url))
        if (got) next.push(got)
      }
    }
    frontier = next
  }

  // The rising searches, answered for the days a run may ask them on (copies of the one answer, not more items).
  const copies: SnapshotEntry[] = []
  const recorded = new Set(rec.entries.map((e) => e.url))
  for (const url of risingUrls) {
    const e = rec.entries.find((x) => x.url === url)!
    for (let d = -RISING_DAYS_BEFORE; d <= RISING_DAYS_AFTER; d++) {
      const other = url.replace(`created:%3E${weekBefore(takenOn)}`, `created:%3E${weekBefore(addDays(takenOn, d))}`)
      if (recorded.has(other)) continue
      recorded.add(other)
      copies.push({ ...e, url: other })
    }
  }
  // Items count what was read, not the copies.
  const out: SnapshotManifest = { version: 1, takenAt: (o.now ?? (() => new Date()))().toISOString(), engine: o.engine, userAgent: USER_AGENT, entries: [...rec.entries, ...copies], sources: itemsPerSource(rec.entries) }
  writeFileSync(join(o.dir, 'manifest.json'), `${JSON.stringify(out, null, 2)}\n`)
  log(`kept ${rec.entries.filter((e) => e.file).length} answers, ${(rec.bytes() / 1e6).toFixed(2)} MB; items per source: ${Object.entries(out.sources).map(([s, v]) => `${s} ${v.items}`).join(', ')}`)
  return out
}
