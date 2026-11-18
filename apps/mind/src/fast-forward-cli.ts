import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { TOTAL_CAP_USD } from '@forkling/schema'
import { localDate } from '@forkling/sim'
import Anthropic from '@anthropic-ai/sdk'
import { createBrowserChecker } from './builds/browser-check.ts'
import { createSandbox } from './builds/sandbox-run.ts'
import { anthropicSessionModel } from './builds/session.ts'
import { hasCredentials } from './credentials.ts'
import { fakeFetch, fakeModel, fakeSandbox, fakeSessionModel } from './fast-forward-fakes.ts'
import { localMidnight, remotesOf, runFastForward } from './fast-forward.ts'
import { anthropicClient } from './llm.ts'
import { loadSpecies } from './species.ts'

const USAGE = `usage: pnpm --filter @forkling/mind fast-forward (--world <copy> | --clone-from <url> [--world <new dir>]) [--days 7] [--cap 3] [--start <YYYY-MM-DD>] [--out <dir>] [--sessions] [--dry-run]

The fast-forward test: createLoop and the build worker on a fake clock over a throwaway copy of a world, real Haiku and
Sonnet calls through the budget guard with a hard cap for the run, the real web allowlist and fetcher (read-only). At the
end it writes the run report and a short summary (path printed). Exit code 0 on a pass.

  --world       a copy with no git remote (it refuses one that has a remote; nothing can be pushed)
  --clone-from  clone this into a new directory first and remove its origin (into --world if given, else a temp dir)
  --days        simulated days (default 7)
  --cap         the most the run may spend, in US dollars (default 3)
  --start       the local date the run starts at midnight (default tomorrow in the world's time zone)
  --out         where the summary goes (default a new temp dir)
  --sessions    give the loop build sessions (step 4): the build verb is on, and sessions run in this process with a local browser, not the
                sandbox unit. They count against --cap, and a session over $1 fails the run (Roman's rule of 18 November). Default off
  --dry-run     a smoke run with a fake model and a fake web: no key needed, nothing spent

The model key comes from ANTHROPIC_API_KEY; without it only --dry-run runs.`

const engineRoot = fileURLToPath(new URL('../../..', import.meta.url))

/** The engine commit this runs on, marked dirty when the working tree has changes. */
function engineCommit(): string {
  try {
    const sha = execFileSync('git', ['-C', engineRoot, 'rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim()
    const dirty = execFileSync('git', ['-C', engineRoot, 'status', '--porcelain'], { encoding: 'utf8' }).trim() !== ''
    return `${sha}${dirty ? '-dirty' : ''}`
  } catch {
    return 'unknown'
  }
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      world: { type: 'string' },
      'clone-from': { type: 'string' },
      days: { type: 'string', default: '7' },
      cap: { type: 'string', default: '3' },
      start: { type: 'string' },
      out: { type: 'string' },
      sessions: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })
  if (values.help) {
    console.log(USAGE)
    return 0
  }
  const days = Number(values.days)
  const cap = Number(values.cap)
  if (!Number.isInteger(days) || days < 1 || days > 31) throw new Error(`--days is a whole number from 1 to 31\n\n${USAGE}`)
  if (!Number.isFinite(cap) || cap <= 0 || cap > TOTAL_CAP_USD) throw new Error(`--cap is dollars, more than 0 and at most ${TOTAL_CAP_USD}\n\n${USAGE}`)
  const dryRun = values['dry-run']
  if (!dryRun && !hasCredentials(process.env)) throw new Error('no ANTHROPIC_API_KEY: set it for a real run, or pass --dry-run for a smoke run with the fakes')

  const base = process.env.INIT_CWD ?? process.cwd()
  let dir: string
  if (values['clone-from']) {
    dir = values.world ? resolve(base, values.world) : join(mkdtempSync(join(tmpdir(), 'forkling-ff-world-')), 'world')
    if (existsSync(dir) && values.world) throw new Error(`${dir} already exists: --clone-from makes a fresh copy`)
    console.log(`cloning into ${dir}`)
    execFileSync('git', ['clone', '--quiet', values['clone-from'], dir], { stdio: 'inherit' })
    execFileSync('git', ['-C', dir, 'remote', 'remove', 'origin'])
  } else {
    if (!values.world) throw new Error(`--world or --clone-from is required\n\n${USAGE}`)
    dir = resolve(base, values.world)
    if (!existsSync(join(dir, 'forkling.json'))) throw new Error(`${dir} is not a world (no forkling.json)`)
  }
  const remotes = remotesOf(dir)
  if (remotes.length) throw new Error(`${dir} has a git remote (${remotes.join(', ')}). Fast-forward runs only on a copy with none: remove it yourself, or use --clone-from`)

  const forkling = JSON.parse(readFileSync(join(dir, 'forkling.json'), 'utf8')) as { species?: string; timezone?: string }
  const timezone = forkling.timezone ?? 'Europe/Stockholm'
  const species = loadSpecies(forkling.species ?? 'cat')
  const startDate = values.start ?? localDate(timezone, Date.now() + 86_400_000)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error('--start is a date, like 2026-11-20')
  const outDir = values.out ? resolve(base, values.out) : mkdtempSync(join(tmpdir(), 'forkling-fast-forward-'))
  const engine = engineCommit()

  console.log(`${dryRun ? 'dry run (fake model, fake web)' : 'real run'}${values.sessions ? ' with build sessions' : ''}: ${days} days from ${startDate}, cap $${cap}, engine ${engine}`)
  const result = await runFastForward({
    dir,
    days,
    capUsd: cap,
    startMs: localMidnight(timezone, startDate),
    llm: dryRun ? fakeModel({ build: values.sessions }) : anthropicClient(),
    ...(values.sessions ? { sessions: dryRun ? { model: fakeSessionModel(), sandbox: fakeSandbox() } : { model: anthropicSessionModel(new Anthropic()), sandbox: createSandbox() } } : {}),
    fetchImpl: dryRun ? fakeFetch : (url, init) => fetch(url, init),
    workCheck: createBrowserChecker(),
    pack: species.pack,
    behaviors: species.behaviors,
    speciesPersona: species.persona,
    engine: `${engine}${dryRun ? ' (dry run)' : ''}`,
    outDir,
    log: (line) => console.log(line),
  })
  console.log(`\n${result.pass ? 'PASS' : 'FAIL'}${result.reasons.length ? `: ${result.reasons.join('; ')}` : ''}`)
  console.log(`spent $${result.spentUsd.toFixed(3)}, ${result.ticks} ticks, ${result.crashes} crashes, ${result.railsBroken.length} rails broken`)
  console.log(`summary: ${result.summaryPath}`)
  return result.pass ? 0 : 1
}

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(2)
  },
)
