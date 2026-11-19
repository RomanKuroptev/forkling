import { newSince } from '@forkling/sim'
import type { ReadVerb } from '@forkling/mind/src/web/allowlist.ts'
import { wordCount } from '@forkling/mind/src/web/clean.ts'
import { createFetcher, type FetchImpl, type Fetcher } from '@forkling/mind/src/web/fetch.ts'
import type { Item } from '@forkling/mind/src/web/item.ts'
import { checkRobots } from '@forkling/mind/src/web/robots.ts'
import { MANUAL_START, manualPage } from '@forkling/mind/src/web/sources/manuals.ts'
import { frontPageLinks, githubTopicRepos, imgflipTopLinks, wikipediaArticle, wikipediaMorningLinks } from '@forkling/mind/src/web/sources/index.ts'
import { HOST_PLANS } from '@forkling/mind/src/web/starts.ts'
import { DID_NOT_RUN, type CheckResult } from '../report/finding.ts'
import type { SourceList } from '../sources/list.ts'

// Source health (audit spec 9.4, steps QS.2): the real fetch code against the real hosts, read only. robots.txt first, the
// allowlist only (createFetcher refuses anything else), each host's normal gap between requests. Only `pnpm qa live` and
// qa-live.yml run this against the network; tests give it a recorded web.

// The morning's numbers (apps/mind/src/tick/wander.ts): what a morning takes from each source.
const WIKIPEDIA_POINTS = 4
const ESOLANG_POINTS = 6
const GITHUB_TOPIC = 'creative-coding'
const GITHUB_POINTS = 4
const MEME_POINTS = 6
// Imgflip's ranking is 100 long; freshness compares all of it.
const IMGFLIP_ALL = 100
const SAMPLE_WORDS = 120

type ProbeResult = { items: number; sample?: Item; imgflipIds?: string[] }

export interface Probe {
  /** The id in qa/sources.json. */
  source: string
  host: string
  verb: ReadVerb
  /** What the engine fetches there, checked against robots.txt. */
  paths: readonly string[]
  /** The fewest items a working source gives. */
  min: number
  /** What is counted, in plain words. */
  counts: string
  read: (f: Fetcher, seed: number) => Promise<ProbeResult>
}

const planPaths = (host: string): readonly string[] => HOST_PLANS.find((p) => p.host === host)?.paths ?? ['/']
const planStart = (host: string) => HOST_PLANS.find((p) => p.host === host)!.start
const oneIfSomething = (item: Item): number => (wordCount(item.text) > 0 || item.images.length > 0 ? 1 : 0)

const manualProbe = (source: string, url: string): Probe => ({
  source,
  host: new URL(url).hostname,
  verb: 'tinker',
  paths: [new URL(url).pathname],
  min: 1,
  counts: 'readable manual pages',
  read: async (f) => {
    const item = await manualPage(f, url)
    return { items: wordCount(item.text) > 0 ? 1 : 0 }
  },
})

