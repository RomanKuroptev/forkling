import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Trail } from '@forkling/schema'
import { ratio, shares, topShare } from '@forkling/sim'
import { createFetcher } from '@forkling/mind/src/web/fetch.ts'
import { snapshotFetch } from '@forkling/mind/src/web/snapshot.ts'
import { readUrl } from '@forkling/mind/src/web/sources/index.ts'
import { HOST_PLANS } from '@forkling/mind/src/web/starts.ts'
import type { CheckResult } from '../report/finding.ts'
import type { SourceList } from '../sources/list.ts'

// What Merge actually read (audit spec 9.4, steps QS.3), from a world folder: a fast-forward world copy or a clone of
// Merge's repo. Reading files stays here; the counting is in packages/sim (source-mix.ts).

export interface SourceReads {
  trails: Trail[]
  /** The starting points each morning offered, or null when the folder cannot tell. */
  offered: { date: string; urls: string[] }[] | null
  works: { made: string; sources: string[] }[]
  souvenirs: { url: string; placedIn: string | null }[]
}

const readJson = (path: string): unknown => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

const jsonFiles = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).sort() : [])

type Points = { date: string; urls: string[] } | null
const pointsOf = (state: unknown): Points => {
  const p = (state as { points?: { date?: unknown; list?: unknown } } | null)?.points
  if (!p || typeof p.date !== 'string' || !Array.isArray(p.list)) return null
  return { date: p.date, urls: p.list.flatMap((x) => (typeof (x as { url?: unknown }).url === 'string' ? [(x as { url: string }).url] : [])) }
}

