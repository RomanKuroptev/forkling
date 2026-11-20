import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { USER_AGENT } from '@forkling/mind/src/web/allowlist.ts'
import { createFetcher, type Fetcher, type FetchImpl, WebError } from '@forkling/mind/src/web/fetch.ts'
import type { Item } from '@forkling/mind/src/web/item.ts'
import { robotsAllows } from '@forkling/mind/src/web/robots.ts'
import { recordingFetch, type SnapshotManifest, writeManifest, itemsPerSource } from '@forkling/mind/src/web/snapshot.ts'
import { dwitterHotLinks, frontPageLinks, githubTopicRepos, imgflipTopLinks, readUrl, wikipediaMorningLinks } from '@forkling/mind/src/web/sources/index.ts'
import { MANUAL_START, manualPage } from '@forkling/mind/src/web/sources/manuals.ts'
import { HOST_PLANS } from '@forkling/mind/src/web/starts.ts'
import type { SourceList } from '../sources/list.ts'

/**
 * Records the web snapshot (QB.4, `pnpm qa web-snapshot`): the engine's own source code reads what a morning offers (the
 * Wikipedia Main Page links, the Esolang front page, the Imgflip formats, the creative-coding repositories), each host's own
 * starting item (Commons, the Art Institute), the pages those lead to one step further, and the library manuals. All through
 * the engine's fetcher (allowlist, rates), with robots.txt read first on each host and obeyed for every address. It stops
 * when the size budget is spent, so the snapshot stays small enough to commit.
 */

export interface RecordOptions {
  dir: string
  list: SourceList
  fetchImpl?: FetchImpl
  sleep?: (ms: number) => Promise<void>
  now?: () => Date
  engine: string
  /** Stop reading new pages past this many bytes kept. Default about 4.5 MB. */
  maxBytes?: number
  log?: (line: string) => void
}

/** Pages kept per source, at most. The rest of the budget is shared. */
const MDN_START = 'https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API'
const PER_SOURCE: Record<string, number> = { wikipedia: 24, esolang: 14, 'github-creative-coding': 8, commons: 4, artic: 4 }
const DEFAULT_PER_SOURCE = 3
/** Links followed from each page read, one step deep. */
const LINKS_PER_PAGE = 3
const MORNING = { wikipedia: 4, memes: 6, github: 4, githubTopic: 'creative-coding', dweets: 4 }

export async function recordWebSnapshot(o: RecordOptions): Promise<SnapshotManifest> {
  const log = o.log ?? (() => undefined)
  const maxBytes = o.maxBytes ?? 4_500_000
  for (const p of ['files', 'manifest.json']) if (existsSync(join(o.dir, p))) rmSync(join(o.dir, p), { recursive: true, force: true })
  const sourceOf = (host: string) => o.list.sources.find((s) => s.hosts.includes(host))?.id ?? (host === 'github.com' ? 'github-creative-coding' : 'unknown')
  const rec = recordingFetch(o.fetchImpl ?? ((url, init) => fetch(url, init)), o.dir, sourceOf)
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const plain = { wander: createFetcher({ fetchImpl: rec, verb: 'wander', sleep }), tinker: createFetcher({ fetchImpl: rec, verb: 'tinker', sleep }) }

  // robots.txt, once per host: a missing one sets no rules; one that cannot be read means the host is not read at all.
  const robots = new Map<string, string | null>()
  const robotsFor = async (f: Fetcher, host: string): Promise<string | null> => {
    if (!robots.has(host)) {
      try {
        robots.set(host, await f.text(`https://${host}/robots.txt`))
      } catch (e) {
        robots.set(host, e instanceof WebError && e.status === 404 ? '' : null)
      }
    }
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
    try {
      return await fn()
    } catch (e) {
      log(`${what}: ${e instanceof Error ? e.message : String(e)}`)
      return null
    }
  }

  // 1. What a morning offers, as the engine reads it.
  const starts = [
    ...((await soft('Wikipedia Main Page', () => wikipediaMorningLinks(wander, MORNING.wikipedia))) ?? []),
    ...((await soft('Esolang front page', () => frontPageLinks(wander, 'esolangs.org'))) ?? []),
    ...((await soft('Imgflip formats', () => imgflipTopLinks(wander, MORNING.memes))) ?? []),
    ...((await soft('Dwitter hot list', () => dwitterHotLinks(wander, MORNING.dweets))) ?? []),
    ...((await soft('GitHub topic', async () => (await githubTopicRepos(wander, MORNING.githubTopic, MORNING.github)).map((name) => ({ title: name, url: `https://github.com/${name}` })))) ?? []),
  ]
  // 2. Each host's own starting item (the trials' plans), which is how Commons and the Art Institute are reached.
  const read: Item[] = []
  for (const plan of HOST_PLANS) {
    if (over()) break
    const item = await soft(`${plan.host} start`, () => plan.start(wander, 0, 0))
    if (item) read.push(item)
  }
  // 3. The morning's pages, then one step further.
  for (const link of starts) {
    if (!room(link.url)) continue
    const item = await soft(link.url, () => readUrl(wander, link.url))
    if (item) read.push(item)
  }
  // 4. The library manuals (tinker reads them), and a page of MDN they link to: small, so before the budget goes on step 5.
  const manuals: Item[] = []
  for (const url of Object.values(MANUAL_START)) {
    if (!room(url)) continue
    const page = await soft(url, () => manualPage(tinker, url))
    if (page) manuals.push(page)
  }
  // No manual front page links to MDN today, so its Canvas page (what a sketch draws with) stands in.
  const mdn = manuals.flatMap((m) => m.links).find((l) => l.url.startsWith('https://developer.mozilla.org/'))?.url ?? MDN_START
  if (room(mdn)) await soft(mdn, () => manualPage(tinker, mdn))
  // 5. One step further from every page read, a few links each, while the budget lasts.
  for (const item of [...read]) {
    for (const link of item.links.slice(0, LINKS_PER_PAGE)) {
      if (!room(link.url)) continue
      await soft(link.url, () => readUrl(wander, link.url))
    }
  }

  const manifest = writeManifest(o.dir, { takenAt: (o.now ?? (() => new Date()))().toISOString(), engine: o.engine, userAgent: USER_AGENT, entries: rec.entries })
  log(`kept ${rec.entries.filter((e) => e.file).length} answers, ${(rec.bytes() / 1e6).toFixed(2)} MB; items per source: ${Object.entries(manifest.sources).map(([s, v]) => `${s} ${v.items}`).join(', ')}`)
  return manifest
}
