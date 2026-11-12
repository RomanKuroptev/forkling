import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import type { Browser, BrowserContext, Frame, Page } from 'playwright'
import { copyLibs } from '@forkling/site/libs'
import { launchChromium } from './browser.ts'
import { workFrame } from './sandbox.ts'
import { serveDir, type Fixture } from './static-server.ts'
import { staticCheck, type CheckResult } from './work-check.ts'

/** The work is watched this long (spec 7.3, step 2). */
export const CHECK_MS = 5_000
/** A frame that does not draw within this long, after the watch, is stuck. */
const RENDER_WAIT_MS = 3_000
/** Closing a page that is stuck in a loop must not hold the check up. */
const CLOSE_WAIT_MS = 5_000
const FRAME = { width: 480, height: 360 }
const WORK_PATH = '/works/check/index.html'

export interface WorkCheckResult extends CheckResult {
  /** The screenshot of the work, saved as `thumb.png` when it passes. Null when there was none to take. */
  thumb: Buffer | null
  /** There is no browser to check with, so nothing was decided: a step should rest, not scrap the work. */
  unavailable?: true
}

export interface WorkChecker {
  /** `html` is the page as it will be stored, with the policy tag in it (see `withPolicy`). One check at a time. */
  check(html: string, opts: { size: 'full' | 'sketch' }): Promise<WorkCheckResult>
  available(): Promise<boolean>
  close(): Promise<void>
}

export interface BrowserCheckerOptions {
  launch?: () => Promise<Browser | null>
  /** How long to watch (default `CHECK_MS`). */
  durationMs?: number
  /** A directory holding a `lib/` to serve instead of the vendored libraries. For a test. */
  libsDir?: string
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
/** Page text can hold markup; a reason never does. */
const clean = (text: string, max = 200) => text.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)
const libraryReason = (file: string) => `library ${clean(file, 40)} did not load`

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

/** The globals a classic library defines, to tell that its script really ran. */
const GLOBALS: [string, string][] = [
  ['p5.min.js', 'p5'],
  ['Tone.js', 'Tone'],
]

async function findFrame(page: Page, url: string, ms: number): Promise<Frame | null> {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    const frame = page.frames().find((f) => f.url() === url)
    if (frame) return frame
    await delay(50)
  }
  return null
}

/**
 * The browser step of the check (spec 7.3, steps 2 to 4). The work is shown the way the site will show it (an iframe with
 * `sandbox="allow-scripts"`, the policy in the page, the libraries from `lib/`) and watched. It fails on an uncaught error,
 * a library that did not load, a frame that never renders, a frame sent to another address (a policy cannot stop that, as
 * the sandbox proof found), a request to another origin, or a screenshot of a single colour. The static step runs first and
 * starts no browser. Checks run one at a time, each in a fresh browser context, and a page that cannot be closed gets a new
 * browser for the next one.
 */
