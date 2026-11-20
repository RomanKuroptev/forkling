import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WorkChecker } from '@forkling/mind/src/builds/browser-check.ts'
import { fakeModel } from '@forkling/mind/src/fast-forward-fakes.ts'
import { localMidnight, runFastForward } from '@forkling/mind/src/fast-forward.ts'
import { loadSpecies } from '@forkling/mind/src/species.ts'
import { snapshotFetch } from '@forkling/mind/src/web/snapshot.ts'
import { hashString, localDate } from '@forkling/sim'
import { type Finding, SEVERITY_ORDER } from '../report/finding.ts'
import { repoRoot } from '../paths.ts'
import { didNotRun } from '../run/check.ts'
import { readRun } from './read-run.ts'
import { type Scenario, scenarioAnswers } from './scenarios.ts'
import { type Levels, type Score, scoreRun } from './score.ts'
import { writeRunWeb } from './sources.ts'
import { writeBehaviour } from './write.ts'

/**
 * `pnpm qa behaviour` (QB.3): K fast-forward runs one after another, each on a fresh copy of the start world with its own world
 * seed and start date, then scores them and writes one report with the spread between seeds. Fake runs go in this process
 * on the scripted fakes; real runs call the mind's own fast-forward command, each seed under cap/K. Both read the web snapshot
 * and keep their prompts. A live run scores a read-only clone of Merge's repo instead. Nothing here writes to Merge's repo.
 */

export const MERGE_REPO = 'https://github.com/RomanKuroptev/merge'
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
/** The run cap of a fake run. The fakes cost nothing real, but the fast-forward prices their calls as if they did (about $0.14 a simulated day), and a $1 cap stopped the first 30-day run on Actions after 7 days. */
export const FAKE_RUN_CAP_USD = 100

export interface SeedRun {
  label: string
  world: string
  outDir: string
  /** The run's first day. Scores never count the start world's days before it. Absent for a live world. */
  from?: string
}

export interface BehaviourOptions {
  mode: 'fake' | 'real'
  days: number
  seeds: number
  /** The whole run's cap; each seed gets cap / seeds. Real runs only. */
  capUsd: number
  /** The start world; it is copied for every seed. */
  world: string
  outRoot: string
  snapshot: string
  scenario?: Scenario
  sessions?: boolean
  /** The first seed's start date; seed k starts k days later. Default: the start world's own clock (`qa.json` `now`), else tomorrow. Never a day the world has already logged (see `runStart`). */
  start?: string
  /** For real runs: an env file with the model key. */
  envFile?: string
  /** A shorter fake run, for tests. */
  durationMs?: number
  log?: (line: string) => void
}

/** The start world when none is given: lane W's `day-0` fixture, the fresh start (steps.md fact 5). */
export const day0 = (): string => join(repoRoot(), 'test', 'fixtures', 'worlds', 'day-0')

/**
 * A fresh copy of the world for one seed, with its own world seed. The copy's `.git` is left out, and the copy becomes a new,
 * empty repository with no remote: inside this checkout (`qa-out/`), git would otherwise find the engine repo and its `origin`,
 * and the fast-forward rightly refuses a world that could be pushed.
 */
export function seedWorld(from: string, to: string, k: number): void {
  cpSync(from, to, { recursive: true, filter: (src) => !/[\\/]\.git([\\/]|$)/.test(src) })
  execFileSync('git', ['init', '--quiet', to])
  const path = join(to, 'forkling.json')
  const f = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  f.seed = hashString(`qa-behaviour-seed-${k}`)
  writeFileSync(path, `${JSON.stringify(f, null, 2)}\n`)
}

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/** The folders where a world logs its days, one dated file a day. */
const DATED = ['memory/stream', 'mind/ticks', 'notebook/plans', 'journal']

/** The last day the world has logged anything (a stream, a tick log, a plan, a diary page), or null for a fresh world. */
export function lastLoggedDay(world: string): string | null {
  let last: string | null = null
  for (const rel of DATED) {
    const dir = join(world, rel)
    if (!existsSync(dir)) continue
    for (const f of readdirSync(dir)) {
      const date = /^(\d{4}-\d{2}-\d{2})\.(jsonl|md)$/.exec(f)?.[1]
      if (date && (!last || date > last)) last = date
    }
  }
  return last
}

