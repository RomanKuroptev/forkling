import { execFileSync } from 'node:child_process'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { BudgetLedger, Health } from '@forkling/schema'
import { localDate } from '@forkling/sim'
import { createBuildWorker, type BuildHandler } from './build-worker.ts'
import type { WorkChecker } from './builds/browser-check.ts'
import { createExpandHandler } from './builds/expand-job.ts'
import { createFoundBuildHandler } from './builds/found-build-job.ts'
import type { GithubClient } from './builds/github.ts'
import { readProject, readProjects } from './builds/projects.ts'
import type { Sandbox } from './builds/sandbox-run.ts'
import type { SessionModel } from './builds/session.ts'
import { createSessionHandler } from './builds/session-job.ts'
import { createTinkerHandler } from './builds/tinker-job.ts'
import { costUsd, daysInMonth, type ModelId } from './budget.ts'
import type { LlmClient } from './llm.ts'
import { buildRunReport, formatRunReport, type RunReport } from './run-report.ts'
import type { SpeciesPack, MicroBehavior } from '@forkling/schema'
import { createLoop } from './tick/loop.ts'
import { hostRule } from './web/allowlist.ts'
import type { FetchImpl } from './web/fetch.ts'

/**
 * The fast-forward test (docs/spec/v4/parallel-plan.md): the W5 local test made reusable. `createLoop` and the build worker
 * run on a fake clock over a throwaway copy of a world that has no git remote, so nothing can be pushed. The clock moves by
 * the loop's own `nextDelayMs`, the build worker gets its turn every simulated minute as on the server, and the model and the
 * web are whatever the caller hands in: the real ones through the normal budget guard, or the fakes. A hard cap for the whole
 * run stops it cleanly. At the end the run report is made over the simulated dates and a short summary is written beside it.
 */

const MINUTE = 60_000
const DAY = 86_400_000
const BUILD_EVERY_MS = MINUTE
/** At most this many crash messages are kept for the summary. */
const MAX_CRASHES_KEPT = 20
const MODELS: ReadonlySet<string> = new Set<ModelId>(['claude-haiku-5-5', 'claude-sonnet-5-5'])
/** Calls a sleeping mind may make: the sleep rewrite and its late call (spec 2.3). */
const ASLEEP_KINDS: ReadonlySet<string> = new Set(['sleep', 'sleeplate'])

/** Roman's limit for the live server (18 November 2026): a single build session that costs more than this fails the run. */
export const SESSION_FAIL_USD = 1

export interface FastForwardOptions {
  /** Build sessions (step 4): the `build` verb is on and sessions run through this model and runner, never a sandbox unit (`requireSandbox` is false). Off when absent. */
  sessions?: { model: SessionModel | null; sandbox: Sandbox }
  /** The throwaway world. It must have no git remote. */
  dir: string
  days: number
  /** The most the whole run may spend, in US dollars. */
  capUsd: number
  /** When the simulated run starts (ms since the epoch). */
  startMs: number
  llm: LlmClient
  /** Real fetch or a fake one; every request is watched for a host off the allowlist. */
  fetchImpl: FetchImpl
  /** Waits between two requests to one host, in real time. Injected so a test does not wait. */
  realSleep?: (ms: number) => Promise<void>
  workCheck: WorkChecker
  pack: SpeciesPack
  behaviors: MicroBehavior[]
  speciesPersona: string
  /** The engine commit the run is on, for the tick log and the summary. */
  engine: string
  /** Where the summary and screenshots go. Never inside the world. */
  outDir: string
  /** A line of progress. */
  log?: (line: string) => void
  /** A shorter run than `days` whole days, for a test. The days judged are still `days`. */
  durationMs?: number
  /** Keep every model call's prompt in `<outDir>/prompts.jsonl`, for the audit harness (QB). Off when absent. */
  capturePrompts?: boolean
}

/**
 * The model client that writes one line per call to `file` (the audit harness reads it; Merge never does): the simulated
 * time, the kind, the model, the prompt and whether the answer parsed. A batch it sends has `parsed: null` (its answer comes
 * later). The build sessions' turns are not model calls of this client and are not in it.
 */