export function createBrowserChecker(opts: BrowserCheckerOptions = {}): WorkChecker {
  const durationMs = opts.durationMs ?? CHECK_MS
  let browserPromise: Promise<Browser | null> | null = null
  let site: { root: string; server: Fixture } | null = null
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

  /** A temporary site: `lib/` once, and the work and the page that frames it rewritten for each check. */
  async function prepare(): Promise<{ root: string; server: Fixture }> {
    if (site) return site
    const root = mkdtempSync(join(tmpdir(), 'work-check-'))
    if (opts.libsDir) cpSync(join(opts.libsDir, 'lib'), join(root, 'lib'), { recursive: true })
    else copyLibs(root)
    mkdirSync(join(root, 'works/check'), { recursive: true })
    site = { root, server: await serveDir(root) }
    return site
  }

  async function observe(context: BrowserContext, origin: string, html: string): Promise<WorkCheckResult> {
    const reasons = new Set<string>()
    const workUrl = `${origin}${WORK_PATH}`
    const page = await context.newPage()

    page.on('pageerror', (error) => reasons.add(`uncaught error: ${clean(error.message)}`))
    page.on('response', (response) => {
      const url = new URL(response.url())
      if (url.origin === origin && url.pathname.startsWith('/lib/') && response.status() >= 400) reasons.add(libraryReason(basename(url.pathname)))
      // An attempt the policy stopped never gets a response, and is contained. An answer from another origin means one got out.
      else if (/^https?:$/.test(url.protocol) && url.origin !== origin) reasons.add(`it reached ${clean(url.host, 60)}, and a work has no network`)
    })
    page.on('requestfailed', (request) => {
      const path = new URL(request.url()).pathname
      if (request.url().startsWith(origin) && path.startsWith('/lib/')) reasons.add(libraryReason(basename(path)))
    })
    let arrived = false
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) return
      if (frame.url() === workUrl) arrived = true
      else if (arrived) reasons.add('it sent its own frame to another address (navigation), and a work stays where it is')
    })

    await page.goto(`${origin}/shell.html`, { waitUntil: 'domcontentloaded' })
    const frame = await findFrame(page, workUrl, 5_000)
    if (!frame) return { ok: false, reasons: ['the page did not load in its frame'], thumb: null }

    await delay(durationMs)

    const rendered = await Promise.race([frame.evaluate(TWO_FRAMES).then(() => true, () => false), delay(RENDER_WAIT_MS).then(() => false)])
    if (!rendered) reasons.add('the page never rendered a frame (it may be stuck in a loop)')

    let thumb: Buffer | null = null
    if (rendered) {
      for (const [file, global] of GLOBALS) {
        if (html.includes(`/lib/${file}`) && !(await frame.evaluate(`typeof window.${global} !== 'undefined'`).catch(() => false))) reasons.add(libraryReason(file))
      }
      try {
        thumb = await page.locator('iframe').screenshot({ timeout: 5_000 })
        const helper = await context.newPage()
        const flat = await helper.evaluate(singleColour(thumb.toString('base64'))).catch(() => false)
        await helper.close().catch(() => undefined)
        if (flat) reasons.add('the screenshot is a single colour, so the page drew nothing to see')
      } catch {
        reasons.add('the page could not be photographed')
      }
    }

    const list = [...reasons].slice(0, 8)
    return { ok: list.length === 0, reasons: list, thumb: list.length === 0 ? thumb : null }
  }

  async function run(html: string, size: 'full' | 'sketch'): Promise<WorkCheckResult> {
    const fixed = staticCheck(html, { size })
    if (!fixed.ok) return { ...fixed, thumb: null }

    const browser = await getBrowser()
    if (!browser) return { ok: false, reasons: ['no browser is available to check the work'], thumb: null, unavailable: true }

    const { root, server } = await prepare()
    writeFileSync(join(root, 'works/check/index.html'), html)
    writeFileSync(
      join(root, 'shell.html'),
      `<!doctype html><html><head><meta charset="utf-8"><title>check</title><style>body{margin:0;background:#fff}iframe{display:block;border:0;width:${FRAME.width}px;height:${FRAME.height}px}</style></head><body>${workFrame('works/check/index.html', 'work')}</body></html>`,
    )

    const context = await browser.newContext({ viewport: { width: 640, height: 480 }, serviceWorkers: 'block' })
    try {
      return await observe(context, server.origin, html)
    } finally {
      const closed = await Promise.race([context.close().then(() => true, () => true), delay(CLOSE_WAIT_MS).then(() => false)])
      // A page stuck in a loop can hold its browser; the next check gets a new one.
      if (!closed) await dropBrowser()
    }
  }

  return {
    check(html, o) {
      const next = tail.then(() => run(html, o.size))
      tail = next.catch(() => undefined)
      return next
    },
    async available() {
      return (await getBrowser()) !== null
    },
    async close() {
      await tail.catch(() => undefined)
      await dropBrowser()
      await site?.server.close()
      if (site) rmSync(site.root, { recursive: true, force: true })
      site = null
    },
  }
}
