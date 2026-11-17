import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { localDate } from '@forkling/sim'

/**
 * Step 8's run report (docs/spec/v4/step-8-run.md): everything in the launch checklist (spec-v4 section 10) that can be
 * counted from a world repo, in plain words and numbers. It only reads: the files, the tick logs and, where they say too
 * little, the repo's git history. Every file is read defensively, so a world from before projects, threads or tool
 * requests reads as "none yet" and a broken file is skipped, not fatal. Merge never sees this report.
 */

const MINUTE = 60_000
/** A gap in the tick log longer than this, while awake, counts as time the server was down. Lines come every minute. */
export const UP_GAP_MS = 5 * MINUTE

export interface RunReportOptions {
  from: string
  to: string
  /** Read git history where the files say too little (goal changes, older spend). Default: when the world is a repo. */
  git?: boolean
}

export interface MadeItem {
  at: string
  kind: string
  id: string
  title: string
  inspiredBy: string | null
}

export interface ShapeChange {
  at: string
  placeId: string
  placeName: string
  verb: 'found' | 'expand'
  summary: string
  holds: string
}

export interface ProjectLine {
  id: string
  name: string
  status: string
  sessions: number
  sessionsInRange: number
  reason: string | null
}

export interface NoteLine {
  id: string
  name: string
  at: string
  status: string
  /** Minutes from the note to Merge's answer (a reply, a decline or keeping it), null while unanswered. */
  answerMinutes: number | null
  sameDay: boolean
}

export interface DaySpend {
  date: string
  usd: number | null
  source: 'ticks' | 'ledger' | 'git' | null
}

export interface DayUp {
  date: string
  upHours: number
  wakingHours: number
  wakingUpHours: number
  /** Share of waking hours the server was up, null with no waking time logged. */
  share: number | null
}

export interface DayTicks {
  date: string
  ticks: number
  failedCalls: number
  guardStops: number
  refusals: number
  planRejections: number
  webRefused: number
}

export interface RunReport {
  world: string
  from: string
  to: string
  timezone: string
  days: string[]
  projects: ProjectLine[] | null
  made: { items: MadeItem[]; byKind: { kind: string; count: number; share: number }[]; scrapped: number; inspiredByVisitor: number | null }
  shape: ShapeChange[]
  visual: { date: string; times: { time: string; what: string }[] }[]
  notes: NoteLine[]
  threads: { threads: number; longest: number } | null
  visitors: number | null
  goals: { at: string; text: string }[]
  projectChanges: { at: string | null; text: string }[]
  spend: { byDay: DaySpend[]; month: string | null; monthUsd: number | null; capUsd: number | null; inRangeUsd: number }
  up: { byDay: DayUp[]; wakingHours: number; wakingUpHours: number; share: number | null }
  ticks: DayTicks[]
  toolRequests: { date: string; kind: string; title: string; status: string }[] | null
  tools: { name: string; since: string; gift: boolean }[] | null
}

// ---- reading, defensively

function readJson(dir: string, rel: string): unknown {
  try {
    return JSON.parse(readFileSync(join(dir, rel), 'utf8'))
  } catch {
    return null
  }
}

function listDir(dir: string, rel: string): string[] {
  const path = join(dir, rel)
  if (!existsSync(path)) return []
  try {
    return readdirSync(path).sort()
  } catch {
    return []
  }
}

function readJsonl(dir: string, rel: string): Record<string, unknown>[] {
  let text: string
  try {
    text = readFileSync(join(dir, rel), 'utf8')
  } catch {
    return []
  }
  return text.split('\n').flatMap((line) => {
    if (!line.trim()) return []
    try {
      const value = JSON.parse(line) as unknown
      return isRecord(value) ? [value] : []
    } catch {
      return []
    }
  })
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const timeOk = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v))

function git(dir: string, args: string[]): string | null {
  try {
    return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return null
  }
}

