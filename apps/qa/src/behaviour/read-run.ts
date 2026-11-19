import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { localMidnight } from '@forkling/mind/src/fast-forward.ts'
import { buildRunReport, datesBetween, type RunReport } from '@forkling/mind/src/run-report.ts'
import { localDate } from '@forkling/sim'

/**
 * Everything the behaviour scores read from one run, as plain data: a fast-forward's output folder beside its world, or a world
 * clone alone (the live last 7 days). Reading files stays here; the measures are pure and live in `packages/sim`.
 */

export interface PromptLine {
  at: string
  kind: string
  model: string
  system: string
  user: string
  parsed: boolean | null
}

export interface StreamStep {
  at: string
  date: string
  verb: string
  text: string
}

export interface ReadPage {
  at: string
  date: string
  url: string
  title: string
  text: string
}

export interface WrittenPage {
  at: string
  date: string
  title: string
  text: string
}

export interface PlanStep {
  date: string
  verb: string
  target: string
  reason: string
}

export interface TickLine {
  at: string
  asleep: boolean
  calls: { kind: string; model: string; ok: boolean; usd: number }[]
  notes: string[]
}

/** What the fast-forward's summary.md says, when there is one. */
export interface RunSummary {
  pass: boolean
  spentUsd: number | null
  capUsd: number | null
  crashes: number
  railsBroken: string[]
  dearestSessionUsd: number | null
}

export interface RunData {
  /** A label for findings' fingerprints and the report (a seed, `r2`, `live`). */
  label: string
  world: string
  outDir: string | null
  timezone: string
  from: string
  to: string
  days: string[]
  report: RunReport
  /** Works made in range, with what Merge said each is about. */
  made: { at: string; date: string; kind: string; id: string; title: string; about: string; status: string; scrapReason: string; sources: { url: string; role: string }[] }[]
  written: WrittenPage[]
  read: ReadPage[]
  /** Every page a trip in range touched, read or not (`failed` says why not). */
  trailPages: (ReadPage & { failed: string | null })[]
  steps: StreamStep[]
  thoughts: { at: string; date: string; text: string }[]
  diary: { date: string; text: string }[]
  plans: PlanStep[]
  ticks: TickLine[]
  /** Null when the run did not keep its prompts (a live world, or a run without --capture-prompts). */
  prompts: PromptLine[] | null
  summary: RunSummary | null
  /** The `ok` and the time of each work check and build result in range. */
  builds: { id: string; kind: string; ok: boolean | null; at: string | null; workId: string | null; reasons: string[] }[]
}

const readJson = (path: string): unknown => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}
const list = (path: string): string[] => (existsSync(path) ? readdirSync(path).sort() : [])
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const jsonl = (path: string): Record<string, unknown>[] => {
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .split('\n')
    .flatMap((l) => {
      if (!l.trim()) return []
      try {
        const v = JSON.parse(l) as unknown
        return isRecord(v) ? [v] : []
      } catch {
        return []
      }
    })
}

export function parseSummary(text: string): RunSummary & { from: string | null; to: string | null } {
  const section = (name: string): string[] => {
    const lines = text.split('\n')
    const i = lines.findIndex((l) => l.startsWith(`## ${name}`))
    if (i < 0) return []
    const out: string[] = []
    for (const l of lines.slice(i + 1)) {
      if (l.startsWith('## ')) break
      if (l.startsWith('- ')) out.push(l.slice(2))
    }
    return out
  }
  const sim = /Simulated: (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})/.exec(text)
  const spent = /Spent: \$([\d.]+) of a \$([\d.]+) cap/.exec(text)
  const dearest = /the dearest \$([\d.]+)/.exec(text)
  return {
    from: sim?.[1] ?? null,
    to: sim?.[2] ?? null,
    pass: /^# Fast-forward: PASS/m.test(text),
    spentUsd: spent ? Number(spent[1]) : null,
    capUsd: spent ? Number(spent[2]) : null,
    crashes: Number(/## Crashes: (\d+)/.exec(text)?.[1] ?? 0),
    railsBroken: section('Rails broken'),
    dearestSessionUsd: dearest ? Number(dearest[1]) : null,
  }
}