export function capturingModel(llm: LlmClient, file: string, clock: () => number): LlmClient {
  mkdirSync(dirname(file), { recursive: true })
  const write = (line: Record<string, unknown>) => appendFileSync(file, `${JSON.stringify(line)}\n`)
  return {
    async complete(req) {
      const at = new Date(clock()).toISOString()
      const result = await llm.complete(req)
      write({ at, kind: req.kind, model: req.model, system: req.system, user: req.user, parsed: result.parsed !== null, stopReason: result.stopReason })
      return result
    },
    async submitBatch(req) {
      const at = new Date(clock()).toISOString()
      const id = await llm.submitBatch(req)
      write({ at, kind: req.kind, model: req.model, system: req.system, user: req.user, parsed: null, batch: true })
      return id
    },
    fetchBatch: (id, schema) => llm.fetchBatch(id, schema),
    cancelBatch: (id) => llm.cancelBatch(id),
  }
}

export interface Crash {
  at: string
  message: string
}

export interface FastForwardResult {
  summaryPath: string
  pass: boolean
  reasons: string[]
  crashes: number
  railsBroken: string[]
  spentUsd: number
  stoppedAtCap: boolean
  ticks: number
  report: RunReport
  /** Build sessions, when the run had them on. */
  sessions: SessionSummary | null
}