/**
 * The first day of a run: the given start, else the fixture's own clock (`qa.json` `now`), else tomorrow; and never earlier than
 * the day after the world's last logged day. A run that starts inside the world's past writes into its old files, its scores count
 * the old days as the run's, and Merge reads pages dated in its own future.
 */
export function runStart(world: string, timezone: string, given: string | undefined, nowMs: number): string {
  let start = given
  if (!start) {
    const qaPath = join(world, 'qa.json')
    const clock = existsSync(qaPath) ? Date.parse(String((JSON.parse(readFileSync(qaPath, 'utf8')) as { now?: unknown }).now ?? '')) : Number.NaN
    start = localDate(timezone, Number.isNaN(clock) ? nowMs + 86_400_000 : clock)
  }
  const last = lastLoggedDay(world)
  const floor = last ? addDays(last, 1) : null
  return floor && floor > start ? floor : start
}

const checker: WorkChecker = { check: async () => ({ ok: true, reasons: [], thumb: PNG }), available: async () => true, close: async () => undefined }

export async function runSeeds(o: BehaviourOptions): Promise<SeedRun[]> {
  const log = o.log ?? (() => undefined)
  const forkling = JSON.parse(readFileSync(join(o.world, 'forkling.json'), 'utf8')) as { timezone?: string }
  const timezone = forkling.timezone ?? 'Europe/Stockholm'
  const start = runStart(o.world, timezone, o.start, Date.now())
  const runs: SeedRun[] = []
  for (let k = 0; k < o.seeds; k++) {
    const label = `seed-${k}`
    const dir = join(o.outRoot, label)
    const world = join(dir, 'world')
    const outDir = join(dir, 'out')
    mkdirSync(outDir, { recursive: true })
    // The run says which web it read, so the sources score counts snapshot misses apart (they are not missing pages).
    writeRunWeb(outDir, o.snapshot)
    seedWorld(o.world, world, k)
    const startDate = addDays(start, k)
    log(`${label}: ${o.mode} run, ${o.days} days from ${startDate}${o.mode === 'real' ? `, cap $${(o.capUsd / o.seeds).toFixed(2)}` : ''}`)
    if (o.mode === 'fake') {
      const cat = loadSpecies('cat')
      await runFastForward({
        dir: world,
        days: o.days,
        capUsd: FAKE_RUN_CAP_USD,
        startMs: localMidnight(timezone, startDate),
        ...(o.durationMs ? { durationMs: o.durationMs } : {}),
        llm: fakeModel({ answers: scenarioAnswers(o.scenario ?? 'plain') }),
        fetchImpl: snapshotFetch(o.snapshot),
        realSleep: async () => undefined,
        workCheck: checker,
        pack: cat.pack,
        behaviors: cat.behaviors,
        speciesPersona: cat.persona,
        engine: `qa fake ${o.scenario ?? 'plain'}`,
        outDir,
        capturePrompts: true,
      })
    } else {
      const cli = join(repoRoot(), 'apps/mind/src/fast-forward-cli.ts')
      const args = [
        ...(o.envFile ? [`--env-file=${o.envFile}`] : []),
        cli,
        '--world', world,
        '--days', String(o.days),
        '--cap', (o.capUsd / o.seeds).toFixed(2),
        '--start', startDate,
        '--out', outDir,
        '--capture-prompts',
        '--web-snapshot', o.snapshot,
        ...(o.sessions ? ['--sessions'] : []),
      ]
      // A failed run is still scored: the fast-forward's own verdict is in its summary.
      spawnSync(process.execPath, args, { stdio: 'inherit', cwd: join(repoRoot(), 'apps/mind') })
    }
    runs.push({ label, world, outDir, from: startDate })
  }
  return runs
}

/** A read-only clone of Merge's repo, made now in a temp folder and never committed. */
export function cloneLive(): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'qa-live-merge-')), 'merge')
  execFileSync('git', ['clone', '--quiet', '--depth', '1', MERGE_REPO, dir], { stdio: 'inherit' })
  return dir
}

