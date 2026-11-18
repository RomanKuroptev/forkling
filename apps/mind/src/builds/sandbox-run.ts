import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createConnection } from 'node:net'
import { tmpdir } from 'node:os'
import { join, posix } from 'node:path'
import type { Browser } from 'playwright'
import { copyLibs, VENDORED_FILES } from '@forkling/site/libs'
import { launchChromium } from './browser.ts'
import { listProjectFiles, resolveProjectPath } from './project-files.ts'
import { workFrame } from './sandbox.ts'
import { clean, emptyPageResult, MAX_CONSOLE_LINES, READY, runPage, type PageRequest, type PageResult, type ProbeRequest, type ProbeResult, type RunnerRequest } from './sandbox-runner.ts'

/**
 * One path for every page Merge wrote (spec-v4 section 4, step 3): works in the work check and, from step 4, projects in a build
 * session. A page is a set of files served from memory, framed the way the site frames a work (spec 7.4), watched in headless
 * Chromium, and answered with its errors and a screenshot.
 *
 * On the server the browser runs in the root-owned unit behind `/run/forkling-sandbox.sock` (as `forkling-build`, no network,
 * 1 GB, 30 seconds); that client is `createSocketSandbox`. Anywhere else (Roman's PC, CI, the Actions tick) it runs in this process,
 * and says so: `sandboxed: false`. A build session never starts on an unsandboxed run (step 4).
 */

/** The page is watched this long (spec 7.3 step 2, spec-v4 3.3). */
export const RUN_MS = 5_000
/** The frame, as on the site's work pages. */
export const FRAME = { width: 480, height: 360 }
const VIEWPORT = { width: 640, height: 480 }
const CLOSE_WAIT_MS = 5_000

/** The globals a classic library defines, to tell that its script really ran. */
export const LIBRARY_GLOBALS: [string, string][] = [
  ['p5.min.js', 'p5'],
  ['Tone.js', 'Tone'],
]

export interface SandboxRun extends Omit<PageResult, 'screenshotPng'> {
  screenshotPng: Buffer | null
  /** The run went through the sandbox unit (spec-v4 4). False: in this process, with no unit around it. */
  sandboxed: boolean
  /** There was no browser to run it in, so nothing was decided. */
  unavailable?: true
}

/** The files to serve, by path, and where the watched page is among them. */
export interface PageFiles {
  files: Map<string, Buffer>
  /** Path of the page that goes in the frame, like `works/check/index.html`. */
  frame: string
}

