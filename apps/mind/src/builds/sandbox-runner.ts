import { fstatSync, mkdirSync } from 'node:fs'
import { connect, Socket } from 'node:net'
import { fileURLToPath } from 'node:url'
import type { Browser, BrowserType, Frame, Page } from 'playwright'

/**
 * The runner of the sandbox (spec-v4 section 4, step 3). It opens a page in headless Chromium, watches it, and says what it saw.
 * It is deliberately dumb: the mind decides what the page is (the work or project, the frame around it, the libraries) and what
 * the result means; the runner only serves those files from memory and reports.
 *
 * It runs two ways, the same code both times:
 * - **On the server** as its own program, started by the root-owned unit `forkling-sandbox@.service` as the user `forkling-build`
 *   with no network, 1 GB, one CPU and 30 seconds. It reads one request (JSON) from its input, which is the socket, writes one
 *   answer (JSON) back, and ends. Deploy copies this file to `/opt/forkling/sandbox/current/runner.ts` beside a copy of
 *   `playwright-core`, because that user cannot read the engine's folder. So this file imports nothing but Node's own modules
 *   and `playwright-core`, and no other file of the engine.
 * - **Off the server** (Roman's PC, CI, the Actions tick), in the mind's own process with the mind's browser, unsandboxed
 *   (`sandboxed: false` in the result of `runInSandbox`).
 *
 * The files are never written to disk: every request of the page goes through `page.route`, and one to the page's own origin
 * gets the file from memory, while one to anywhere else is stopped and written down. Nothing reaches a network either way.
 * Chromium's own sandbox stays on.
 */

/** The page's own origin. `.invalid` can never resolve, and no request to it leaves the browser: every one is answered by the route. */
export const RUN_ORIGIN = 'http://sandbox.invalid'
/** The most an answer's console lines may be (spec-v4 3.3). */
export const MAX_CONSOLE_LINES = 20
/** A frame that does not draw within this long, after the watch, is stuck. */
const RENDER_WAIT_MS = 3_000
/** Everything the runner does after the watch must fit in this, or it calls the page stuck. */
const AFTER_WATCH_MS = 15_000
/** The biggest request the runner reads: 2 MB of project, the libraries and base64 of both, with room. */
export const MAX_REQUEST_BYTES = 16 * 1024 * 1024

export interface PageRequest {
  mode: 'page'
  /** Path (no leading `/`) to the file's bytes, base64. Served at `RUN_ORIGIN/<path>`. */
  files: Record<string, string>
  /** The page the browser opens, holding the frame. */
  shell: string
  /** The page inside the frame, the one that is watched. */
  frame: string
  /** How long to watch. */
  durationMs: number
  viewport: { width: number; height: number }
  /** A library file and the global it defines, to tell that its script really ran. */
  globals: [string, string][]
}

export interface PageResult {
  /** The frame's page was found and loaded. */
  loaded: boolean
  /** Uncaught errors, in the page's words (cleaned of markup). */
  errors: string[]
  /** Console errors, up to `MAX_CONSOLE_LINES`. */
  consoleErrors: string[]
  /** Library files (by name) that did not load or did not run. */
  libraryFailures: string[]
  /** Hosts outside the page's origin it tried to reach. */
  outside: string[]
  /** It sent its own frame to another address. */
  navigated: boolean
  /** It drew a frame after the watch. */
  rendered: boolean
  /** The browser tab died (out of memory, most likely). */
  crashed: boolean
  /** Base64 PNG of the frame, or null. */
  screenshotPng: string | null
  /** Every pixel of the screenshot is the same colour. */
  blank: boolean
  /** Stuck: it never drew a frame, or the run went over its time. */
  timedOut: boolean
}

export interface ProbeRequest {
  mode: 'probe'
  /** Files to try to read. Only whether it could is answered, never what is in them. */
  read: string[]
  /** Files to try to create (and remove again). */
  write: string[]
  /** Addresses to try to open a connection to, `host:port`. */
  connect: string[]
  /** Also start the browser, with its own sandbox on. */
  browser: boolean
}

export interface ProbeResult {
  read: { path: string; readable: boolean }[]
  write: { path: string; writable: boolean }[]
  connect: { target: string; connected: boolean }[]
  /** `ok`, or why the browser did not start. */
  browser: string
  /** Who the runner ran as (`process.getuid`), and its environment's names (never values). */
  uid: number | null
  envNames: string[]
}