/** No remote, no push: the world is a throwaway copy, or not a repository at all. */
export function remotesOf(dir: string): string[] {
  try {
    return execFileSync('git', ['-C', dir, 'remote'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

/** Midnight at the start of a local date, in ms. */
export function localMidnight(timezone: string, date: string): number {
  let guess = Date.parse(`${date}T00:00:00Z`)
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(guess))
    const get = (t: string) => Number(parts.find((p) => p.type === t)!.value)
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
    guess -= asUtc - Date.parse(`${date}T00:00:00Z`)
  }
  return guess
}

/** The model client with a hard cap for the run: once the run has spent the cap, every call is refused before it is made. */
export function cappedModel(llm: LlmClient, capUsd: number) {
  let spent = 0
  let refused = 0
  const over = () => spent >= capUsd - 1e-9
  const client: LlmClient = {
    async complete(req) {
      if (over()) {
        refused++
        throw new Error(`the fast-forward cap of $${capUsd} is reached`)
      }
      const result = await llm.complete(req)
      spent += costUsd(req.model, result.usage)
      return result
    },
    async submitBatch(req) {
      if (over()) {
        refused++
        throw new Error(`the fast-forward cap of $${capUsd} is reached`)
      }
      return llm.submitBatch(req)
    },
    async fetchBatch(id, schema) {
      const outcome = await llm.fetchBatch(id, schema)
      if (outcome.status === 'done') spent += costUsd('claude-sonnet-5-5', outcome.usage, { batch: true })
      return outcome
    },
    cancelBatch: (id) => llm.cancelBatch(id),
  }
  /** The session model under the same cap: a turn is refused once the run has spent it, and its cost counts. */
  const session = (inner: SessionModel): SessionModel => ({
    async turn(req) {
      if (over()) {
        refused++
        throw new Error(`the fast-forward cap of $${capUsd} is reached`)
      }
      const result = await inner.turn(req)
      spent += costUsd(req.model, result.usage)
      return result
    },
  })
  return {
    client,
    session,
    get spentUsd() {
      return spent
    },
    get reached() {
      return over()
    },
    get refused() {
      return refused
    },
  }
}

/** Fetch that keeps a real second between two requests to one host, and notes any request to a host off the allowlist. */
export function watchedFetch(inner: FetchImpl, offList: string[], realSleep: (ms: number) => Promise<void>): FetchImpl {
  const last = new Map<string, number>()
  return async (url, init) => {
    let host = ''
    try {
      host = new URL(url).hostname
    } catch {
      // Not a URL: the fetcher refuses it anyway.
    }
    if (!hostRule(host)) offList.push(url)
    const wait = (last.get(host) ?? 0) + 1000 - Date.now()
    if (wait > 0) await realSleep(wait)
    last.set(host, Date.now())
    return inner(url, init)
  }
}

/** A pull request opened by writing the work into the world, as the merge of `validate.yml` would: `works/<id>/` and nothing else. */
function localGithub(dir: string, railsBroken: string[]): GithubClient {
  let n = 0
  return {
    async openWorkPullRequest({ id, files }) {
      for (const f of files) {
        if (!f.path.startsWith(`works/${id}/`) || f.path.includes('..')) {
          railsBroken.push(`a work's pull request held ${f.path}`)
          throw new Error('a work touches only its own folder')
        }
      }
      for (const f of files) {
        mkdirSync(dirname(join(dir, f.path)), { recursive: true })
        writeFileSync(join(dir, f.path), f.content)
      }
      n++
      return { number: n, url: `http://localhost/fast-forward/pull/${n}` }
    },
  }
}

const readJson = (path: string): unknown => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

export async function runFastForward(o: FastForwardOptions): Promise<FastForwardResult> {
  const log = o.log ?? (() => undefined)
  const remotes = remotesOf(o.dir)
  if (remotes.length) throw new Error(`the world has a git remote (${remotes.join(', ')}): fast-forward runs only on a copy with none`)
  const outDir = resolve(o.outDir)
  const inside = relative(resolve(o.dir), outDir)
  if (inside === '' || (!inside.startsWith('..') && !isAbsolute(inside))) throw new Error('the summary goes outside the world')
  mkdirSync(outDir, { recursive: true })

  const forkling = readJson(join(o.dir, 'forkling.json')) as { timezone?: string } | null
  const timezone = forkling?.timezone ?? 'Europe/Stockholm'
  const ledgerAtStart = BudgetLedger.safeParse(readJson(join(o.dir, 'brain/budget.json')))
  const monthCap = ledgerAtStart.success ? ledgerAtStart.data.capUsd : BudgetLedger.parse({ month: localDate(timezone, o.startMs).slice(0, 7) }).capUsd

  let now = o.startMs
  const endMs = o.startMs + (o.durationMs ?? o.days * DAY)
  const clock = () => now
  const capped = cappedModel(o.capturePrompts ? capturingModel(o.llm, join(outDir, 'prompts.jsonl'), clock) : o.llm, o.capUsd)
  const railsBroken: string[] = []
  const offList: string[] = []
  const web = { fetchImpl: watchedFetch(o.fetchImpl, offList, o.realSleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))) }

  const loop = createLoop({
    dir: o.dir,
    clock,
    git: null,
    deps: { llm: capped.client, ...(o.sessions ? { sessions: o.sessions.model !== null } : {}), pack: o.pack, behaviors: o.behaviors, speciesPersona: o.speciesPersona, workCheck: o.workCheck, web, outsideCalls: () => [], engine: o.engine },
  })
  const stats: SessionStats = { runs: [], failures: [], waited: 0 }
  const projectsBefore = new Set(readProjects(o.dir).projects.map((p) => p.id))
  const sessionHandler = o.sessions?.model
    ? countSessions(createSessionHandler({ model: capped.session(o.sessions.model), sandbox: o.sessions.sandbox, requireSandbox: false, git: null, now: clock, timezone, timelapse: null }), stats)
    : null
  const worker = createBuildWorker({
    dir: o.dir,
    now: clock,
    handlers: {
      ...(sessionHandler ? { session: sessionHandler } : {}),
      expand: createExpandHandler({ dir: o.dir, llm: capped.client, now: clock }),
      found: createFoundBuildHandler({ dir: o.dir, llm: capped.client, now: clock }),
      tinker: createTinkerHandler({ dir: o.dir, llm: capped.client, checker: o.workCheck, github: localGithub(o.dir, railsBroken), now: clock, web }),
    },
  })

  const crashes: Crash[] = []
  let crashCount = 0
  const crashed = (where: string, e: unknown) => {
    crashCount++
    const message = `${where}: ${e instanceof Error ? e.message : String(e)}`
    if (crashes.length < MAX_CRASHES_KEPT) crashes.push({ at: new Date(now).toISOString(), message })
    log(`crash at ${new Date(now).toISOString()}: ${message}`)
  }
  let ticks = 0
  let lastBuild = -Infinity
  let lastDay = ''
  let readsOver = false
  while (now < endMs) {
    try {
      await loop.tickOnce()
    } catch (e) {
      crashed('tick', e)
    }
    ticks++
    if (now - lastBuild >= BUILD_EVERY_MS) {
      lastBuild = now
      try {
        await worker.tick()
      } catch (e) {
        crashed('build worker', e)
      }
    }
    const health = Health.safeParse(readJson(join(o.dir, 'mind/health.json')))
    if (health.success && health.data.quotas.readings.used > health.data.quotas.readings.max && !readsOver) {
      readsOver = true
      railsBroken.push(`${health.data.quotas.readings.used} reads on ${health.data.date}, over the ${health.data.quotas.readings.max} a day`)
    }
    const day = localDate(timezone, now)
    if (day !== lastDay) {
      lastDay = day
      log(`${day}: $${capped.spentUsd.toFixed(3)} spent so far, ${ticks} ticks, ${crashCount} crashes`)
    }
    if (capped.reached) {
      log(`the cap of $${o.capUsd} is reached: stopping`)
      break
    }
    now += loop.nextDelayMs()
  }
  await o.workCheck.close().catch(() => undefined)
  await o.sessions?.sandbox.close().catch(() => undefined)

  const from = localDate(timezone, o.startMs)
  const to = localDate(timezone, Math.min(now, endMs) - 1)
  const report = buildRunReport(o.dir, { from, to, git: false })

  // Rails, from what the run saw and what the tick logs say.
  for (const url of offList.slice(0, 5)) railsBroken.push(`a request reached a host off the allowlist: ${url}`)
  for (const date of report.days) {
    const path = join(o.dir, 'mind/ticks', `${date}.jsonl`)
    if (!existsSync(path)) continue
    for (const text of readFileSync(path, 'utf8').split('\n')) {
      if (!text.trim()) continue
      let l: { at?: string; asleep?: boolean; calls?: { kind: string; model: string; ok: boolean; usd: number }[] }
      try {
        l = JSON.parse(text)
      } catch {
        continue
      }
      for (const c of l.calls ?? []) {
        if (!MODELS.has(c.model)) railsBroken.push(`${l.at}: a call to ${c.model}`)
        if (l.asleep && c.usd > 0 && !ASLEEP_KINDS.has(c.kind)) railsBroken.push(`${l.at}: a ${c.kind} call while asleep`)
      }
    }
  }
  const ledgerAtEnd = BudgetLedger.safeParse(readJson(join(o.dir, 'brain/budget.json')))
  if (ledgerAtEnd.success && ledgerAtEnd.data.spentUsd > ledgerAtEnd.data.capUsd + 1e-6) railsBroken.push(`the month's spend $${ledgerAtEnd.data.spentUsd.toFixed(2)} is over its cap $${ledgerAtEnd.data.capUsd}`)
  if (capped.spentUsd > o.capUsd * 1.25) railsBroken.push(`the run spent $${capped.spentUsd.toFixed(2)}, well over its cap of $${o.capUsd}`)

  // The judgement of the plan: no crashes, no rails broken, spend under the daily pace, something visual made every simulated day.
  const simulatedDays = report.days.slice(0, o.days)
  const reasons: string[] = []
  if (crashCount) reasons.push(`${crashCount} crash${crashCount === 1 ? '' : 'es'}`)
  if (railsBroken.length) reasons.push(`${railsBroken.length} rail${railsBroken.length === 1 ? '' : 's'} broken`)
  const pace = (date: string) => monthCap / daysInMonth(date)
  for (const d of report.spend.byDay.filter((x) => simulatedDays.includes(x.date))) if (d.usd !== null && d.usd > pace(d.date) + 1e-9) reasons.push(`${d.date}: spent $${d.usd.toFixed(2)}, over the daily pace of $${pace(d.date).toFixed(2)}`)
  const madeOn = (date: string) => report.made.items.filter((m) => localDate(timezone, Date.parse(m.at)) === date).length + report.shape.filter((s) => localDate(timezone, Date.parse(s.at)) === date).length
  for (const date of simulatedDays) if (madeOn(date) === 0) reasons.push(`${date}: nothing visual made`)
  if (capped.reached && now < endMs) reasons.push(`stopped at the cap after ${((now - o.startMs) / DAY).toFixed(1)} of ${o.days} days`)
  // Build sessions are information, except Roman's rule of 18 November 2026: none may cost over $1 on the live server.
  for (const r of stats.runs) if (r.usd > SESSION_FAIL_USD + 1e-9) reasons.push(`a build session on ${r.projectId} cost $${r.usd.toFixed(2)}, over $${SESSION_FAIL_USD} (Roman's limit of 18 November)`)
  const pass = reasons.length === 0
  const sessions = o.sessions ? sessionSummary(stats, projectsBefore, o.dir) : null

  // Screenshots: the thumbnails the browser check took of each work made, and each project's session shots.
  const shots: string[] = []
  const shotDir = join(outDir, 'shots')
  for (const m of report.made.items) {
    const sources = m.kind === 'project' ? listShots(o.dir, m.id) : [join(o.dir, 'works', m.id, 'thumb.png')]
    for (const src of sources) {
      if (!existsSync(src)) continue
      mkdirSync(shotDir, { recursive: true })
      const name = `${m.kind === 'project' ? 'project' : 'work'}-${m.id}-${shots.length + 1}.png`
      copyFileSync(src, join(shotDir, name))
      shots.push(`shots/${name}`)
    }
  }

  const reportText = formatRunReport(report)
  writeFileSync(join(outDir, 'run-report.txt'), `${reportText}\n`)
  const summary = summaryText({ o, from, to, pass, reasons, crashes, crashCount, railsBroken, report, capped, ticks, shots, stoppedEarly: now < endMs, monthCap, sessions })
  const summaryPath = join(outDir, 'summary.md')
  writeFileSync(summaryPath, summary)
  return { summaryPath, pass, reasons, sessions, crashes: crashCount, railsBroken, spentUsd: capped.spentUsd, stoppedAtCap: capped.reached, ticks, report }
}

