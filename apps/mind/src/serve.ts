import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import Anthropic from '@anthropic-ai/sdk'
import { createBuildWorker } from './build-worker.ts'
import { createSessionHandler } from './builds/session-job.ts'
import { anthropicSessionModel } from './builds/session.ts'
import { createBrowserChecker } from './builds/browser-check.ts'
import { createLocalSandbox, createSandbox, sandboxSelfTest } from './builds/sandbox-run.ts'
import { createGithubClient, repoFromUrl } from './builds/github.ts'
import { createExpandHandler } from './builds/expand-job.ts'
import { createFoundBuildHandler } from './builds/found-build-job.ts'
import { createTinkerHandler } from './builds/tinker-job.ts'
import { BudgetLedger } from '@forkling/schema'
import { monthOf, rollLedger } from './budget.ts'
import { hasCredentials } from './credentials.ts'
import { createNotesIntake, type NotesIntake } from './notes-intake.ts'
import { createPublicNotes } from './notes.ts'
import { buildHealthResponse } from './health-response.ts'
import { anthropicClient } from './llm.ts'
import { createMindServer, DEFAULT_PORT } from './server.ts'
import { loadSpecies } from './species.ts'
import { commitAndPush, gitRunner } from './tick/git.ts'
import { createLoop } from './tick/loop.ts'
import { cloneRunner, ensureWorld } from './world-dir.ts'
import { readTools } from './world.ts'

const USAGE = `usage: pnpm --filter @forkling/mind serve --world <dir> --pages-origin <origin> [--repo <url>] [--port ${DEFAULT_PORT}] [--no-git] [--no-llm]

  --world         the world repo to run (or FORKLING_WORLD)
  --pages-origin  the only browser origin the server answers: Merge's Pages address (or FORKLING_PAGES_ORIGIN)
  --repo          clone the world from here if the disk has none (or FORKLING_REPO_URL)
  --port          the loopback port Caddy forwards to (default ${DEFAULT_PORT}, or PORT)
  --no-git        never commit or push (a local try-out)
  --no-llm        run without ever calling the model

Keys come from the environment only: ANTHROPIC_API_KEY, GITHUB_TOKEN for reading api.github.com, and TURNSTILE_SECRET to open the mailbox for visitor notes.`