/** One finding per id over all seeds, saying in how many seeds it showed. Info findings stay per seed. */
export function combineFindings(perSeed: { label: string; findings: Finding[] }[], runLabel: string): Finding[] {
  const out: Finding[] = []
  const byId = new Map<string, { label: string; f: Finding }[]>()
  for (const s of perSeed) {
    for (const f of s.findings) {
      if (f.severity === 'info') {
        out.push(f)
        continue
      }
      const key = f.id === 'qa.check-did-not-run' ? f.fingerprint.replace(/\|[^|]*$/, '') : f.id
      byId.set(key, [...(byId.get(key) ?? []), { label: s.label, f }])
    }
  }
  for (const [key, list] of byId) {
    const first = list[0]!.f
    const severity = SEVERITY_ORDER.find((sev) => list.some((x) => x.f.severity === sev))!
    out.push({
      ...first,
      severity,
      fingerprint: `${key}|${runLabel}`,
      fixture: runLabel,
      title: perSeed.length > 1 ? `${first.title} (${list.length} of ${perSeed.length} seeds)` : first.title,
      what: perSeed.length > 1 ? list.map((x) => `${x.label}: ${x.f.what}`).join(' ') : first.what,
      evidence: [...new Set(list.flatMap((x) => x.f.evidence))],
    })
  }
  return out
}

/** The spread between seeds: each score's value per seed, and in how many it raised its alarm. */
export function spreadTable(runs: { label: string; scores: Score[] }[]): string {
  const ids = [...new Set(runs.flatMap((r) => r.scores.map((s) => s.id)))]
  const lines = ['', '## Spread between seeds', '', `| Score | Alarms | ${runs.map((r) => r.label).join(' | ')} |`, `|---|---|${runs.map(() => '---').join('|')}|`]
  for (const id of ids) {
    const cells = runs.map((r) => r.scores.find((s) => s.id === id))
    const title = cells.find(Boolean)?.title ?? id
    lines.push(`| ${title} | ${cells.filter((c) => c?.alarm).length} of ${runs.length} | ${cells.map((c) => (c ? `${c.alarm ? '**' : ''}${c.value.replace(/\|/g, '/')}${c.alarm ? '**' : ''}` : 'did not run')).join(' | ')} |`)
  }
  return `${lines.join('\n')}\n`
}

/** Scores every run, combines, writes `<outRoot>/report.md`, `findings.json`, `scores.json`. */
export async function scoreRuns(runs: SeedRun[], levels: Levels, runLabel: string, outRoot: string, now: Date): Promise<{ findings: Finding[]; scored: { label: string; from: string; to: string; scores: Score[] }[] }> {
  const perSeed: { label: string; findings: Finding[] }[] = []
  const scored: { label: string; from: string; to: string; scores: Score[] }[] = []
  const notRun: Finding[] = []
  for (const r of runs) {
    let run: ReturnType<typeof readRun>
    try {
      run = readRun({ world: r.world, outDir: existsSync(join(r.outDir, 'summary.md')) || existsSync(join(r.outDir, 'prompts.jsonl')) ? r.outDir : null, label: r.label, ...(r.from ? { notBefore: r.from } : {}) })
    } catch (e) {
      // A seed that never ran (no key, a crash before the first tick) is a check that did not run, never a crash of the whole score.
      notRun.push({ ...didNotRun({ id: `behaviour:${runLabel}:${r.label}`, area: 'behaviour', title: `behaviour run ${runLabel} ${r.label}` }, e, now) })
      continue
    }
    const { scores, findings } = await scoreRun(run, levels, now)
    perSeed.push({ label: r.label, findings })
    scored.push({ label: r.label, from: run.from, to: run.to, scores })
  }
  const findings = [...notRun, ...combineFindings(perSeed, runLabel)]
  writeBehaviour(outRoot, scored, findings, `behaviour ${runLabel}`, spreadTable(scored))
  return { findings, scored }
}

/** The key file for a real run: the one given, else the repo root's `.env` (the file the mind's own scripts load), else none. */
export function realEnvFile(given: string | undefined, exists: (p: string) => boolean = existsSync, root: string = repoRoot()): string | undefined {
  if (given) return given
  const path = join(root, '.env')
  return exists(path) ? path : undefined
}
