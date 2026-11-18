import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, realpathSync } from 'node:fs'
import { join } from 'node:path/posix'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { withPolicy } from './builds/sandbox.ts'
import { createSocketSandbox, SANDBOX_SOCKET, SECRET_NAME, SERVER_PATHS, type SocketSandbox, type SandboxRun } from './builds/sandbox-run.ts'

/**
 * `pnpm --filter @forkling/mind sandbox-proof` (spec v4 step 3, tests 4 to 9), run on the server as the mind's user once the
 * sandbox unit is installed. It asks the unit, through its socket, to run pages and probes, prints one PASS or FAIL line per test
 * and ends with a non-zero code on any FAIL. It prints no file's contents and no environment value, only whether a thing could be
 * done. Every file it names is first checked to exist from here, so a path that is not there cannot pass as "could not read".
 */

export interface ProofLine {
  test: string
  pass: boolean
  what: string
  detail: string
}

export interface ProofDeps {
  sandbox: SocketSandbox
  /** The real paths on the server (deploy/setup.sh, the W3 and W4 runbooks). */
  envFile: string
  world: string
  engine: string
  scratch: string
  /** The mind service's process id (`systemctl show -p MainPID --value forkling-mind`). */
  mindPid: number | null
  /** The user id of forkling-build (`id -u forkling-build`). */
  buildUid: number | null
  exists(path: string): boolean
  /** The names in the scratch folder, or null when it cannot be listed. */
  listScratch(): string[] | null
  mindActive(): boolean
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

const page = (body: string) => withPolicy(`<!doctype html><html><head><meta charset="utf-8"><title>proof</title></head><body style="margin:0">${body}</body></html>`)
const PROOF_PATH = 'works/proof/index.html'
const one = (html: string) => ({ files: new Map([[PROOF_PATH, Buffer.from(html, 'utf8')]]), frame: PROOF_PATH })

export const PROOF_PAGES = {
  draws: page(`<canvas id="c" width="480" height="360"></canvas><script>const g = document.getElementById('c').getContext('2d'); g.fillStyle = '#123'; g.fillRect(0, 0, 480, 360); g.fillStyle = '#f80'; g.fillRect(40, 40, 160, 120)</script>`),
  /** Test 4: it tries to load an image from example.com and says what happened, as a console line. */
  image: page(`<canvas id="c" width="480" height="360"></canvas><script>const g = document.getElementById('c').getContext('2d'); g.fillStyle = '#345'; g.fillRect(0, 0, 480, 360); g.fillStyle = '#fff'; g.fillRect(10, 10, 50, 50); const i = new Image(); i.onload = () => console.error('img:reached'); i.onerror = () => console.error('img:blocked'); i.src = 'https://example.com/pixel.png'</script>`),
  loop: page(`<script>while (true) {}</script>`),
  /** Test 8: it takes memory and never stops, even when one allocation fails. */
  memory: page(`<script>const hoard = []; while (true) { try { hoard.push(new Float64Array(4000000).fill(1)) } catch { hoard.push(Array.from({ length: 100000 }, (_, i) => ({ i }))) } }</script>`),
} as const

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const line = (test: string, pass: boolean, what: string, detail: string): ProofLine => ({ test, pass, what, detail })

/** Runs the proof. Never throws for what the sandbox does: each test is a line. */
export async function runProof(d: ProofDeps): Promise<ProofLine[]> {
  const now = d.now ?? Date.now
  const sleep = d.sleep ?? delay
  const lines: ProofLine[] = []
  const runOf = async (html: string): Promise<{ run: SandboxRun; ms: number }> => {
    const started = now()
    const run = await d.sandbox.run(one(html))
    return { run, ms: now() - started }
  }

  // 0. The browser starts in the unit, as forkling-build, with no key in its environment.
  const who = await d.sandbox.probe({ read: [], write: [], connect: [], browser: true })
  if (!who) lines.push(line('0', false, 'the unit answers a probe', 'no answer: is forkling-sandbox.socket running, and is the runner deployed?'))
  else {
    const secrets = who.envNames.filter((n) => SECRET_NAME.test(n))
    const asBuild = d.buildUid !== null && who.uid === d.buildUid
    lines.push(
      line('0', who.browser === 'ok' && asBuild && secrets.length === 0, 'the browser starts in the unit, as forkling-build, with its own sandbox on and no key in its environment', `browser: ${who.browser}; uid ${who.uid} (forkling-build is ${d.buildUid}); environment names: ${who.envNames.join(' ')}`),
    )
  }
  const draws = await runOf(PROOF_PAGES.draws)
  lines.push(line('0', draws.run.sandboxed && draws.run.rendered && !!draws.run.screenshotPng && !draws.run.blank && draws.run.errors.length === 0, 'a page that draws runs and is photographed', `rendered ${draws.run.rendered}, screenshot ${draws.run.screenshotPng ? `${draws.run.screenshotPng.length} bytes` : 'none'}, blank ${draws.run.blank}, errors ${JSON.stringify(draws.run.errors)}`))

  // 4. A page cannot reach example.com, and no connection can be opened from the unit at all.
  const image = await runOf(PROOF_PAGES.image)
  const net = await d.sandbox.probe({ read: [], write: [], connect: ['example.com:443', '93.184.215.14:443', '1.1.1.1:443', '1.1.1.1:53', '127.0.0.1:8787'], browser: false })
  const blocked = image.run.consoleErrors.some((l) => l.includes('img:blocked')) && !image.run.consoleErrors.some((l) => l.includes('img:reached'))
  const opened = net?.connect.filter((c) => c.connected).map((c) => c.target) ?? null
  lines.push(line('4', blocked && opened !== null && opened.length === 0, 'a page gets nothing from example.com, and the unit cannot open any connection', `image: ${JSON.stringify(image.run.consoleErrors)}; connections opened: ${opened === null ? 'no probe answer' : JSON.stringify(opened)}`))

  // 5. It cannot read the keys file, the world's .git/config, the mind's environment or the engine's folder.
  const targets = [d.envFile, join(d.world, '.git/config'), ...(d.mindPid ? [`/proc/${d.mindPid}/environ`] : []), join(d.engine, 'package.json')]
  const absent = targets.filter((t) => !d.exists(t))
  const reads = await d.sandbox.probe({ read: targets, write: [], connect: [], browser: false })
  const readable = reads?.read.filter((r) => r.readable).map((r) => r.path) ?? null
  lines.push(
    line('5', d.mindPid !== null && absent.length === 0 && readable !== null && readable.length === 0, "it cannot read the keys file, the world's .git/config, the mind's /proc environ or the engine", `targets: ${targets.join(', ')}; missing from here: ${JSON.stringify(absent)}${d.mindPid === null ? ' (no mind process id)' : ''}; readable from the unit: ${readable === null ? 'no probe answer' : JSON.stringify(readable)}`),
  )

  // 6. It cannot write outside its scratch folder (and can inside it, so the probe is known to work).
  const stamp = `sandbox-proof-${now()}.tmp`
  const outside = [join(d.world, stamp), join(d.engine, stamp), `/opt/forkling/sandbox/${stamp}`, `/etc/${stamp}`, `/var/lib/forkling-build/${stamp}`, `/usr/local/${stamp}`]
  const inside = join(d.scratch, stamp)
  const writes = await d.sandbox.probe({ read: [], write: [...outside, inside], connect: [], browser: false })
  const wroteOutside = writes?.write.filter((w) => w.writable && w.path !== inside).map((w) => w.path) ?? null
  const wroteInside = writes?.write.find((w) => w.path === inside)?.writable ?? false
  lines.push(line('6', wroteOutside !== null && wroteOutside.length === 0 && wroteInside, 'it cannot write outside its scratch folder', `written outside: ${wroteOutside === null ? 'no probe answer' : JSON.stringify(wroteOutside)}; scratch writable: ${wroteInside}`))

  // 7. An endless loop is stopped, and the call says timedOut.
  const loop = await runOf(PROOF_PAGES.loop)
  lines.push(line('7', loop.run.timedOut && loop.ms <= 45_000, 'a page with an endless loop is stopped and the call returns timedOut', `timedOut ${loop.run.timedOut}, after ${Math.round(loop.ms / 1000)} s`))

  // 8. Memory without end is stopped at the limit, and the mind service keeps running.
  const memory = await runOf(PROOF_PAGES.memory)
  const after = await runOf(PROOF_PAGES.draws)
  const active = d.mindActive()
  lines.push(
    line('8', (memory.run.crashed || memory.run.timedOut) && active && after.run.rendered && !!after.run.screenshotPng, 'a page that takes memory without end is stopped, the mind keeps running, and the next run works', `crashed ${memory.run.crashed}, timedOut ${memory.run.timedOut}, errors ${JSON.stringify(memory.run.errors)}, after ${Math.round(memory.ms / 1000)} s; mind active: ${active}; next run drew: ${after.run.rendered}`),
  )

  // 9. After the runs the scratch folder is empty (the unit's ExecStopPost runs just after the answer, so give it a moment).
  let left = d.listScratch()
  for (let i = 0; i < 10 && left !== null && left.length > 0; i++) {
    await sleep(500)
    left = d.listScratch()
  }
  lines.push(line('9', left !== null && left.length === 0, 'after the runs the scratch folder is empty', left === null ? `${d.scratch} cannot be listed from here` : `left: ${JSON.stringify(left)}`))
  return lines
}

export const formatProof = (lines: ProofLine[]) => lines.map((l) => `${l.pass ? 'PASS' : 'FAIL'} ${l.test} ${l.what}\n     ${l.detail}`).join('\n')

const quiet = (file: string, args: string[]): string | null => {
  try {
    return execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      socket: { type: 'string', default: SANDBOX_SOCKET },
      world: { type: 'string', default: SERVER_PATHS.world },
      'env-file': { type: 'string', default: SERVER_PATHS.envFile },
      engine: { type: 'string', default: SERVER_PATHS.engine },
      scratch: { type: 'string', default: '/var/lib/forkling-build/scratch' },
    },
  })
  if (!existsSync(values.socket)) {
    console.log(`FAIL all: there is no sandbox socket at ${values.socket}. Install and start forkling-sandbox.socket first (docs/spec/v4/step-3-runbook.md).`)
    process.exit(1)
  }
  const pid = Number(quiet('systemctl', ['show', '-p', 'MainPID', '--value', 'forkling-mind']))
  const uid = Number(quiet('id', ['-u', 'forkling-build']))
  const lines = await runProof({
    sandbox: createSocketSandbox({ socketPath: values.socket }),
    envFile: values['env-file'],
    world: values.world,
    engine: values.engine,
    scratch: values.scratch,
    mindPid: Number.isInteger(pid) && pid > 0 ? pid : null,
    buildUid: Number.isInteger(uid) && uid > 0 ? uid : null,
    exists: existsSync,
    listScratch: () => {
      try {
        return readdirSync(values.scratch)
      } catch {
        return null
      }
    },
    mindActive: () => quiet('systemctl', ['is-active', 'forkling-mind']) === 'active',
  })
  console.log(formatProof(lines))
  const failed = lines.filter((l) => !l.pass).length
  console.log(failed === 0 ? `sandbox-proof: all ${lines.length} passed` : `sandbox-proof: ${failed} of ${lines.length} failed`)
  process.exit(failed === 0 ? 0 : 1)
}

// Compared after resolving symlinks, as Node resolves them for the main module.
if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  })
}