export interface Sandbox {
  /** Whether a run goes through the sandbox unit. */
  readonly sandboxed: boolean
  /** Runs one page. One at a time: a second waits for the first. */
  run(page: PageFiles, opts?: { durationMs?: number }): Promise<SandboxRun>
  available(): Promise<boolean>
  close(): Promise<void>
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** The libraries a page may load (spec 7.1), from the vendored copies (or from `<libsDir>/lib/`, for a test), read once. */
export function libraryFiles(libsDir?: string): Map<string, Buffer> {
  const dir = libsDir ?? mkdtempSync(join(tmpdir(), 'sandbox-libs-'))
  try {
    if (!libsDir) copyLibs(dir)
    const out = new Map<string, Buffer>()
    for (const file of VENDORED_FILES) {
      try {
        out.set(file.to, readFileSync(join(dir, file.to)))
      } catch {
        // missing: the page will be told its library did not load
      }
    }
    return out
  } finally {
    if (!libsDir) rmSync(dir, { recursive: true, force: true })
  }
}

/** The page the browser opens: one frame, as the site shows a work. */
export const shellPage = (frame: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>run</title><style>body{margin:0;background:#fff}iframe{display:block;border:0;width:${FRAME.width}px;height:${FRAME.height}px}</style></head><body>${workFrame(frame, 'work')}</body></html>`

/** The request the runner gets for a page: the files, the shell and the libraries. */
export function pageRequest(page: PageFiles, libs: Map<string, Buffer>, durationMs: number): PageRequest {
  const files: Record<string, string> = {}
  for (const [path, body] of libs) files[path] = body.toString('base64')
  for (const [path, body] of page.files) files[path] = body.toString('base64')
  files['shell.html'] = Buffer.from(shellPage(page.frame)).toString('base64')
  return { mode: 'page', files, shell: 'shell.html', frame: page.frame, durationMs, viewport: VIEWPORT, globals: LIBRARY_GLOBALS }
}

export const fromPageResult = (r: PageResult, sandboxed: boolean): SandboxRun => ({ ...r, screenshotPng: r.screenshotPng ? Buffer.from(r.screenshotPng, 'base64') : null, sandboxed })

export interface LocalSandboxOptions {
  launch?: () => Promise<Browser | null>
  /** A directory holding a `lib/` to serve instead of the vendored libraries. For a test. */
  libsDir?: string
}

/**
 * The run in this process: the mind's own Chromium (with its own sandbox on), no unit around it. Each run gets a fresh browser
 * context, and a page that cannot be closed gets a new browser for the next run.
 */
export function createLocalSandbox(opts: LocalSandboxOptions = {}): Sandbox {
  let browserPromise: Promise<Browser | null> | null = null
  let libs: Map<string, Buffer> | null = null
  let tail: Promise<unknown> = Promise.resolve()

  const getBrowser = async (): Promise<Browser | null> => {
    browserPromise ??= (opts.launch ?? launchChromium)().catch(() => null)
    const browser = await browserPromise
    if (!browser) browserPromise = null
    return browser
  }
  const dropBrowser = async () => {
    const old = browserPromise
    browserPromise = null
    const browser = await old?.catch(() => null)
    if (browser) await Promise.race([browser.close().catch(() => undefined), delay(CLOSE_WAIT_MS)])
  }

  const once = async (page: PageFiles, durationMs: number): Promise<SandboxRun> => {
    const browser = await getBrowser()
    if (!browser) return { ...fromPageResult(emptyPageResult({ errors: ['no browser is available to run the page'] }), false), unavailable: true }
    libs ??= libraryFiles(opts.libsDir)
    const { stuckClose, ...result } = await runPage(browser, pageRequest(page, libs, durationMs))
    // A page stuck in a loop can hold its browser; the next run gets a new one.
    if (stuckClose || result.crashed) await dropBrowser()
    return fromPageResult(result, false)
  }

  return {
    sandboxed: false,
    run(page, o = {}) {
      const next = tail.then(() => once(page, o.durationMs ?? RUN_MS))
      tail = next.catch(() => undefined)
      return next
    },
    async available() {
      return (await getBrowser()) !== null
    },
    async close() {
      await tail.catch(() => undefined)
      await dropBrowser()
    },
  }
}

/**
 * Runs a project's `src/` (spec-v4 3.3 `run`): every file in it, read through the project file rules (no link is followed), served
 * at `projects/<id>/src/`, with `index.html` in the frame. `projectDir` is `projects/<id>`.
 */
export async function runInSandbox(projectDir: string, sandbox: Sandbox, opts: { durationMs?: number; id?: string } = {}): Promise<SandboxRun> {
  const id = opts.id ?? 'run'
  const base = `projects/${id}/src/`
  const files = new Map<string, Buffer>()
  for (const file of listProjectFiles(projectDir)) {
    const resolved = resolveProjectPath(projectDir, file.path)
    if (resolved.ok) files.set(`${base}${resolved.rel}`, readFileSync(resolved.abs))
  }
  if (!files.has(`${base}index.html`)) return fromPageResult(emptyPageResult({ errors: ['there is no src/index.html to run'] }), sandbox.sandboxed)
  return sandbox.run({ files, frame: `${base}index.html` }, opts.durationMs === undefined ? {} : { durationMs: opts.durationMs })
}

/** Where the root-owned sandbox unit listens on the server (`deploy/forkling-sandbox.socket`). */
export const SANDBOX_SOCKET = '/run/forkling-sandbox.sock'
/** The unit kills a run at 30 seconds (`RuntimeMaxSec=30`); the client gives up a little after. */
export const UNIT_LIMIT_MS = 30_000
const CLIENT_LIMIT_MS = UNIT_LIMIT_MS + 10_000
/** A run with no answer that ended this close to the unit's limit was cut off by it. */
const KILLED_AFTER_MS = UNIT_LIMIT_MS - 3_000
/** The socket takes one connection at a time; one that is just ending can refuse the next for a moment. */
const CONNECT_TRIES = 5
const CONNECT_GAP_MS = 400
/**
 * How long the client keeps trying while the socket drops its connections at once. systemd (`Accept=yes`, `MaxConnections=1`)
 * does that while the last run's unit is still stopping (Chromium's processes going, `ExecStopPost` emptying the scratch folder).
 */
const BUSY_MS = 20_000
const BUSY_GAP_MS = 300
/** The most an answer may be: a screenshot in base64 and the lines around it. */
const MAX_ANSWER_BYTES = 8 * 1024 * 1024
/** What `exchange` says when every connection was dropped before the runner said ready. */
export const STAYED_BUSY = 'the sandbox stayed busy (every connection was dropped before the runner started)'

export interface SocketSandbox extends Sandbox {
  /** Asks the unit to try the things a probe names (spec-v4 step 3, tests 4 to 6). Null when the unit could not be reached. */
  probe(req: Omit<ProbeRequest, 'mode'>): Promise<ProbeResult | null>
  /** What went wrong in the last exchange (no answer, the runner's `failed`, a wrong shape), or null. For the proof to print. */
  lastProblem?(): string | null
}

/** `ms` counts from the runner's ready line (or the connection, when it never came), so time spent waiting for a busy unit is not the page's. */
export type Exchange = { answer: unknown; ms: number } | { answer: null; ms: number; error: string }

/**
 * One request, one answer, over one connection. The runner writes `ready` first, then one line of JSON. A connection that ends
 * with nothing written was dropped by the socket (the unit busy) and is tried again for up to `busyMs`. Never throws.
 */
export function exchange(socketPath: string, request: RunnerRequest, opts: { limitMs?: number; busyMs?: number } = {}): Promise<Exchange> {
  const started = Date.now()
  const busyUntil = started + (opts.busyMs ?? BUSY_MS)
  const attempt = (tries: number): Promise<Exchange> =>
    new Promise((resolve) => {
      const socket = createConnection(socketPath)
      const chunks: Buffer[] = []
      let size = 0
      let connected = false
      let settled = false
      let since = Date.now()
      const elapsed = () => Date.now() - since
      const finish = (x: Exchange) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        socket.destroy()
        resolve(x)
      }
      const again = (gap: number, next: number) => {
        settled = true
        clearTimeout(timer)
        socket.destroy()
        void delay(gap).then(() => attempt(next).then(resolve))
      }
      // Dropped with nothing written: the unit is still busy with the last run.
      const dropped = () => (Date.now() + BUSY_GAP_MS < busyUntil ? again(BUSY_GAP_MS, tries) : finish({ answer: null, ms: elapsed(), error: STAYED_BUSY }))
      const timer = setTimeout(() => finish({ answer: null, ms: elapsed(), error: 'no answer in time' }), opts.limitMs ?? CLIENT_LIMIT_MS)
      socket.on('connect', () => {
        connected = true
        since = Date.now()
        socket.write(`${JSON.stringify(request)}\n`)
      })
      socket.on('data', (chunk: Buffer) => {
        if (size === 0) since = Date.now()
        size += chunk.length
        if (size > MAX_ANSWER_BYTES) return finish({ answer: null, ms: elapsed(), error: 'the answer was too big' })
        chunks.push(chunk)
      })
      socket.on('end', () => {
        if (size === 0) return dropped()
        const lines = Buffer.concat(chunks).toString('utf8').split('\n')
        const text = (lines[0] === READY.trim() ? lines[1] : lines[0]) ?? ''
        try {
          finish({ answer: JSON.parse(text) as unknown, ms: elapsed() })
        } catch {
          finish({ answer: null, ms: elapsed(), error: text ? 'the answer was not whole' : 'the run ended with no answer' })
        }
      })
      socket.on('error', (error: NodeJS.ErrnoException) => {
        if (settled) return
        if (connected && size === 0) return dropped()
        if (!connected && tries > 1 && ['ECONNREFUSED', 'EAGAIN', 'ECONNRESET'].includes(error.code ?? '')) return again(CONNECT_GAP_MS, tries - 1)
        finish({ answer: null, ms: elapsed(), error: connected ? 'the connection broke' : `the sandbox cannot be reached (${error.code ?? 'error'})` })
      })
    })
  return attempt(CONNECT_TRIES)
}

/** Turns the unit's answer to a page into a run, or says what went wrong. Pure. */
export function readPageAnswer(x: Exchange): SandboxRun {
  const unavailable = (why: string): SandboxRun => ({ ...fromPageResult(emptyPageResult({ errors: [why] }), true), unavailable: true })
  if (x.answer !== null && typeof x.answer === 'object') {
    const a = x.answer as Partial<PageResult> & { failed?: unknown }
    if (typeof a.failed === 'string') return unavailable(`the sandbox could not run the page: ${clean(a.failed)}`)
    if (typeof a.loaded === 'boolean' && Array.isArray(a.errors) && Array.isArray(a.consoleErrors)) {
      const r: PageResult = { ...emptyPageResult(), ...a }
      return fromPageResult({ ...r, errors: r.errors.map((e) => clean(String(e))), consoleErrors: r.consoleErrors.slice(0, MAX_CONSOLE_LINES).map((e) => clean(String(e))) }, true)
    }
    return unavailable('the sandbox gave an answer of the wrong shape')
  }
  if ('error' in x && (x.error.startsWith('the sandbox cannot be reached') || x.error === STAYED_BUSY)) return unavailable(x.error)
  // No answer: the unit was killed. At its time limit the page was stuck; before it, the page took the memory or crashed it.
  if (x.ms >= KILLED_AFTER_MS) return fromPageResult(emptyPageResult({ loaded: true, timedOut: true }), true)
  return fromPageResult(emptyPageResult({ loaded: true, crashed: true }), true)
}

/** Whether a probe answer has the right shape. */
const isProbeResult = (a: unknown): a is ProbeResult => {
  const p = a as Partial<ProbeResult> | null
  return !!p && Array.isArray(p.read) && Array.isArray(p.write) && Array.isArray(p.connect) && typeof p.browser === 'string' && Array.isArray(p.envNames)
}

/** The client of the sandbox unit on the server. Runs go one at a time, as the socket takes one connection at a time. */
export function createSocketSandbox(opts: { socketPath?: string; libsDir?: string; limitMs?: number; busyMs?: number } = {}): SocketSandbox & { lastProblem(): string | null } {
  const socketPath = opts.socketPath ?? SANDBOX_SOCKET
  const limit = { ...(opts.limitMs === undefined ? {} : { limitMs: opts.limitMs }), ...(opts.busyMs === undefined ? {} : { busyMs: opts.busyMs }) }
  let libs: Map<string, Buffer> | null = null
  let tail: Promise<unknown> = Promise.resolve()
  let problem: string | null = null
  const queued = <T>(job: () => Promise<T>): Promise<T> => {
    const next = tail.then(job)
    tail = next.catch(() => undefined)
    return next
  }
  /** What went wrong in an exchange, in words, or null when it gave an answer that is not `failed`. */
  const problemOf = (x: Exchange): string | null => {
    if ('error' in x) return x.error
    const failed = (x.answer as { failed?: unknown } | null)?.failed
    return typeof failed === 'string' ? `the runner failed: ${clean(failed)}` : null
  }
  return {
    sandboxed: true,
    run(page, o = {}) {
      return queued(async () => {
        libs ??= libraryFiles(opts.libsDir)
        const x = await exchange(socketPath, pageRequest(page, libs, o.durationMs ?? RUN_MS), limit)
        problem = problemOf(x)
        return readPageAnswer(x)
      })
    },
    probe(req) {
      return queued(async () => {
        const x = await exchange(socketPath, { mode: 'probe', ...req }, limit)
        problem = problemOf(x) ?? (isProbeResult(x.answer) ? null : 'the probe answer had the wrong shape')
        return isProbeResult(x.answer) ? x.answer : null
      })
    },
    lastProblem: () => problem,
    async available() {
      return existsSync(socketPath)
    },
    async close() {
      await tail.catch(() => undefined)
    },
  }
}

/** The sandbox for this machine: the unit when its socket is there (the server), this process otherwise. */
export function createSandbox(opts: LocalSandboxOptions & { socketPath?: string } = {}): Sandbox {
  const socketPath = opts.socketPath ?? SANDBOX_SOCKET
  return existsSync(socketPath) ? createSocketSandbox({ socketPath, ...(opts.libsDir ? { libsDir: opts.libsDir } : {}) }) : createLocalSandbox(opts)
}

export const isSocketSandbox = (s: Sandbox): s is SocketSandbox => s.sandboxed && typeof (s as Partial<SocketSandbox>).probe === 'function'

/** The server's real paths (deploy/setup.sh, the W3 runbook): the keys file and the world the mind runs. */
export const SERVER_PATHS = { envFile: '/etc/forkling/mind.env', world: '/var/lib/forkling/world', engine: '/opt/forkling/engine' } as const

/**
 * What the self-test at start tries from inside the unit (step 3's "cannot read" and "cannot connect" tests, run once): the keys
 * file, the world's `.git/config`, this process's environment, the engine's `.env`; a connection out and one to the mind's own
 * port; and the browser, with its sandbox on.
 */
export function selfTestProbe(o: { world: string; pid?: number; port?: number }): Omit<ProbeRequest, 'mode'> {
  return {
    read: [SERVER_PATHS.envFile, posix.join(o.world, '.git/config'), `/proc/${o.pid ?? process.pid}/environ`, `${SERVER_PATHS.engine}/.env`],
    write: [],
    connect: ['1.1.1.1:443', `127.0.0.1:${o.port ?? 8787}`],
    browser: true,
  }
}

/** A name in the environment that may hold a key. */
export const SECRET_NAME = /KEY|TOKEN|SECRET|PASSWORD|ANTHROPIC|GITHUB|TURNSTILE/i

/**
 * `sandbox: ok` (step 3) only when the run went through the unit and, from inside it, nothing could be read, written or connected
 * to, no name in its environment looks like a key, and the browser started with its own sandbox on. Anything else is `missing`,
 * with the reasons for the log. Pure.
 */
export function sandboxStatus(probe: ProbeResult | null): { status: 'ok' | 'missing'; reasons: string[] } {
  if (!probe) return { status: 'missing', reasons: ['the sandbox unit did not answer (or this machine has none)'] }
  const reasons = [
    ...probe.read.filter((r) => r.readable).map((r) => `it could read ${r.path}`),
    ...probe.write.filter((w) => w.writable).map((w) => `it could write ${w.path}`),
    ...probe.connect.filter((c) => c.connected).map((c) => `it could connect to ${c.target}`),
    ...(probe.browser === 'ok' ? [] : [`the browser did not start: ${probe.browser}`]),
    ...probe.envNames.filter((n) => SECRET_NAME.test(n)).map((n) => `its environment has ${n}`),
  ]
  return { status: reasons.length === 0 ? 'ok' : 'missing', reasons }
}

/** The self-test at start: `missing` at once off the server (no unit), else one probe through the unit. */
export async function sandboxSelfTest(sandbox: Sandbox, o: { world: string; port?: number }): Promise<{ status: 'ok' | 'missing'; reasons: string[] }> {
  if (!isSocketSandbox(sandbox)) return { status: 'missing', reasons: ['no sandbox unit on this machine: pages run in this process'] }
  return sandboxStatus(await sandbox.probe(selfTestProbe(o)))
}
