import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Trail } from '@forkling/schema'
import { ratio, shares, topShare } from '@forkling/sim'
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

// ---- scoring ----

const hostOf = (url: string): string | null => {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

/** url -> source id from qa/sources.json, with the page hosts of the APIs (github.com is read through api.github.com). */
export function sourceOfUrl(list: SourceList): (url: string) => string | null {
  const byHost = new Map<string, string>()
  for (const s of list.sources) for (const h of s.hosts) byHost.set(h, s.id)
  for (const p of HOST_PLANS) {
    const id = byHost.get(p.host)
    if (id && !byHost.has(p.itemHost)) byHost.set(p.itemHost, id)
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
  readTwice: string[]
  fed: string[]
  offered: Record<string, number> | 'unknown'
}

export function scoreSources(reads: SourceReads, list: SourceList, opts: { label: string; to?: string; days?: number }): { summary: SourceSummary; findings: CheckResult[] } {
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
    const nothing = !onlySkippedLately && t.pages.every((p) => p.failed)
    const missing = t.pages.some((p) => p.failed && /\b404\b/.test(p.failed))
    if (onlySkippedLately) skippedLately++
    if (nothing) readNothing++
    if (missing) hit404++
    if (nothing || missing) badTrips++
    for (const p of t.pages) {
      if (p.failed) {
        if (/\b404\b/.test(p.failed) && hostOf(p.url) === 'en.wikipedia.org') invented.push(p.url)
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

  const summary: SourceSummary = { from, to, trips: trails.length, tripsBySource, tripsByDay, readsBySource, readNothing, skippedLately, hit404, invented, readTwice, fed, offered }
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
    for (const s of list.sources)
      if (s.state === 'on the list' && s.group !== 'manual' && !seen.has(s.id))
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