export type RunnerRequest = PageRequest | ProbeRequest

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
/** Page text can hold markup; a reason never does. */
export const clean = (text: string, max = 200) => text.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1)

const TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  svg: 'image/svg+xml',
  txt: 'text/plain; charset=utf-8',
  md: 'text/plain; charset=utf-8',
  png: 'image/png',
}
const typeOf = (path: string) => TYPES[path.slice(path.lastIndexOf('.') + 1).toLowerCase()] ?? 'application/octet-stream'

const TWO_FRAMES = 'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))'
/** Whether every pixel of a PNG is the same colour, decided inside the browser. */
const singleColour = (base64: string) => `(async () => {
  const blob = await (await fetch('data:image/png;base64,${base64}')).blob()
  const bitmap = await createImageBitmap(blob)
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const context = canvas.getContext('2d')
  context.drawImage(bitmap, 0, 0)
  const d = context.getImageData(0, 0, bitmap.width, bitmap.height).data
  for (let i = 4; i < d.length; i += 4) if (d[i] !== d[0] || d[i + 1] !== d[1] || d[i + 2] !== d[2] || d[i + 3] !== d[3]) return false
  return true
})()`

async function findFrame(page: Page, url: string, ms: number): Promise<Frame | null> {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    const frame = page.frames().find((f) => f.url() === url)
    if (frame) return frame
    await delay(50)
  }
  return null
}

export const emptyPageResult = (over: Partial<PageResult> = {}): PageResult => ({
  loaded: false,
  errors: [],
  consoleErrors: [],
  libraryFailures: [],
  outside: [],
  navigated: false,
  rendered: false,
  crashed: false,
  screenshotPng: null,
  blank: false,
  timedOut: false,
  ...over,
})

/**
 * Opens `req.shell` in a fresh context of `browser`, finds the frame, watches it for `req.durationMs`, and reports. Never throws
 * for anything the page does. The context is closed after; closing a page stuck in a loop can hang, so the caller is told
 * (`stuckClose`) and may drop the browser.
 */
export async function runPage(browser: Browser, req: PageRequest): Promise<PageResult & { stuckClose: boolean }> {
  const result = emptyPageResult()
  const outside = new Set<string>()
  const libraries = new Set<string>()
  const files = new Map(Object.entries(req.files))
  const frameUrl = `${RUN_ORIGIN}/${req.frame}`
  const context = await browser.newContext({ viewport: req.viewport, serviceWorkers: 'block' })
  let stuckClose = false
  try {
    await context.route('**/*', async (route) => {
      const url = route.request().url()
      let parsed: URL
      try {
        parsed = new URL(url)
      } catch {
        return route.abort('blockedbyclient')
      }
      if (parsed.origin !== RUN_ORIGIN) {
        if (/^(?:https?|wss?):$/.test(parsed.protocol)) outside.add(clean(parsed.host, 60))
        return route.abort('blockedbyclient')
      }
      const path = decodeURIComponent(parsed.pathname).replace(/^\/+/, '')
      const body = files.get(path)
      if (body === undefined) {
        if (path.startsWith('lib/')) libraries.add(fileName(path))
        return route.fulfill({ status: 404, body: '' })
      }
      // A sandboxed frame has an opaque origin, so a module script needs this, as GitHub Pages sends it.
      return route.fulfill({ status: 200, body: Buffer.from(body, 'base64'), headers: { 'Content-Type': typeOf(path), 'Access-Control-Allow-Origin': '*' } })
    })
    // A WebSocket is left to the policy (connect-src 'none') and, on the server, to the unit's lack of any network. Playwright's
    // own WebSocket route is not used: it swaps the page's WebSocket for a stand-in that the policy never sees.

    const page = await context.newPage()
    page.on('pageerror', (error) => result.errors.push(clean(error.message)))
    page.on('console', (message) => {
      if (message.type() === 'error' && result.consoleErrors.length < MAX_CONSOLE_LINES) result.consoleErrors.push(clean(message.text()))
    })
    page.on('crash', () => {
      result.crashed = true
    })
    let arrived = false
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) return
      if (frame.url() === frameUrl) arrived = true
      else if (arrived) result.navigated = true
    })

    await page.goto(`${RUN_ORIGIN}/${req.shell}`, { waitUntil: 'domcontentloaded', timeout: 10_000 })
    const frame = await findFrame(page, frameUrl, 5_000)
    if (frame) {
      result.loaded = true
      await delay(req.durationMs)
      const deadline = delay(AFTER_WATCH_MS).then(() => 'late' as const)
      const after = (async () => {
        result.rendered = await Promise.race([frame.evaluate(TWO_FRAMES).then(() => true, () => false), delay(RENDER_WAIT_MS).then(() => false)])
        if (!result.rendered) return
        const framed = Buffer.from(files.get(req.frame) ?? '', 'base64').toString('utf8')
        for (const [file, global] of req.globals) {
          if (framed.includes(`/lib/${file}`) && !(await frame.evaluate(`typeof window.${global} !== 'undefined'`).catch(() => false))) libraries.add(file)
        }
        try {
          const shot = await page.locator('iframe').first().screenshot({ timeout: 5_000 })
          result.screenshotPng = shot.toString('base64')
          const helper = await context.newPage()
          result.blank = await helper.evaluate(singleColour(result.screenshotPng)).then((x) => x === true, () => false)
          await helper.close().catch(() => undefined)
        } catch {
          // no screenshot: the caller says so
        }
      })()
      if ((await Promise.race([after, deadline])) === 'late') result.rendered = false
    }
  } catch (error) {
    if (!result.crashed) result.errors.push(clean(`the page could not be opened: ${error instanceof Error ? error.message : String(error)}`))
  } finally {
    const closed = await Promise.race([context.close().then(() => true, () => true), delay(5_000).then(() => false)])
    stuckClose = !closed
  }
  result.outside = [...outside]
  result.libraryFailures = [...libraries]
  result.timedOut = result.loaded && !result.rendered && !result.crashed
  return { ...result, stuckClose }
}