function listShots(dir: string, projectId: string): string[] {
  const folder = join(dir, 'projects', projectId, 'shots')
  if (!existsSync(folder)) return []
  return readdirSync(folder)
    .filter((f) => f.endsWith('.png'))
    .sort()
    .map((f) => join(folder, f))
}

interface SummaryInput {
  o: FastForwardOptions
  from: string
  to: string
  pass: boolean
  reasons: string[]
  crashes: Crash[]
  crashCount: number
  railsBroken: string[]
  report: RunReport
  capped: { spentUsd: number; refused: number }
  ticks: number
  shots: string[]
  stoppedEarly: boolean
  monthCap: number
  sessions: SessionSummary | null
}

/** What the build worker's session handler did in the run. */
interface SessionStats {
  runs: { projectId: string; usd: number }[]
  failures: string[]
  waited: number
}

export interface SessionSummary {
  count: number
  totalUsd: number
  perSessionUsd: number
  maxUsd: number
  made: string[]
  changed: string[]
  failures: string[]
}

/** Wraps the session handler to count what each job came to: the cost of its calls, the project, and why one failed or waited. */
function countSessions(inner: BuildHandler, stats: SessionStats): BuildHandler {
  return async (job, ctx) => {
    const out = await inner(job, ctx)
    if (out.status === 'done') stats.runs.push({ projectId: out.extra?.projectId ?? '?', usd: (out.extra?.calls ?? []).reduce((n, c) => n + c.usd, 0) })
    else if (out.status === 'failed') stats.failures.push(`${out.extra?.projectId ?? 'a new project'}: ${out.reason ?? 'failed'}`)
    else stats.waited++
    return out
  }
}