/** A plan file (`notebook/plans/<date>.md`): numbered lines `1. **verb** (target), 30 min: reason`. */
export function parsePlan(date: string, text: string): PlanStep[] {
  const out: PlanStep[] = []
  for (const line of text.split('\n')) {
    const m = /^\d+\.\s+\*\*(\w+)\*\*(?:\s+\(([^)]*)\))?[^:]*:\s*(.*)$/.exec(line.trim())
    if (m) out.push({ date, verb: m[1]!, target: m[2] ?? '', reason: m[3] ?? '' })
  }
  return out
}

export interface ReadRunOptions {
  world: string
  /** The fast-forward's output folder (summary.md, prompts.jsonl). Absent for a live world. */
  outDir?: string | null
  label: string
  /** The dates to score. Default: the summary's simulated dates, else the last `lastDays` dates that have a tick log. */
  from?: string
  to?: string
  lastDays?: number
}

export function readRun(o: ReadRunOptions): RunData {
  const world = o.world
  if (!existsSync(join(world, 'forkling.json'))) throw new Error(`${world} is not a world (no forkling.json)`)
  const forkling = readJson(join(world, 'forkling.json'))
  const timezone = (isRecord(forkling) && str(forkling.timezone)) || 'Europe/Stockholm'
  const outDir = o.outDir ?? null
  const summaryPath = outDir ? join(outDir, 'summary.md') : null
  const parsedSummary = summaryPath && existsSync(summaryPath) ? parseSummary(readFileSync(summaryPath, 'utf8')) : null

  let from = o.from ?? parsedSummary?.from ?? null
  let to = o.to ?? parsedSummary?.to ?? null
  if (!from || !to) {
    const logged = list(join(world, 'mind/ticks')).filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).map((f) => f.slice(0, 10))
    if (logged.length === 0) throw new Error(`${world} has no tick logs, so there is no run to score`)
    to = logged.at(-1)!
    from = logged.at(-Math.min(o.lastDays ?? 7, logged.length))!
  }
  const days = datesBetween(from, to)
  const dayOf = (iso: string) => localDate(timezone, Date.parse(iso))
  const inRange = (iso: string) => !Number.isNaN(Date.parse(iso)) && dayOf(iso) >= from && dayOf(iso) <= to

  const report = buildRunReport(world, { from, to, git: false })

  const made: RunData['made'] = []
  for (const id of list(join(world, 'works'))) {
    const meta = readJson(join(world, 'works', id, 'meta.json'))
    if (!isRecord(meta) || !inRange(str(meta.made))) continue
    const sources = Array.isArray(meta.sources) ? meta.sources.filter(isRecord).map((s) => ({ url: str(s.url), role: str(s.role) })) : []
    made.push({ at: str(meta.made), date: dayOf(str(meta.made)), kind: str(meta.kind) || 'work', id: str(meta.id) || id, title: str(meta.title), about: str(meta.about), status: str(meta.status), scrapReason: str(meta.scrapReason), sources })
  }
  made.sort((a, b) => a.at.localeCompare(b.at))

  const written: WrittenPage[] = []
  for (const f of list(join(world, 'notebook/writing')).filter((f) => f.endsWith('.md'))) {
    const m = /^(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})/.exec(f)
    if (!m) continue
    const date = m[1]!
    if (date < from || date > to) continue
    const text = readFileSync(join(world, 'notebook/writing', f), 'utf8')
    const title = /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? f
    written.push({ at: `${date}T${m[2]}:${m[3]}`, date, title, text: text.replace(/^#.*$/m, '').trim() })
  }

  const trailPages: RunData['trailPages'] = []
  for (const f of list(join(world, 'trails')).filter((f) => f.endsWith('.json'))) {
    const t = readJson(join(world, 'trails', f))
    if (!isRecord(t) || !Array.isArray(t.pages)) continue
    for (const p of t.pages.filter(isRecord)) {
      const at = str(p.fetchedAt)
      if (!inRange(at)) continue
      trailPages.push({ at, date: dayOf(at), url: str(p.url), title: str(p.title), text: str(p.reaction), failed: str(p.failed) || null })
    }
  }
  const read = trailPages.filter((p) => !p.failed)

  const steps: StreamStep[] = []
  const thoughts: RunData['thoughts'] = []
  for (const date of days) {
    for (const l of jsonl(join(world, 'memory/stream', `${date}.jsonl`))) {
      const at = str(l.at)
      if (!inRange(at)) continue
      if (l.kind === 'step' && str(l.verb)) steps.push({ at, date: dayOf(at), verb: str(l.verb), text: str(l.text) })
      if (l.kind === 'thought' && str(l.text)) thoughts.push({ at, date: dayOf(at), text: str(l.text) })
    }
  }

  const diary: RunData['diary'] = []
  for (const date of days) {
    const path = join(world, 'journal', `${date}.md`)
    if (!existsSync(path)) continue
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#') || /^\*\d{4}-\d{2}-\d{2}\*$/.test(t)) continue
      diary.push({ date, text: t })
    }
  }

  const plans: PlanStep[] = []
  for (const date of days) {
    const path = join(world, 'notebook/plans', `${date}.md`)
    if (existsSync(path)) plans.push(...parsePlan(date, readFileSync(path, 'utf8')))
  }

  const ticks: TickLine[] = []
  for (const date of days) {
    for (const l of jsonl(join(world, 'mind/ticks', `${date}.jsonl`))) {
      const calls = Array.isArray(l.calls) ? l.calls.filter(isRecord).map((c) => ({ kind: str(c.kind), model: str(c.model), ok: c.ok === true, usd: typeof c.usd === 'number' ? c.usd : 0 })) : []
      const notes = Array.isArray(l.notes) ? l.notes.map(str).filter(Boolean) : []
      // Most ticks are quiet; keep only those with a call or a note worth reading.
      if (calls.length === 0 && notes.every((n) => n === 'no trigger, no call' || n.startsWith('asleep'))) continue
      ticks.push({ at: str(l.at), asleep: l.asleep === true, calls, notes })
    }
  }

  const promptsPath = outDir ? join(outDir, 'prompts.jsonl') : null
  const prompts: PromptLine[] | null =
    promptsPath && existsSync(promptsPath)
      ? jsonl(promptsPath).map((p) => ({ at: str(p.at), kind: str(p.kind), model: str(p.model), system: str(p.system), user: str(p.user), parsed: typeof p.parsed === 'boolean' ? p.parsed : null }))
      : null

  const builds: RunData['builds'] = []
  for (const f of list(join(world, 'mind/builds')).filter((f) => f.endsWith('.result.json'))) {
    const r = readJson(join(world, 'mind/builds', f))
    if (!isRecord(r)) continue
    const at = str(r.at) || str(r.finishedAt) || null
    if (at && !inRange(at)) continue
    const id = f.replace(/\.result\.json$/, '')
    const ok = r.status === 'done' ? true : r.status === 'failed' ? false : typeof r.ok === 'boolean' ? r.ok : null
    builds.push({ id, kind: str(r.kind) || id.split('-')[0]!, ok, at, workId: str(r.workId) || null, reasons: [str(r.reason), ...(Array.isArray(r.reasons) ? r.reasons.map(str) : [])].filter(Boolean) })
  }

  const summary = parsedSummary ? { pass: parsedSummary.pass, spentUsd: parsedSummary.spentUsd, capUsd: parsedSummary.capUsd, crashes: parsedSummary.crashes, railsBroken: parsedSummary.railsBroken, dearestSessionUsd: parsedSummary.dearestSessionUsd } : null
  return { label: o.label, world, outDir, timezone, from, to, days, report, made, written, read, trailPages, steps, thoughts, diary, plans, ticks, prompts, summary, builds }
}

/** The time of a local clock reading (`10:00`) on a local date, in ms. */
export const localTime = (timezone: string, date: string, hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number]
  return localMidnight(timezone, date) + (h * 60 + m) * 60_000
}