export const PROBES: readonly Probe[] = [
  {
    source: 'wikipedia',
    host: 'en.wikipedia.org',
    verb: 'wander',
    paths: planPaths('en.wikipedia.org'),
    min: 1,
    counts: 'links from the Main Page sections',
    read: async (f) => {
      const links = await wikipediaMorningLinks(f, WIKIPEDIA_POINTS)
      const first = links[0]
      const sample = first ? await wikipediaArticle(f, decodeURIComponent(new URL(first.url).pathname.replace(/^\/wiki\//, '')).replace(/_/g, ' ')) : undefined
      return { items: links.length, ...(sample ? { sample } : {}) }
    },
  },
  {
    source: 'esolang',
    host: 'esolangs.org',
    verb: 'wander',
    paths: planPaths('esolangs.org'),
    min: ESOLANG_POINTS,
    counts: 'links on the front page',
    read: async (f) => ({ items: (await frontPageLinks(f, 'esolangs.org')).length }),
  },
  {
    source: 'github-creative-coding',
    host: 'api.github.com',
    verb: 'wander',
    paths: planPaths('api.github.com'),
    min: GITHUB_POINTS,
    counts: `repositories under the ${GITHUB_TOPIC} topic`,
    read: async (f) => ({ items: (await githubTopicRepos(f, GITHUB_TOPIC, GITHUB_POINTS)).length }),
  },
  {
    source: 'imgflip',
    host: 'api.imgflip.com',
    verb: 'wander',
    paths: planPaths('api.imgflip.com'),
    min: MEME_POINTS,
    counts: 'meme formats in the ranking',
    read: async (f) => {
      const links = await imgflipTopLinks(f, IMGFLIP_ALL)
      return { items: links.length, imgflipIds: links.map((l) => l.url.split('/').pop()!) }
    },
  },
  {
    source: 'commons',
    host: 'commons.wikimedia.org',
    verb: 'wander',
    paths: planPaths('commons.wikimedia.org'),
    min: 1,
    counts: 'pictures read from the front page',
    read: async (f, seed) => ({ items: oneIfSomething(await planStart('commons.wikimedia.org')(f, seed, 0)) }),
  },
  {
    source: 'artic',
    host: 'api.artic.edu',
    verb: 'wander',
    paths: planPaths('api.artic.edu'),
    min: 1,
    counts: 'artworks read',
    read: async (f, seed) => ({ items: oneIfSomething(await planStart('api.artic.edu')(f, seed, 0)) }),
  },
  manualProbe('p5js', MANUAL_START.p5),
  manualProbe('tonejs', MANUAL_START.tone),
  manualProbe('threejs', MANUAL_START.three),
  manualProbe('mdn', 'https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API'),
]

// ---- Imgflip freshness ----

export interface ImgflipHistory {
  version: 1
  /** One per day, oldest first, the last 8 kept. */
  entries: { date: string; ids: string[] }[]
}
const KEEP = 8
const STALE_DAYS = 14

const daysBefore = (date: string, n: number): string => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10)
}

/**
 * How many of today's formats are new since the last run (info), and whether nothing is new against the list of two weeks
 * ago or more (major: Merge's memes cannot follow the pulse with it). No history yet is info, never a pass.
 */
export function checkImgflipFreshness(history: ImgflipHistory | null, today: string, ids: readonly string[]): { findings: CheckResult[]; history: ImgflipHistory } {
  const earlier = (history?.entries ?? []).filter((e) => e.date < today)
  const next: ImgflipHistory = { version: 1, entries: [...earlier, { date: today, ids: [...ids] }].slice(-KEEP) }
  const base = { evidence: ['qa-out/imgflip-history.json'], where: 'apps/mind/src/web/sources/records.ts' }
  const last = earlier.at(-1)
  if (!last)
    return {
      history: next,
      findings: [
        {
          ...base,
          id: 'sources.imgflip-freshness',
          fingerprint: 'sources.imgflip-freshness',
          severity: 'info',
          title: 'Imgflip freshness: no history yet',
          what: `There is no history yet (the first run, or the last one's artefact expired), so freshness is not known. Today's list has ${ids.length} formats.`,
          causes: 'Nothing is known about whether the list moves until the next run.',
          fixKind: 'code',
        },
      ],
    }
  const fresh = newSince([last.ids], ids)
  const findings: CheckResult[] = [
    {
      ...base,
      id: 'sources.imgflip-freshness',
      fingerprint: 'sources.imgflip-freshness',
      severity: 'info',
      title: `Imgflip freshness: ${fresh.length} new formats since ${last.date}`,
      what: `${fresh.length} of ${ids.length} formats in today's ranking were not in it on ${last.date}.`,
      causes: 'Measured for the report.',
      fixKind: 'code',
    },
  ]
  const ref = earlier.filter((e) => e.date <= daysBefore(today, STALE_DAYS)).at(-1)
  if (ref && newSince([ref.ids], ids).length === 0)
    findings.push({
      ...base,
      id: 'sources.imgflip-stale',
      fingerprint: 'sources.imgflip-stale',
      severity: 'major',
      title: "Imgflip's meme list has not changed in two weeks",
      what: `No format in today's ranking is new since ${ref.date}. get_memes is close to an all-time top list. Recommended: Roman picks a pulse source that moves (see the promised-missing findings: Lemmy memes needs a new trial, Mastodon and Show HN are best dropped).`,
      causes: "Merge's memes cannot follow what is going round now: the same formats every morning.",
      fixKind: 'roman',
    })
  return { findings, history: next }
}

// ---- the run ----

export interface SourceHealthDeps {
  fetchImpl?: FetchImpl
  sleep?: (ms: number) => Promise<void>
  now: Date
  list: SourceList
  history: ImgflipHistory | null
  /** The workflow's token for api.github.com (lifts the limit of 60 requests an hour). */
  githubToken?: string
}

export interface SourceHealth {
  findings: CheckResult[]
  imgflipIds: string[] | null
  /** The history to keep for the next run; null when Imgflip could not be read (the old one stays). */
  history: ImgflipHistory | null
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

export async function checkSourceHealth(deps: SourceHealthDeps): Promise<SourceHealth> {
  const options = {
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    ...(deps.sleep ? { sleep: deps.sleep } : {}),
    ...(deps.githubToken ? { authorization: { 'api.github.com': `Bearer ${deps.githubToken}` } } : {}),
  }
  const fetchers: Record<ReadVerb, Fetcher> = { wander: createFetcher({ ...options, verb: 'wander' }), tinker: createFetcher({ ...options, verb: 'tinker' }), meme: createFetcher({ ...options, verb: 'meme' }) }
  const seed = Math.floor(deps.now.getTime() / 86_400_000)
  const today = deps.now.toISOString().slice(0, 10)
  const findings: CheckResult[] = []
  let imgflipIds: string[] | null = null
  let history: ImgflipHistory | null = null
  const nameOf = (id: string) => deps.list.sources.find((s) => s.id === id)?.name ?? id

  for (const probe of PROBES) {
    const f = fetchers[probe.verb]
    const name = nameOf(probe.source)
    const robots = await checkRobots(f, probe.host, probe.paths)
    if (robots.status === 'disallowed') {
      findings.push({
        id: 'sources.robots',
        fingerprint: `sources.robots|${probe.host}`,
        area: 'live',
        severity: 'blocker',
        title: `${probe.host}'s robots.txt now disallows what Merge reads`,
        what: `${robots.detail}. ${name} was not read any further.`,
        causes: 'Merge must stop reading this host: it reads by the site\'s own rules.',
        evidence: [`https://${probe.host}/robots.txt`],
        where: 'apps/mind/src/web/allowlist.ts',
        fixKind: 'code',
      })
      continue
    }
    if (robots.status === 'unreachable') {
      findings.push({
        id: DID_NOT_RUN,
        fingerprint: `${DID_NOT_RUN}|sources.items|${probe.source}`,
        area: 'live',
        severity: 'major',
        title: `A check did not run: ${name}`,
        what: `${robots.detail}. Without its robots.txt the host is not read, so nothing is known about ${name} today.`,
        causes: 'A broken source could go unseen.',
        evidence: [],
        fixKind: 'code',
      })
      continue
    }
    let result: ProbeResult
    try {
      result = await probe.read(f, seed)
    } catch (e) {
      findings.push({
        id: 'sources.host-answers',
        fingerprint: `sources.host-answers|${probe.source}`,
        area: 'live',
        severity: 'major',
        title: `${name} could not be read`,
        what: `Reading ${name} (${probe.host}) failed: ${message(e)}.`,
        causes: 'Merge cannot start from or read this source today.',
        evidence: [],
        where: 'apps/mind/src/web/sources/',
        fixKind: 'code',
      })
      continue
    }
    if (result.items < probe.min)
      findings.push({
        id: 'sources.items',
        fingerprint: `sources.items|${probe.source}`,
        area: 'live',
        severity: 'major',
        title: `${name} gave ${result.items} items`,
        what: `The source code found ${result.items} items (${probe.counts}) on ${probe.host}; a working source gives at least ${probe.min}. If the site changed its layout, the adapter needs a fix.`,
        causes: 'Merge gets fewer starting points or nothing from it, before anyone notices.',
        evidence: [],
        where: 'apps/mind/src/web/sources/',
        fixKind: 'code',
      })
    if (result.sample) {
      const words = wordCount(result.sample.text)
      if (words <= SAMPLE_WORDS || result.sample.links.length === 0)
        findings.push({
          id: 'sources.sample-page',
          fingerprint: `sources.sample-page|${probe.source}`,
          area: 'live',
          severity: 'major',
          title: `A sample ${name} page cleans badly`,
          what: `${result.sample.url} cleaned to ${words} words (needs over ${SAMPLE_WORDS}) and ${result.sample.links.length} links (needs 1 or more).`,
          causes: 'Merge reads too little from a page, or cannot go on from it.',
          evidence: [result.sample.url],
          where: 'apps/mind/src/web/sources/mediawiki.ts',
          fixKind: 'code',
        })
    }
    if (result.imgflipIds) {
      imgflipIds = result.imgflipIds
      const fresh = checkImgflipFreshness(deps.history, today, imgflipIds)
      history = fresh.history
      findings.push(...fresh.findings.map((x) => ({ ...x, area: 'live' as const })))
    }
  }
  return { findings, imgflipIds, history }
}