// Every morning's list over the git history of mind/state.json. The file changes every tick, so only the last commit of
// each day is read (the day's list is kept until the next morning).
function offeredFromGit(dir: string, since: string): Points[] {
  const git = (...args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
  const lastOfDay = new Map<string, string>()
  for (const line of git('log', `--since=${since}`, '--format=%H %cs', '--', 'mind/state.json').split('\n')) {
    const [sha, day] = line.split(' ')
    if (sha && day && !lastOfDay.has(day)) lastOfDay.set(day, sha)
  }
  return [...lastOfDay.values()].map((sha) => {
    try {
      return pointsOf(JSON.parse(git('show', `${sha}:mind/state.json`)))
    } catch {
      return null
    }
  })
}

export function readWorldSources(dir: string, opts: { git?: boolean; since?: string } = {}): SourceReads {
  const trails = jsonFiles(join(dir, 'trails')).flatMap((f) => {
    const t = Trail.safeParse(readJson(join(dir, 'trails', f)))
    return t.success ? [t.data] : []
  })

  const byDate = new Map<string, string[]>()
  const add = (p: Points) => {
    if (p && !byDate.has(p.date)) byDate.set(p.date, p.urls)
  }
  if (opts.git !== false && existsSync(join(dir, '.git'))) {
    try {
      for (const p of offeredFromGit(dir, opts.since ?? '8 days ago')) add(p)
    } catch {
      // No git history to read: today's list alone.
    }
  }
  add(pointsOf(readJson(join(dir, 'mind', 'state.json'))))
  const offered = byDate.size === 0 ? null : [...byDate].map(([date, urls]) => ({ date, urls })).sort((a, b) => a.date.localeCompare(b.date))

  const works: SourceReads['works'] = []
  const worksDir = join(dir, 'works')
  if (existsSync(worksDir))
    for (const e of readdirSync(worksDir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue
      const meta = readJson(join(worksDir, e.name, 'meta.json')) as { made?: unknown; sources?: { url?: unknown }[] } | null
      if (!meta || typeof meta.made !== 'string') continue
      works.push({ made: meta.made, sources: (meta.sources ?? []).flatMap((s) => (typeof s?.url === 'string' ? [s.url] : [])) })
    }

  const souvenirs = jsonFiles(join(dir, 'souvenirs')).flatMap((f) => {
    const s = readJson(join(dir, 'souvenirs', f)) as { source?: { url?: unknown }; placedIn?: unknown } | null
    return typeof s?.source?.url === 'string' ? [{ url: s.source.url, placedIn: typeof s.placedIn === 'string' ? s.placedIn : null }] : []
  })

  return { trails, offered, works, souvenirs }
}

// ---- the web snapshot ----

/** What a behaviour run's out folder says about the web it read (`web.json`, written by the runner). */
export const RUN_WEB_FILE = 'web.json'

/** The snapshot folder a run read, from its out folder, or null for a run on the real web (or one that does not say). */
export function snapshotOfRun(outDir: string): string | null {
  const w = readJson(join(outDir, RUN_WEB_FILE)) as { snapshot?: unknown } | null
  return typeof w?.snapshot === 'string' ? w.snapshot : null
}

/** Written by the runner into each seed's out folder: the snapshot that seed read. */
export function writeRunWeb(outDir: string, snapshot: string): void {
  writeFileSync(join(outDir, RUN_WEB_FILE), `${JSON.stringify({ snapshot }, null, 2)}\n`)
}

/**
 * The snapshot a world's run read: the one given, else what the run's out folder beside the world says (a behaviour seed is
 * `<seed>/world` and `<seed>/out`). Null means the real web, where every 404 counts.
 */
export function snapshotForWorld(world: string, given?: string): string | null {
  return given ?? snapshotOfRun(join(world, '..', 'out'))
}

/**
 * The failed addresses the snapshot never recorded (snapshot misses). Each is read again the way the mind reads it (its own
 * adapter, so github.com/a/b asks api.github.com), from the snapshot, with no network; an address is a miss when any request
 * it made is not in the manifest. One whose requests are all in it failed for real (a recorded 404, a recorded failure).
 */
export async function snapshotMisses(dir: string, urls: readonly string[]): Promise<Set<string>> {
  const manifest = readJson(join(dir, 'manifest.json')) as { entries?: { url?: unknown }[] } | null
  const recorded = new Set((manifest?.entries ?? []).flatMap((e) => (typeof e.url === 'string' ? [e.url] : [])))
  const answer = snapshotFetch(dir)
  const missed = new Set<string>()
  for (const url of new Set(urls)) {
    let miss = false
    const f = createFetcher({
      verb: 'wander',
      sleep: async () => undefined,
      fetchImpl: (u, init) => {
        if (!recorded.has(u)) miss = true
        return answer(u, init)
      },
    })
    try {
      await readUrl(f, url)
    } catch {
      // A failure is expected here: it is what the trip met.
    }
    if (miss) missed.add(url)
  }
  return missed
}

/** Every failed page of the trails (the addresses `snapshotMisses` sorts). */
export const failedUrls = (reads: SourceReads): string[] => reads.trails.flatMap((t) => t.pages.flatMap((p) => (p.failed && !READ_LATELY.test(p.failed) ? [p.url] : [])))

// ---- scoring ----

const hostOf = (url: string): string | null => {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

/**
 * url -> source id from qa/sources.json, with the page hosts of the APIs (github.com is read through api.github.com). An
 * API's page host stays with the API's source even when another source reads that host too: an Imgflip format page
 * (`imgflip.com/meme/<id>`) counts for the ranking (api.imgflip.com), though Top New (imgflip.com) offers the same pages.
 */
export function sourceOfUrl(list: SourceList): (url: string) => string | null {
  const byHost = new Map<string, string>()
  for (const s of list.sources) for (const h of s.hosts) byHost.set(h, s.id)
  for (const p of HOST_PLANS) {
    const id = byHost.get(p.host)
    if (id && p.itemHost !== p.host) byHost.set(p.itemHost, id)
  }
  return (url) => {
    const h = hostOf(url)
    return h ? (byHost.get(h) ?? null) : null
  }
}

const daysBefore = (date: string, n: number): string => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10)
}

const pct = (x: number | null): string => (x === null ? 'unknown' : `${Math.round(x * 100)}%`)

// The trip's note for a page skipped by the 30-day no-reread rule (apps/mind/src/web/trip.ts, READ_LATELY).
const READ_LATELY = /^skipped: read in the last 30 days/

export const TOP_SHARE_ALARM = 0.5
export const READ_NOTHING_ALARM = 0.1

export interface SourceSummary {
  from: string
  to: string
  trips: number
  tripsBySource: Record<string, number>
  tripsByDay: Record<string, Record<string, number>>
  readsBySource: Record<string, number>
  readNothing: number
  /** Trips that only met pages read in the last 30 days: the no-reread rule, not a source fault. */
  skippedLately: number
  hit404: number
  invented: string[]
  /** The web the run read: the recorded snapshot, or the real web (every 404 counts). */
  web: 'snapshot' | 'live'
  /** Snapshot runs: failed pages the snapshot never recorded. Real pages, most likely; counted apart, never an alarm. */
  snapshotMisses: string[]
  /** Failed pages reached by a guessed link (a name made into an address by code). */
  guesses: string[]
  readTwice: string[]
  fed: string[]
  offered: Record<string, number> | 'unknown'
}

export function scoreSources(
  reads: SourceReads,
  list: SourceList,
  opts: { label: string; to?: string; days?: number; snapshot?: { missed: ReadonlySet<string> } },
): { summary: SourceSummary; findings: CheckResult[] } {
  const days = opts.days ?? 7
  const to = opts.to ?? reads.trails.map((t) => t.date).sort().at(-1) ?? new Date().toISOString().slice(0, 10)
  const from = daysBefore(to, days - 1)
  const inWindow = (date: string) => date >= from && date <= to
  const source = sourceOfUrl(list)
  const trails = reads.trails.filter((t) => inWindow(t.date))

  const tripsBySource: Record<string, number> = {}
  const tripsByDay: Record<string, Record<string, number>> = {}
  const readsBySource: Record<string, number> = {}
  const pageCount = new Map<string, number>()
  const invented: string[] = []
  const snapshotMissed: string[] = []
  const guesses: string[] = []
  // On a snapshot run a failed page the snapshot never recorded is a snapshot miss, not Merge's or the source's fault; a page
  // reached by a guessed link always counts. On the real web every failure counts.
  const isMiss = (p: Trail['pages'][number]) => !!opts.snapshot && !!p.failed && !READ_LATELY.test(p.failed) && !p.guess && opts.snapshot.missed.has(p.url)
  const counts = (p: Trail['pages'][number]) => !!p.failed && !READ_LATELY.test(p.failed) && !isMiss(p)
  let readNothing = 0
  let hit404 = 0
  let badTrips = 0
  let skippedLately = 0
  for (const t of trails) {
    const startUrl = t.start.value.startsWith('https://') ? t.start.value : t.pages[0]!.url
    const id = source(startUrl) ?? hostOf(startUrl) ?? 'other'
    tripsBySource[id] = (tripsBySource[id] ?? 0) + 1
    const day = (tripsByDay[t.date] ??= {})
    day[id] = (day[id] ?? 0) + 1
    // A trip that only met pages read lately is counted on its own: the 30-day rule skipped them, the source was fine
    // (and Merge is now told so, since the fix after R2).
    const onlySkippedLately = t.pages.every((p) => p.failed && READ_LATELY.test(p.failed))
    const nothing = !onlySkippedLately && t.pages.every((p) => p.failed) && t.pages.some(counts)
    const missing = t.pages.some((p) => counts(p) && /\b404\b/.test(p.failed!))
    if (onlySkippedLately) skippedLately++
    if (nothing) readNothing++
    if (missing) hit404++
    if (nothing || missing) badTrips++
    for (const p of t.pages) {
      if (p.failed) {
        if (isMiss(p)) snapshotMissed.push(p.url)
        else if (counts(p)) {
          if (p.guess) guesses.push(p.url)
          if (/\b404\b/.test(p.failed) && hostOf(p.url) === 'en.wikipedia.org') invented.push(p.url)
        }
        continue
      }
      const sid = source(p.url) ?? hostOf(p.url) ?? 'other'
      readsBySource[sid] = (readsBySource[sid] ?? 0) + 1
      pageCount.set(p.url, (pageCount.get(p.url) ?? 0) + 1)
    }
  }
  const readTwice = [...pageCount].filter(([, n]) => n > 1).map(([u]) => u)

  const fedUrls = [...reads.works.filter((w) => inWindow(w.made.slice(0, 10))).flatMap((w) => w.sources), ...reads.souvenirs.filter((s) => s.placedIn).map((s) => s.url)]
  const fed = [...new Set(fedUrls.map(source).filter((x): x is string => x !== null))]

  let offered: SourceSummary['offered'] = 'unknown'
  if (reads.offered) {
    offered = {}
    for (const o of reads.offered.filter((x) => inWindow(x.date))) for (const u of o.urls) {
      const sid = source(u)
      if (sid) offered[sid] = (offered[sid] ?? 0) + 1
    }
  }

  const summary: SourceSummary = { from, to, trips: trails.length, tripsBySource, tripsByDay, readsBySource, readNothing, skippedLately, hit404, invented, web: opts.snapshot ? 'snapshot' : 'live', snapshotMisses: snapshotMissed, guesses, readTwice, fed, offered }
  const findings: CheckResult[] = []
  const base = (id: string, key = '') => ({ id, fingerprint: `${id}|${opts.label}${key ? `|${key}` : ''}`, area: 'behaviour' as const, evidence: [] as string[], fixture: opts.label })
  const span = `${from} to ${to}`

  const mix = shares(tripsBySource)
    .map((s) => `${s.key} ${s.count} (${pct(s.share)})`)
    .join(', ')
  findings.push({
    ...base('sources.trips-per-source'),
    severity: 'info',
    title: `Where Merge's trips started, ${span}`,
    what: trails.length === 0 ? 'No trips in these days.' : `${trails.length} trips: ${mix}. Pages read per source: ${shares(readsBySource).map((s) => `${s.key} ${s.count}`).join(', ') || 'none'}.`,
    causes: 'Measured for the report; no action by itself.',
    fixKind: 'code',
  })

  const wiki = ratio(tripsBySource.wikipedia ?? 0, trails.length)
  findings.push({
    ...base('sources.wikipedia-share'),
    severity: 'info',
    title: `Wikipedia's share of trips: ${pct(wiki)}`,
    what: `${tripsBySource.wikipedia ?? 0} of ${trails.length} trips (${pct(wiki)}) started on Wikipedia, ${span}.`,
    causes: 'Measured for the report; the top-source alarm is separate.',
    fixKind: 'code',
  })

  const top = topShare(tripsBySource)
  if (top && top.share > TOP_SHARE_ALARM)
    findings.push({
      ...base('sources.top-host-share'),
      severity: 'major',
      title: `One source started most of Merge's trips (${top.key}, ${pct(top.share)})`,
      what: `${top.count} of ${trails.length} trips (${pct(top.share)}) started from ${top.key}, ${span}; the alarm is over ${pct(TOP_SHARE_ALARM)}.`,
      causes: 'Merge reads, and so makes, from one corner of the web.',
      fixKind: 'prompt',
    })

  const nothing = ratio(badTrips, trails.length)
  if (nothing !== null && nothing > READ_NOTHING_ALARM)
    findings.push({
      ...base('sources.read-nothing'),
      severity: 'major',
      title: `Too many trips read nothing or hit a missing page (${pct(nothing)})`,
      what: `${badTrips} of ${trails.length} trips read nothing or hit a 404 (${readNothing} read nothing, ${hit404} hit a 404), ${span}; the alarm is over ${pct(READ_NOTHING_ALARM)}. Not counted: ${skippedLately} trips that only met pages read in the last 30 days.`,
      causes: 'A trip that reads nothing still costs a step and a read, and gives Merge nothing to make from.',
      fixKind: 'code',
    })

  if (skippedLately > 0)
    findings.push({
      ...base('sources.read-lately-skips'),
      severity: 'info',
      title: `Trips that only met pages read lately: ${skippedLately}`,
      what: `${skippedLately} of ${trails.length} trips, ${span}, only met pages read in the last 30 days and were skipped by the no-reread rule. Not a source fault; since the fix after R2 the plan is shown which start pages it read lately.`,
      causes: 'Measured for the report.',
      fixKind: 'code',
    })

  if (snapshotMissed.length > 0)
    findings.push({
      ...base('sources.snapshot-misses'),
      severity: 'info',
      title: `Pages the web snapshot never recorded: ${snapshotMissed.length}`,
      what: `${snapshotMissed.length} failed pages, ${span}, are not in the web snapshot, so this run could not read them; most are real pages. Not counted as missing pages or invented titles: ${snapshotMissed.slice(0, 5).join(', ')}${snapshotMissed.length > 5 ? ', ...' : ''}.`,
      causes: 'Measured for the report: many misses are a reason to record the snapshot deeper.',
      fixKind: 'code',
    })

  if (invented.length > 0)
    findings.push({
      ...base('sources.invented-titles'),
      severity: 'minor',
      title: `Merge went to Wikipedia pages that do not exist (${invented.length})`,
      what: `404 on: ${invented.slice(0, 5).join(', ')}${invented.length > 5 ? ', ...' : ''}.`,
      causes: 'A made-up title wastes a read; the plan should start from pages it has seen.',
      fixKind: 'prompt',
    })

  if (readTwice.length > 0)
    findings.push({
      ...base('sources.read-twice'),
      severity: 'info',
      title: `Pages read on more than one trip: ${readTwice.length}`,
      what: readTwice.slice(0, 5).join(', '),
      causes: 'Measured for the report.',
      fixKind: 'code',
    })

  for (const sid of Object.keys(readsBySource))
    if (list.sources.some((s) => s.id === sid) && !fed.includes(sid))
      findings.push({
        ...base('sources.read-not-feeding', sid),
        severity: 'info',
        title: `${sid} was read but fed nothing that was made`,
        what: `${readsBySource[sid]} pages read from ${sid}, ${span}, and no work named it and no placed souvenir came from it.`,
        causes: 'Measured for the report.',
        fixKind: 'code',
      })

  if (offered !== 'unknown') {
    const seen = new Set([...Object.keys(offered), ...Object.keys(tripsBySource), ...Object.keys(readsBySource)])
    // A source whose pages are counted for another (Top New's format pages count for the Imgflip ranking) is met when that one is.
    const countedFor = (s: SourceList['sources'][number]) => s.hosts.map((h) => source(`https://${h}/`)).filter((id): id is string => id !== null && id !== s.id)
    for (const s of list.sources)
      if (s.state === 'on the list' && s.group !== 'manual' && !seen.has(s.id) && !countedFor(s).some((id) => seen.has(id)))
        findings.push({
          ...base('sources.never-offered', s.id),
          severity: 'minor',
          title: `${s.name} is on the list but was never offered or read`,
          what: `No starting point and no page from ${s.name} (${s.hosts.join(', ')}), ${span}.`,
          causes: 'Merge may read it but never meets it, so it might as well not be on the list.',
          fixKind: 'code',
        })
  }

  return { summary, findings }
}