/** Tries each thing the probe names. Nothing that is read is answered, only whether it could be. */
export async function runProbe(req: ProbeRequest, launch: () => Promise<Browser>): Promise<ProbeResult> {
  const { openSync, closeSync, readSync, unlinkSync } = await import('node:fs')
  const read = req.read.map((path) => {
    try {
      const fd = openSync(path, 'r')
      try {
        readSync(fd, Buffer.alloc(1), 0, 1, 0)
      } finally {
        closeSync(fd)
      }
      return { path, readable: true }
    } catch {
      return { path, readable: false }
    }
  })
  const write = req.write.map((path) => {
    try {
      closeSync(openSync(path, 'wx'))
      unlinkSync(path)
      return { path, writable: true }
    } catch {
      return { path, writable: false }
    }
  })
  const connected = await Promise.all(
    req.connect.map(
      (target) =>
        new Promise<{ target: string; connected: boolean }>((resolve) => {
          const at = target.lastIndexOf(':')
          try {
            const socket = connect({ host: target.slice(0, at), port: Number(target.slice(at + 1)) })
            const done = (ok: boolean) => {
              socket.destroy()
              resolve({ target, connected: ok })
            }
            socket.once('connect', () => done(true))
            socket.once('error', () => done(false))
            socket.setTimeout(5_000, () => done(false))
          } catch {
            resolve({ target, connected: false })
          }
        }),
    ),
  )
  let browser = 'not asked'
  if (req.browser) {
    try {
      const b = await launch()
      await b.close()
      browser = 'ok'
    } catch (error) {
      browser = clean(error instanceof Error ? error.message : String(error), 300)
    }
  }
  return { read, write, connect: connected, browser, uid: typeof process.getuid === 'function' ? process.getuid() : null, envNames: Object.keys(process.env).sort() }
}