function sessionSummary(stats: SessionStats, before: ReadonlySet<string>, dir: string): SessionSummary {
  const ids = [...new Set(stats.runs.map((r) => r.projectId))]
  const total = stats.runs.reduce((n, r) => n + r.usd, 0)
  const names = (list: string[]) => list.map((id) => readProject(dir, id)?.name ?? id)
  return {
    count: stats.runs.length,
    totalUsd: total,
    perSessionUsd: stats.runs.length ? total / stats.runs.length : 0,
    maxUsd: stats.runs.reduce((m, r) => Math.max(m, r.usd), 0),
    made: names(ids.filter((id) => !before.has(id))),
    changed: names(ids.filter((id) => before.has(id))),
    failures: stats.failures,
  }
}

function summaryText(s: SummaryInput): string {
  const r = s.report
  const sum = (k: 'failedCalls' | 'refusals' | 'planRejections' | 'guardStops') => r.ticks.reduce((n, d) => n + d[k], 0)
  // Repeats: titles made twice (ignoring a trailing number or "again"), and a step started 3 or more times in one day.
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\b(again|\d+)\b/g, '').replace(/\s+/g, ' ').trim()
  const titles = new Map<string, number>()
  for (const m of r.made.items) titles.set(norm(m.title), (titles.get(norm(m.title)) ?? 0) + 1)
  const repeatedTitles = [...titles].filter(([, n]) => n > 1)
  const repeatedSteps: string[] = []
  for (const date of r.days) {
    const path = join(s.o.dir, 'mind/ticks', `${date}.jsonl`)
    if (!existsSync(path)) continue
    const started = new Map<string, Set<string>>()
    for (const text of readFileSync(path, 'utf8').split('\n')) {
      try {
        const l = JSON.parse(text) as { stepAfter?: { verb: string; targetId?: string; startedAt: string } | null }
        if (!l.stepAfter) continue
        const key = `${l.stepAfter.verb} ${l.stepAfter.targetId ?? ''}`.trim()
        started.set(key, (started.get(key) ?? new Set()).add(l.stepAfter.startedAt))
      } catch {
        // A line that does not parse is skipped.
      }
    }
    for (const [key, times] of started) if (times.size >= 3) repeatedSteps.push(`${date}: ${key} (${times.size} times)`)
  }

  const out: string[] = []
  out.push(`# Fast-forward: ${s.pass ? 'PASS' : 'FAIL'}`, '')
  out.push(`- Engine: ${s.o.engine}`)
  out.push(`- World: ${s.o.dir}`)
  out.push(`- Simulated: ${s.from} to ${s.to} (${s.o.days} days asked${s.stoppedEarly ? ', stopped early' : ''}), ${s.ticks} ticks`)
  out.push(`- Spent: $${s.capped.spentUsd.toFixed(3)} of a $${s.o.capUsd} cap${s.capped.refused ? ` (${s.capped.refused} calls refused at the cap)` : ''}; the daily pace is $${(s.monthCap / daysInMonth(s.from)).toFixed(2)}`)
  out.push('')
  if (!s.pass) {
    out.push('## Why it failed', '')
    for (const x of s.reasons) out.push(`- ${x}`)
    out.push('')
  }
  out.push(`## Crashes: ${s.crashCount}`, '')
  for (const c of s.crashes) out.push(`- ${c.at}: ${c.message}`)
  out.push('', `## Rails broken: ${s.railsBroken.length}`, '')
  for (const x of s.railsBroken.slice(0, 20)) out.push(`- ${x}`)
  out.push('', '## Rejections and failures', '')
  out.push(`- Plans turned down: ${sum('planRejections')}`)
  out.push(`- Failed calls: ${sum('failedCalls')} (refused by the model: ${sum('refusals')})`)
  out.push(`- The month's guard stopped a call: ${sum('guardStops')}`)
  out.push('', '## Repeats', '')
  if (!repeatedTitles.length && !repeatedSteps.length) out.push('- none')
  for (const [t, n] of repeatedTitles) out.push(`- "${t}" made ${n} times`)
  for (const x of repeatedSteps) out.push(`- ${x}`)
  out.push('', '## Spend per simulated day', '')
  for (const d of r.spend.byDay) out.push(`- ${d.date}: ${d.usd === null ? 'unknown' : `$${d.usd.toFixed(3)}`}`)
  if (s.sessions) {
    const b = s.sessions
    out.push('', `## Build sessions: ${b.count}`, '')
    out.push(`- Cost: $${b.totalUsd.toFixed(3)} in all, $${b.perSessionUsd.toFixed(3)} a session, the dearest $${b.maxUsd.toFixed(3)} (a session over $${SESSION_FAIL_USD} fails the run: Roman's rule of 18 November 2026 for the live server)`)
    out.push(`- Projects made: ${b.made.length ? b.made.join(', ') : 'none'}; changed: ${b.changed.length ? b.changed.join(', ') : 'none'}`)
    out.push(`- Session failures: ${b.failures.length}`)
    for (const f of b.failures.slice(0, 10)) out.push(`  - ${f}`)
  }
  out.push('', `## What got made: ${r.made.items.length}${r.made.scrapped ? ` (and ${r.made.scrapped} scrapped)` : ''}`, '')
  for (const m of r.made.items) out.push(`- ${m.at.slice(0, 16)} ${m.kind}: ${m.title}`)
  for (const c of r.shape) out.push(`- ${c.at.slice(0, 16)} ${c.verb} ${c.placeName}: ${c.summary}`)
  out.push('', `## Screenshots: ${s.shots.length}`, '')
  if (!s.shots.length) out.push('- none (nothing with a picture was made)')
  for (const p of s.shots) out.push(`- ${p}`)
  out.push('', 'The full run report is in run-report.txt beside this file.', '')
  return out.join('\n')
}