/** The always-on process (spec 2.2, 14.3): the loop, the build worker and the three routes, until it is told to stop. */
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      world: { type: 'string' },
      'pages-origin': { type: 'string' },
      repo: { type: 'string' },
      port: { type: 'string' },
      'no-git': { type: 'boolean', default: false },
      'no-llm': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })
  if (values.help) return void console.log(USAGE)

  const env = process.env
  const worldArg = values.world ?? env.FORKLING_WORLD
  const pagesOrigin = values['pages-origin'] ?? env.FORKLING_PAGES_ORIGIN
  if (!worldArg || !pagesOrigin) throw new Error(`--world and --pages-origin are required\n\n${USAGE}`)
  const port = Number(values.port ?? env.PORT ?? DEFAULT_PORT)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`the port "${values.port ?? env.PORT}" is not a port`)

  const dir = resolve(env.INIT_CWD ?? process.cwd(), worldArg)
  console.log(`world: ${await ensureWorld(dir, values.repo ?? env.FORKLING_REPO_URL, cloneRunner)} (${dir})`)
  // The rail of spec v4 8: a tool of class act in mind/tools.json stops the engine here, in plain words, before anything runs.
  readTools(dir)

  const speciesId = (JSON.parse(readFileSync(join(dir, 'forkling.json'), 'utf8')) as { species?: string }).species ?? 'cat'
  const species = loadSpecies(speciesId)
  const llm = values['no-llm'] || !hasCredentials(env) ? null : anthropicClient()
  if (!llm) console.log('no model calls: no key, or --no-llm')
  const git = values['no-git'] ? null : gitRunner(dir)
  // Every page Merge wrote runs on one path (spec-v4 4): in the sandbox unit when its socket is there, in this process otherwise.
  // The self-test runs once, from inside the unit, and /health says what it found (spec-v4 step 3).
  // When the unit is there but fails its self-test, works are checked in this process as before, and a build session will not start.
  const unit = createSandbox()
  const selfTest = await sandboxSelfTest(unit, { world: dir, port })
  console.log(`sandbox: ${selfTest.status}${selfTest.reasons.length > 0 ? ` (${selfTest.reasons.join('; ')})` : ''}`)
  const sandbox = selfTest.status === 'ok' ? unit : createLocalSandbox()
  // Checks a sketch in a browser (spec 7.3). It starts one only when a sketch is made.
  const workCheck = createBrowserChecker({ sandbox })

  // Visitor notes (spec 10.1): the mailbox opens only with a Turnstile secret and a model to screen with. The screening calls are booked by the loop's next tick.
  let intake: NotesIntake | null = null
  const web = env.GITHUB_TOKEN ? { authorization: { 'api.github.com': `Bearer ${env.GITHUB_TOKEN}` } } : {}
  const loop = createLoop({
    dir,
    clock: Date.now,
    git,
    deps: {
      llm,
      pack: species.pack,
      behaviors: species.behaviors,
      speciesPersona: species.persona,
      workCheck,
      web,
      outsideCalls: () => intake?.drainCalls() ?? [],
      engine: env.FORKLING_REF ?? 'dev',
    },
  })
  // A full work needs a key (the call), a browser (the check) and the GitHub token (the pull request); without them it waits.
  const repo = env.FORKLING_GITHUB_REPO ?? repoFromUrl(values.repo ?? env.FORKLING_REPO_URL ?? '')
  const github = env.GITHUB_TOKEN && repo ? createGithubClient({ token: env.GITHUB_TOKEN, repo }) : null
  if (!github) console.log('full works wait: they need GITHUB_TOKEN and the world repository (FORKLING_REPO_URL or FORKLING_GITHUB_REPO)')
  const timezone = (JSON.parse(readFileSync(join(dir, 'forkling.json'), 'utf8')) as { timezone?: string }).timezone ?? 'Europe/Stockholm'
  // A build session (spec-v4 3.3) runs here only inside the sandbox unit: with `sandbox: missing` it refuses, and Merge is told.
  // The site's address, for the last second of a project's timelapse (sharing S4): the Pages origin and the world repo's name.
  const site = `${pagesOrigin.replace(/\/$/, '')}/${repo?.split('/')[1] ?? ''}`.replace(/\/$/, '')
  const session = createSessionHandler({ model: llm ? anthropicSessionModel(new Anthropic()) : null, sandbox, requireSandbox: true, git, now: Date.now, timezone, timelapse: { address: (id) => `${site}/projects/${id}/` } })
  const worker = createBuildWorker({ dir, now: Date.now, handlers: { expand: createExpandHandler({ dir, llm, now: Date.now }), found: createFoundBuildHandler({ dir, llm, now: Date.now }), session, ...(github ? { tinker: createTinkerHandler({ dir, llm, checker: workCheck, github, now: Date.now, web }) } : {}) } })
  if (env.TURNSTILE_SECRET && llm) {
    intake = createNotesIntake({
      dir,
      stateDir: dirname(dir),
      now: Date.now,
      timezone,
      llm,
      turnstileSecret: env.TURNSTILE_SECRET,
      placeIds: () => loop.places()?.places.map((p) => p.id) ?? ['home', 'workshop'],
      ledger: () => {
        let stored: unknown = null
        try {
          stored = JSON.parse(readFileSync(join(dir, 'brain/budget.json'), 'utf8'))
        } catch {
          // No ledger yet: an empty month.
        }
        const month = monthOf(timezone, Date.now())
        const parsed = BudgetLedger.safeParse(stored)
        return rollLedger(parsed.success ? parsed.data : BudgetLedger.parse({ month }), month)
      },
    })
    console.log('the mailbox is open: notes are screened before Merge reads them')
  } else console.log(`the mailbox is closed: ${env.TURNSTILE_SECRET ? 'no model to screen with' : 'no TURNSTILE_SECRET'}`)

  const server = createMindServer({ now: () => loop.now(), places: () => loop.places(), health: () => buildHealthResponse(dir, Date.now(), selfTest.status), ...(intake ? { notes: { submit: (body, ip) => intake!.submit(body, ip) } } : {}), publicNotes: createPublicNotes(dir, Date.now), pagesOrigin })
  await new Promise<void>((ready, fail) => {
    server.once('error', fail)
    server.listen(port, '127.0.0.1', ready)
  })
  console.log(`listening on 127.0.0.1:${port}, answering ${pagesOrigin}`)

  const buildTimer = setInterval(() => worker.tick().catch((e: unknown) => console.error('build worker:', e instanceof Error ? e.message : e)), 60_000)
  const signal = { aborted: false }
  let wake: (() => void) | undefined
  let nap: NodeJS.Timeout | undefined
  const sleep = (ms: number) =>
    new Promise<void>((done) => {
      wake = done
      nap = setTimeout(done, ms)
    })
  const stop = (name: string) => {
    if (signal.aborted) return
    console.log(`${name}: finishing the tick in progress, then saving`)
    signal.aborted = true
    clearInterval(buildTimer)
    clearTimeout(nap)
    wake?.()
  }
  process.on('SIGTERM', () => stop('SIGTERM'))
  process.on('SIGINT', () => stop('SIGINT'))

  await loop.run({ sleep, signal, onError: (e) => console.error('tick failed:', e instanceof Error ? e.message : e) })

  server.close()
  await workCheck.close()
  // The world is on disk after every tick; this sends what has not gone out yet.
  if (git) console.log(`final commit: ${await commitAndPush(git, 'chore(mind): stopped', { retryPush: loop.pushFailing })}`)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