/** What a request must look like. Checked by hand: this file may not import Zod. */
export function parseRequest(text: string): RunnerRequest {
  const value = JSON.parse(text) as Record<string, unknown>
  const strings = (x: unknown) => Array.isArray(x) && x.every((s) => typeof s === 'string')
  if (value.mode === 'probe') {
    if (!strings(value.read) || !strings(value.write) || !strings(value.connect) || typeof value.browser !== 'boolean') throw new Error('a bad probe')
    return value as unknown as ProbeRequest
  }
  if (value.mode === 'page') {
    const files = value.files as Record<string, unknown> | null
    const viewport = value.viewport as { width?: unknown; height?: unknown } | null
    if (!files || typeof files !== 'object' || !Object.values(files).every((b) => typeof b === 'string')) throw new Error('bad files')
    if (typeof value.shell !== 'string' || typeof value.frame !== 'string' || typeof value.durationMs !== 'number') throw new Error('a bad page')
    if (value.durationMs < 0 || value.durationMs > 10_000) throw new Error('a bad watch time')
    if (!viewport || typeof viewport.width !== 'number' || typeof viewport.height !== 'number') throw new Error('a bad viewport')
    if (!Array.isArray(value.globals) || !value.globals.every((g) => Array.isArray(g) && g.length === 2 && strings(g))) throw new Error('bad globals')
    for (const [, global] of value.globals as [string, string][]) if (!/^[A-Za-z_$][\w$]*$/.test(global)) throw new Error('a bad global')
    return value as unknown as PageRequest
  }
  throw new Error('an unknown mode')
}

/** Chromium for the runner on the server: the one Playwright fetched, with its own sandbox on. */
async function serverLaunch(): Promise<Browser> {
  // A name in a variable, so the mind's typecheck does not look for a package it does not list; the server has it beside this file.
  const name = 'playwright-core'
  const { chromium } = (await import(name)) as { chromium: BrowserType }
  return chromium.launch({ chromiumSandbox: true })
}

/** Reads one line (a request is one line of JSON) from `input`, up to `MAX_REQUEST_BYTES`. */
export function readLine(input: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    const done = (error: Error | null) => {
      input.removeListener('data', onData)
      input.removeListener('end', onEnd)
      input.removeListener('error', onError)
      if (error) reject(error)
      else resolve(Buffer.concat(chunks).toString('utf8').split('\n')[0] ?? '')
    }
    const onData = (chunk: Buffer | string) => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
      size += buf.length
      chunks.push(buf)
      if (size > MAX_REQUEST_BYTES) done(new Error('the request is too big'))
      else if (buf.includes(10)) done(null)
    }
    const onEnd = () => done(null)
    const onError = (error: Error) => done(error)
    input.on('data', onData)
    input.on('end', onEnd)
    input.on('error', onError)
  })
}

/**
 * The program's input and output. Under the unit both are the one connection from the socket (`StandardInput=socket`), so it is
 * opened once as a socket that may be half-closed; run by hand they are the ordinary stdin and stdout.
 */
function io(): { input: NodeJS.ReadableStream; write: (text: string) => Promise<void> } {
  if (fstatSync(0).isSocket()) {
    const socket = new Socket({ fd: 0, readable: true, writable: true, allowHalfOpen: true })
    return { input: socket, write: (text) => new Promise((resolve) => socket.end(text, () => resolve())) }
  }
  return { input: process.stdin, write: (text) => new Promise((resolve) => process.stdout.write(text, () => resolve())) }
}

/** The program on the server: `node runner.ts --browsers <dir> --scratch <dir>`; one request in, one answer out. */
async function main(argv: string[]): Promise<void> {
  const arg = (name: string) => {
    const at = argv.indexOf(name)
    return at >= 0 ? argv[at + 1] : undefined
  }
  const browsers = arg('--browsers')
  const scratch = arg('--scratch')
  if (!browsers || !scratch) throw new Error('usage: runner.ts --browsers <dir> --scratch <dir>')
  // Chromium's profile and temporary files go to the scratch folder, the only place this unit may write.
  const tmp = `${scratch}/tmp`
  mkdirSync(tmp, { recursive: true })
  process.env.TMPDIR = tmp
  process.env.PLAYWRIGHT_BROWSERS_PATH = browsers

  const channel = io()
  let answer: unknown
  try {
    const req = parseRequest(await readLine(channel.input))
    if (req.mode === 'probe') answer = await runProbe(req, serverLaunch)
    else {
      const browser = await serverLaunch()
      const { stuckClose: _, ...result } = await runPage(browser, req)
      answer = result
      await Promise.race([browser.close().catch(() => undefined), delay(3_000)])
    }
  } catch (error) {
    answer = { failed: clean(error instanceof Error ? error.message : String(error), 300) }
  }
  await channel.write(`${JSON.stringify(answer)}\n`)
  process.exit(0)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  })
}