/** Commits that touched `path`, oldest first, with their commit times. */
function gitCommits(dir: string, path: string, extra: string[] = []): { sha: string; at: string }[] {
  const out = git(dir, ['log', '--reverse', '--format=%H %cI', ...extra, '--', path])
  if (!out) return []
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, at] = line.split(' ') as [string, string]
      return { sha, at }
    })
}

function gitJson(dir: string, sha: string, path: string): unknown {
  const out = git(dir, ['show', `${sha}:${path}`])
  if (out === null) return null
  try {
    return JSON.parse(out)
  } catch {
    return null
  }
}

// ---- time

const clockFormatters = new Map<string, Intl.DateTimeFormat>()
/** `HH:MM` local time. */
export function localClock(timezone: string, ms: number): string {
  let format = clockFormatters.get(timezone)
  if (!format) {
    format = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' })
    clockFormatters.set(timezone, format)
  }
  return format.format(new Date(ms))
}

/** Every date from `from` to `to`, both included. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = []
  const end = Date.parse(`${to}T00:00:00Z`)
  for (let ms = Date.parse(`${from}T00:00:00Z`); ms <= end; ms += 86_400_000) out.push(new Date(ms).toISOString().slice(0, 10))
  return out
}

const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places

// ---- the report

export function buildRunReport(dir: string, opts: RunReportOptions): RunReport {
  const DATE = /^\d{4}-\d{2}-\d{2}$/
  if (!DATE.test(opts.from) || !DATE.test(opts.to)) throw new Error('--from and --to are dates, like 2026-11-20')
  if (opts.from > opts.to) throw new Error('--from comes after --to')
  const forkling = readJson(dir, 'forkling.json')
  const timezone = (isRecord(forkling) && str(forkling.timezone)) || 'Europe/Stockholm'
  const days = datesBetween(opts.from, opts.to)
  const useGit = opts.git ?? git(dir, ['rev-parse', '--git-dir']) !== null
  const dayOf = (iso: string) => localDate(timezone, Date.parse(iso))
  const inRange = (iso: unknown): iso is string => timeOk(iso) && dayOf(iso) >= opts.from && dayOf(iso) <= opts.to

  // Places, and where each work is installed.
  const places = listDir(dir, 'places')
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => {
      const p = readJson(dir, `places/${f}`)
      return isRecord(p) && str(p.id) ? [p] : []
    })
  const placeName = (id: string) => str(places.find((p) => p.id === id)?.name) ?? id

  // Works.
  const works = listDir(dir, 'works').flatMap((id) => {
    const meta = readJson(dir, `works/${id}/meta.json`)
    return isRecord(meta) ? [meta] : []
  })
  const inspired = (v: unknown): string | null => (isRecord(v) ? (str(v.name) || str(v.noteId) || 'a visitor') : null)
  const made: MadeItem[] = []
  let scrapped = 0
  for (const w of works) {
    if (!inRange(w.made)) continue
    if (w.status === 'scrap') {
      scrapped++
      continue
    }
    made.push({ at: w.made, kind: str(w.kind) ?? 'work', id: str(w.id) ?? '?', title: str(w.title) ?? '?', inspiredBy: inspired(w.inspiredBy) })
  }

  // Projects (step 4): absent folders read as none yet.
  const projectFiles = listDir(dir, 'projects').flatMap((id) => {
    const p = readJson(dir, `projects/${id}/project.json`)
    return isRecord(p) ? [p] : []
  })
  const projects: ProjectLine[] | null = projectFiles.length
    ? projectFiles.map((p) => {
        const sessions = arr(p.sessions).filter(isRecord)
        return { id: str(p.id) ?? '?', name: str(p.name) ?? str(p.id) ?? '?', status: str(p.status) ?? '?', sessions: sessions.length, sessionsInRange: sessions.filter((s) => inRange(s.at)).length, reason: str(p.reason) }
      })
    : null
  for (const p of projectFiles) {
    const sessions = arr(p.sessions).filter(isRecord).filter((s) => inRange(s.at))
    if (sessions.length) made.push({ at: sessions.map((s) => s.at as string).sort()[0]!, kind: 'project', id: str(p.id) ?? '?', title: str(p.name) ?? '?', inspiredBy: inspired(p.inspiredBy) })
  }
  made.sort((a, b) => a.at.localeCompare(b.at))
  const kinds = new Map<string, number>()
  for (const m of made) kinds.set(m.kind, (kinds.get(m.kind) ?? 0) + 1)
  const byKind = [...kinds].map(([kind, count]) => ({ kind, count, share: count / made.length })).sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind))
  const hasInspiredField = works.some((w) => 'inspiredBy' in w) || projectFiles.some((p) => 'inspiredBy' in p)
  const inspiredByVisitor = hasInspiredField ? made.filter((m) => m.inspiredBy).length : null

  // Changes to the world's shape: founds and expands in each place's history, with what the place holds now.
  const shape: ShapeChange[] = []
  for (const p of places) {
    const id = str(p.id)!
    const installed = works.filter((w) => str(w.installedIn)?.startsWith(`${id}/`) && w.status !== 'scrap').length
    const exhibits = arr(p.exhibits).length
    const rooms = arr(p.rooms).length
    const holds = `${rooms} room${rooms === 1 ? '' : 's'}, ${exhibits} exhibit${exhibits === 1 ? '' : 's'}, ${installed} work${installed === 1 ? '' : 's'} on its screens`
    for (const h of arr(p.history).filter(isRecord)) {
      if ((h.verb === 'found' || h.verb === 'expand') && inRange(h.at)) shape.push({ at: h.at, placeId: id, placeName: placeName(id), verb: h.verb, summary: str(h.summary) ?? '', holds })
    }
  }
  shape.sort((a, b) => a.at.localeCompare(b.at))

  // Something new and visual: a work or sketch, a session's screenshot, a place founded, expanded, tended or a work installed.
  const visualEvents: { at: string; what: string }[] = made.filter((m) => m.kind !== 'project').map((m) => ({ at: m.at, what: `${m.kind} "${m.title}"` }))
  for (const p of projectFiles) for (const s of arr(p.sessions).filter(isRecord)) if (inRange(s.at) && s.shot) visualEvents.push({ at: s.at, what: `project "${str(p.name) ?? str(p.id)}" session` })
  for (const p of places) {
    for (const h of arr(p.history).filter(isRecord)) {
      if (!inRange(h.at) || !(h.verb === 'found' || h.verb === 'expand' || h.verb === 'tend' || h.verb === 'install')) continue
      // Putting a new work on a screen is the same moment as the work itself.
      if (h.verb === 'install' && made.some((m) => Math.abs(Date.parse(m.at) - Date.parse(h.at as string)) <= 2 * MINUTE)) continue
      visualEvents.push({ at: h.at, what: `${h.verb} ${placeName(str(p.id)!)}` })
    }
  }
  visualEvents.sort((a, b) => a.at.localeCompare(b.at))
  const visual = days.map((date) => ({ date, times: visualEvents.filter((e) => dayOf(e.at) === date).map((e) => ({ time: localClock(timezone, Date.parse(e.at)), what: e.what })) }))

  // Visitor notes and threads.
  const noteFiles = listDir(dir, 'notes')
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => {
      const n = readJson(dir, `notes/${f}`)
      return isRecord(n) && timeOk(n.at) ? [n] : []
    })
  const notes: NoteLine[] = noteFiles
    .filter((n) => inRange(n.at))
    .map((n) => {
      const answered = n.status !== 'new' && n.status !== 'found' && timeOk(n.foundAt)
      const answerMinutes = answered ? Math.max(0, Math.round((Date.parse(n.foundAt as string) - Date.parse(n.at as string)) / MINUTE)) : null
      return { id: str(n.id) ?? '?', name: str(n.name) ?? '', at: n.at as string, status: str(n.status) ?? '?', answerMinutes, sameDay: answered && dayOf(n.foundAt as string) === dayOf(n.at as string) }
    })
    .sort((a, b) => a.at.localeCompare(b.at))
  const hasThreads = noteFiles.some((n) => 'thread' in n || 'replyTo' in n)
  let threads: RunReport['threads'] = null
  if (hasThreads) {
    const sizes = new Map<string, number>()
    for (const n of noteFiles.filter((x) => inRange(x.at))) {
      const t = str(n.thread) ?? str(n.id) ?? '?'
      sizes.set(t, (sizes.get(t) ?? 0) + 1)
    }
    const multi = [...sizes.values()].filter((s) => s > 1)
    threads = { threads: multi.length, longest: multi.length ? Math.max(...multi) : 0 }
  }
  const visitorsFile = readJson(dir, 'memory/visitors.json')
  const visitorEntries = isRecord(visitorsFile) ? (Array.isArray(visitorsFile.visitors) ? visitorsFile.visitors.length : Object.keys(visitorsFile).length) : Array.isArray(visitorsFile) ? visitorsFile.length : null

  // Goal changes, with the reasons Merge gave: the stream's own lines, and the long goal's changes in git history.
  const goals: { at: string; text: string }[] = []
  const seen = new Set<string>()
  const addGoal = (at: string, text: string) => {
    const key = text.trim()
    if (seen.has(key)) return
    seen.add(key)
    goals.push({ at, text })
  }
  for (const f of listDir(dir, 'memory/stream').filter((f) => f.endsWith('.jsonl'))) {
    for (const e of readJsonl(dir, `memory/stream/${f}`)) {
      const text = str(e.text)
      if (e.kind === 'event' && text && /long goal/.test(text) && !/kept it/.test(text) && inRange(e.at)) addGoal(e.at as string, text)
    }
  }
  const longOf = (g: unknown) => (isRecord(g) && isRecord(g.long) && str(g.long.text) && timeOk(g.long.setAt) ? { text: g.long.text as string, reason: str(g.long.reason) ?? '', setAt: g.long.setAt as string } : null)
  const longGoals: { text: string; reason: string; setAt: string }[] = []
  if (useGit) {
    for (const c of gitCommits(dir, 'mind/goals.json', ['-G', '"setAt"'])) {
      const long = longOf(gitJson(dir, c.sha, 'mind/goals.json'))
      if (long && !longGoals.some((g) => g.setAt === long.setAt)) longGoals.push(long)
    }
  }
  const current = longOf(readJson(dir, 'mind/goals.json'))
  if (current && !longGoals.some((g) => g.setAt === current.setAt)) longGoals.push(current)
  for (const g of longGoals) {
    if (!inRange(g.setAt)) continue
    const text = `My long goal is now "${g.text}": ${g.reason}`
    // The stream's own line for the same change (its text cut to 300 characters) is kept instead.
    const near = goals.some((x) => /long goal is now/.test(x.text) && Math.abs(Date.parse(x.at) - Date.parse(g.setAt)) <= 2 * MINUTE)
    if (!near) addGoal(g.setAt, text)
  }
  goals.sort((a, b) => a.at.localeCompare(b.at))

  const projectChanges: RunReport['projectChanges'] = projectFiles
    .filter((p) => (p.status === 'done' || p.status === 'abandoned') && str(p.reason))
    .map((p) => {
      const last = arr(p.sessions).filter(isRecord).map((s) => str(s.at)).filter((x): x is string => !!x).sort().at(-1) ?? null
      return { at: last, text: `${str(p.name) ?? str(p.id)}: ${p.status}, ${p.reason as string}` }
    })

  // The tick logs: spend, hours up, and the rails.
  const tickDays = new Map<string, Record<string, unknown>[]>()
  for (const f of listDir(dir, 'mind/ticks').filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))) tickDays.set(f.slice(0, 10), readJsonl(dir, `mind/ticks/${f}`).filter((l) => timeOk(l.at)))

  const ledger = readJson(dir, 'brain/budget.json')
  const ledgerCalls = isRecord(ledger) ? arr(ledger.calls).filter(isRecord).filter((c) => timeOk(c.at) && num(c.usd) !== null) : []
  // The ledger keeps its last 500 calls: a day is covered only if the list reaches back before it, or was never cut.
  const ledgerComplete = ledgerCalls.length < 500
  const ledgerFrom = ledgerCalls.length ? dayOf(ledgerCalls[0]!.at as string) : null
  const ledgerMonth = isRecord(ledger) ? str(ledger.month) : null

  let gitDayEnds: Map<string, { month: string; spent: number }> | null = null
  const gitSpend = (): Map<string, { month: string; spent: number }> => {
    if (gitDayEnds) return gitDayEnds
    gitDayEnds = new Map()
    if (!useGit) return gitDayEnds
    const lastPerDay = new Map<string, string>()
    for (const c of gitCommits(dir, 'brain/budget.json')) lastPerDay.set(dayOf(c.at), c.sha)
    for (const [date, sha] of lastPerDay) {
      const l = gitJson(dir, sha, 'brain/budget.json')
      if (isRecord(l) && str(l.month) && num(l.spentUsd) !== null) gitDayEnds.set(date, { month: l.month as string, spent: l.spentUsd as number })
    }
    return gitDayEnds
  }

  const byDay: DaySpend[] = days.map((date) => {
    const lines = tickDays.get(date)
    if (lines && lines.length) return { date, usd: round(lines.reduce((s, l) => s + arr(l.calls).filter(isRecord).reduce((t, c) => t + (num(c.usd) ?? 0), 0), 0), 4), source: 'ticks' }
    if (ledgerMonth === date.slice(0, 7) && (ledgerComplete || (ledgerFrom && ledgerFrom < date))) {
      return { date, usd: round(ledgerCalls.filter((c) => dayOf(c.at as string) === date).reduce((s, c) => s + (c.usd as number), 0), 4), source: 'ledger' }
    }
    const ends = gitSpend()
    const end = ends.get(date)
    if (end) {
      const before = [...ends.entries()].filter(([d]) => d < date).sort(([a], [b]) => a.localeCompare(b)).at(-1)?.[1]
      const start = before && before.month === end.month ? before.spent : 0
      return { date, usd: round(Math.max(0, end.spent - start), 4), source: 'git' }
    }
    return { date, usd: null, source: null }
  })

  const ticks: DayTicks[] = []
  const upDays: DayUp[] = []
  for (const date of days) {
    const lines = (tickDays.get(date) ?? []).slice().sort((a, b) => (a.at as string).localeCompare(b.at as string))
    let upMs = 0
    let wakingMs = 0
    let wakingUpMs = 0
    for (let i = 0; i + 1 < lines.length; i++) {
      const gap = Date.parse(lines[i + 1]!.at as string) - Date.parse(lines[i]!.at as string)
      const up = gap <= UP_GAP_MS
      if (up) upMs += gap
      if (lines[i]!.asleep === false) {
        wakingMs += gap
        if (up) wakingUpMs += gap
      }
    }
    const h = (ms: number) => round(ms / 3_600_000, 1)
    upDays.push({ date, upHours: h(upMs), wakingHours: h(wakingMs), wakingUpHours: h(wakingUpMs), share: wakingMs > 0 ? wakingUpMs / wakingMs : null })
    const calls = lines.flatMap((l) => arr(l.calls).filter(isRecord))
    const notesOf = lines.flatMap((l) => arr(l.notes).filter((n): n is string => typeof n === 'string'))
    ticks.push({
      date,
      ticks: lines.length,
      failedCalls: calls.filter((c) => c.ok === false && c.error !== 'monthly budget reached' && c.error !== 'no credentials').length,
      guardStops: calls.filter((c) => c.error === 'monthly budget reached').length,
      refusals: calls.filter((c) => c.stop === 'refusal').length,
      planRejections: notesOf.filter((n) => n.startsWith('plan rejected')).length,
      webRefused: lines.reduce((s, l) => s + (isRecord(l.web) ? (num(l.web.refused) ?? 0) : 0), 0),
    })
  }
  const wakingHours = round(upDays.reduce((s, d) => s + d.wakingHours, 0), 1)
  const wakingUpHours = round(upDays.reduce((s, d) => s + d.wakingUpHours, 0), 1)

  // Tool requests and tools (step 6): requests with a `kind` in their front matter, and `mind/tools.json`.
  const requestFiles = listDir(dir, 'self/requests').filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
  const requests = requestFiles.flatMap((f) => {
    let text: string
    try {
      text = readFileSync(join(dir, 'self/requests', f), 'utf8')
    } catch {
      return []
    }
    const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1]
    if (!front) return []
    const field = (name: string) => new RegExp(`^${name}:\\s*(.*)$`, 'm').exec(front)?.[1]?.trim().replace(/^["']|["']$/g, '') ?? null
    const kind = field('kind')
    return kind ? [{ date: f.slice(0, 10), kind, title: field('title') ?? '', status: field('status') ?? 'open' }] : []
  })
  const toolsFile = readJson(dir, 'mind/tools.json')
  const toolList = isRecord(toolsFile) ? arr(toolsFile.tools) : arr(toolsFile)
  const tools = toolsFile === null ? null : toolList.filter(isRecord).map((t) => ({ name: str(t.name) ?? str(t.id) ?? '?', since: str(t.since) ?? '', gift: t.gift === true }))

  return {
    world: dir,
    from: opts.from,
    to: opts.to,
    timezone,
    days,
    projects,
    made: { items: made, byKind, scrapped, inspiredByVisitor },
    shape,
    visual,
    notes,
    threads,
    visitors: visitorEntries,
    goals,
    projectChanges,
    spend: {
      byDay,
      month: ledgerMonth,
      monthUsd: isRecord(ledger) ? num(ledger.spentUsd) : null,
      capUsd: isRecord(ledger) ? num(ledger.capUsd) : null,
      inRangeUsd: round(byDay.reduce((s, d) => s + (d.usd ?? 0), 0), 4),
    },
    up: { byDay: upDays, wakingHours, wakingUpHours, share: wakingHours > 0 ? wakingUpHours / wakingHours : null },
    ticks,
    toolRequests: requests.length ? requests : null,
    tools,
  }
}

// ---- plain words

const NONE_YET = 'none yet'
const usd = (n: number) => `$${n.toFixed(2)}`
const pct = (n: number) => `${Math.round(n * 100)}%`
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const minutesText = (m: number) => (m < 120 ? `${m} min` : `${round(m / 60, 1)} h`)

export function formatRunReport(r: RunReport): string {
  const out: string[] = []
  const tz = r.timezone
  const when = (iso: string) => `${localDate(tz, Date.parse(iso))} ${localClock(tz, Date.parse(iso))}`
  out.push(`Run report: ${r.from} to ${r.to} (${plural(r.days.length, 'day')}, ${tz})`, '')

  out.push('Projects')
  if (!r.projects) out.push(`  ${NONE_YET}`)
  else {
    const statuses = new Map<string, { count: number; sessions: number }>()
    for (const p of r.projects) {
      const s = statuses.get(p.status) ?? { count: 0, sessions: 0 }
      statuses.set(p.status, { count: s.count + 1, sessions: s.sessions + p.sessions })
    }
    for (const [status, s] of statuses) out.push(`  ${status}: ${plural(s.count, 'project')}, ${plural(s.sessions, 'session')}`)
    for (const p of r.projects) out.push(`  - ${p.name} (${p.status}): ${plural(p.sessions, 'session')}, ${p.sessionsInRange} in this run${p.reason ? `; ${p.reason}` : ''}`)
  }
  out.push('')

  out.push(`Things made: ${r.made.items.length}${r.made.scrapped ? ` (and ${r.made.scrapped} scrapped)` : ''}`)
  if (!r.made.items.length) out.push('  nothing')
  for (const k of r.made.byKind) out.push(`  ${k.kind}: ${k.count} (${pct(k.share)})`)
  out.push(`  made because of a visitor: ${r.made.inspiredByVisitor === null ? NONE_YET : r.made.inspiredByVisitor}`)
  out.push('')

  out.push(`Changes to the world's shape: ${r.shape.length}`)
  for (const s of r.shape) out.push(`  ${when(s.at)} ${s.verb} ${s.placeName}: ${s.summary}`, `      it holds now: ${s.holds}`)
  out.push('')

  out.push('Something new and visual, by day')
  for (const d of r.visual) out.push(`  ${d.date}: ${d.times.length ? d.times.map((t) => `${t.time} ${t.what}`).join('; ') : 'nothing'}`)
  out.push('')

  out.push(`Visitor notes: ${r.notes.length}`)
  for (const n of r.notes) {
    const answer = n.answerMinutes === null ? 'no answer yet' : `${n.status} after ${minutesText(n.answerMinutes)}${n.sameDay ? ', same day' : ', not the same day'}`
    out.push(`  ${when(n.at)} ${n.name || '(no name)'}: ${answer}`)
  }
  out.push(`  threads: ${r.threads ? `${r.threads.threads}, the longest ${plural(r.threads.longest, 'note')}` : NONE_YET}`)
  out.push(`  visitors remembered: ${r.visitors === null ? NONE_YET : r.visitors}`)
  out.push('')

  out.push('Goal and project changes, with the reasons Merge gave')
  if (!r.goals.length && !r.projectChanges.length) out.push('  none')
  for (const g of r.goals) out.push(`  ${when(g.at)} ${g.text}`)
  for (const p of r.projectChanges) out.push(`  ${p.at ? when(p.at) : '(no date)'} project ${p.text}`)
  if (!r.projects) out.push(`  projects: ${NONE_YET}`)
  out.push('')

  out.push('Spend')
  for (const d of r.spend.byDay) out.push(`  ${d.date}: ${d.usd === null ? 'unknown' : usd(d.usd)}${d.source && d.source !== 'ticks' ? ` (from the ${d.source === 'git' ? 'git history' : 'ledger'})` : ''}`)
  out.push(`  in this run: ${usd(r.spend.inRangeUsd)}`)
  if (r.spend.month && r.spend.monthUsd !== null) out.push(`  month ${r.spend.month}: ${usd(r.spend.monthUsd)} of ${r.spend.capUsd === null ? '?' : usd(r.spend.capUsd)}`)
  out.push('')

  out.push('Hours up')
  for (const d of r.up.byDay) out.push(`  ${d.date}: ${d.upHours} h logged, ${d.wakingUpHours} of ${d.wakingHours} waking h up${d.share === null ? '' : ` (${pct(d.share)})`}`)
  out.push(`  in all: ${r.up.wakingUpHours} of ${r.up.wakingHours} waking h up${r.up.share === null ? '' : ` (${(r.up.share * 100).toFixed(1)}%)`}`)
  out.push('')

  const sum = (k: keyof Omit<DayTicks, 'date'>) => r.ticks.reduce((s, d) => s + d[k], 0)
  out.push('Calls and rails')
  out.push(`  ticks logged: ${sum('ticks')}`)
  out.push(`  the guard stopped a call: ${sum('guardStops')}`)
  out.push(`  failed calls: ${sum('failedCalls')} (refused by the model: ${sum('refusals')})`)
  out.push(`  plans turned down: ${sum('planRejections')}`)
  out.push(`  web requests refused (host not allowed): ${sum('webRefused')}`)
  out.push('')

  out.push('Tool requests')
  if (!r.toolRequests) out.push(`  ${NONE_YET}`)
  else for (const q of r.toolRequests) out.push(`  ${q.date} ${q.kind}: ${q.title || '(no title)'} (${q.status})`)
  out.push(`  tools: ${r.tools === null ? NONE_YET : r.tools.length ? r.tools.map((t) => `${t.name}${t.gift ? ' (gift)' : ''}`).join(', ') : 'none'}`)

  return out.join('\n')
}
