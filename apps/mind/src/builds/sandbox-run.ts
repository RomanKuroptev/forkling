import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Browser } from 'playwright'
import { copyLibs, VENDORED_FILES } from '@forkling/site/libs'
import { launchChromium } from './browser.ts'
import { listProjectFiles, resolveProjectPath } from './project-files.ts'
import { workFrame } from './sandbox.ts'
import { emptyPageResult, runPage, type PageRequest, type PageResult } from './sandbox-runner.ts'

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
