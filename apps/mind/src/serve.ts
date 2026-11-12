import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { createBuildWorker } from './build-worker.ts'
import { createBrowserChecker } from './builds/browser-check.ts'
import { createGithubClient, repoFromUrl } from './builds/github.ts'
import { createTinkerHandler } from './builds/tinker-job.ts'
import { hasCredentials } from './credentials.ts'
import { buildHealthResponse } from './health-response.ts'
import { anthropicClient } from './llm.ts'
import { createMindServer, DEFAULT_PORT } from './server.ts'
import { loadSpecies } from './species.ts'
import { commitAndPush, gitRunner } from './tick/git.ts'
import { createLoop } from './tick/loop.ts'
import { cloneRunner, ensureWorld } from './world-dir.ts'

const USAGE = `usage: pnpm --filter @forkling/mind serve --world <dir> --pages-origin <origin> [--repo <url>] [--port ${DEFAULT_PORT}] [--no-git] [--no-llm]

  --world         the world repo to run (or FORKLING_WORLD)
  --pages-origin  the only browser origin the server answers: Merge's Pages address (or FORKLING_PAGES_ORIGIN)
  --repo          clone the world from here if the disk has none (or FORKLING_REPO_URL)
  --port          the loopback port Caddy forwards to (default ${DEFAULT_PORT}, or PORT)
  --no-git        never commit or push (a local try-out)
  --no-llm        run without ever calling the model

Keys come from the environment only: ANTHROPIC_API_KEY, and GITHUB_TOKEN for reading api.github.com.`

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

  const speciesId = (JSON.parse(readFileSync(join(dir, 'forkling.json'), 'utf8')) as { species?: string }).species ?? 'cat'
  const species = loadSpecies(speciesId)
  const llm = values['no-llm'] || !hasCredentials(env) ? null : anthropicClient()
  if (!llm) console.log('no model calls: no key, or --no-llm')
  const git = values['no-git'] ? null : gitRunner(dir)
  // Checks a sketch in a browser (spec 7.3). It starts one only when a sketch is made.
  const workCheck = createBrowserChecker()

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
      web: env.GITHUB_TOKEN ? { authorization: { 'api.github.com': `Bearer ${env.GITHUB_TOKEN}` } } : {},
      engine: env.FORKLING_REF ?? 'dev',
    },
  })
  // A full work needs a key (the call), a browser (the check) and the GitHub token (the pull request); without them it waits.
  const repo = env.FORKLING_GITHUB_REPO ?? repoFromUrl(values.repo ?? env.FORKLING_REPO_URL ?? '')
  const github = env.GITHUB_TOKEN && repo ? createGithubClient({ token: env.GITHUB_TOKEN, repo }) : null
  if (!github) console.log('the build worker has no jobs: it needs GITHUB_TOKEN and the world repository (FORKLING_REPO_URL or FORKLING_GITHUB_REPO)')
  const worker = createBuildWorker({ dir, now: Date.now, handlers: github ? { tinker: createTinkerHandler({ dir, llm, checker: workCheck, github, now: Date.now }) } : {} })

  const server = createMindServer({ now: () => loop.now(), health: () => buildHealthResponse(dir, Date.now()), pagesOrigin })
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
