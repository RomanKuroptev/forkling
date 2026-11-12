import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { BrowserContext, Frame, Page } from 'playwright'
import { copyLibs } from '../../../site/src/libs.ts'
import { launchBrowser, outsideServer, serveDir, type Fixture } from './helpers.ts'

/**
 * The one-hour proof of spec 7.3, before W4 builds on it: a work shown the way 7.4 says (an iframe with `sandbox="allow-scripts"`
 * and no `allow-same-origin`, under a policy in a `<meta>` tag, since GitHub Pages cannot send headers) can load p5, Tone and
 * three from the site's own `lib/`, and cannot reach the network. The two servers are two origins on loopback: "the site"
 * (what Pages would serve) and "the outside" (which counts every request it gets; any request that reaches it is a leak).
 */

/** Spec 7.4, word for word. */
const POLICY =
  "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'none'; form-action 'none'"
const META = `<meta http-equiv="Content-Security-Policy" content="${POLICY}">`

const browser = await launchBrowser()

// Starting a browser takes seconds when the whole suite is running at once, so these get far more than the default 5.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

describe.skipIf(!browser)('the sandbox proof (spec 7.3, 7.4)', () => {
  let root: string
  let site: Fixture
  let siteNoCors: Fixture
  let outside: Fixture
  let context: BrowserContext

  /** Every way out a work might try, and what happened to each, recorded inside the frame. */
  const attempts = (out: string) => `
    window.__probe = { leak: {}, violations: 0, errors: [] }
    document.addEventListener('securitypolicyviolation', () => { window.__probe.violations++ })
    window.addEventListener('error', (e) => { window.__probe.errors.push(String(e.message)) })
    const leak = window.__probe.leak
    fetch('${out}/fetch').then(() => { leak.fetch = 'reached' }, () => { leak.fetch = 'blocked' })
    try { const x = new XMLHttpRequest(); x.open('GET', '${out}/xhr'); x.onload = () => { leak.xhr = 'reached' }; x.onerror = () => { leak.xhr = 'blocked' }; x.send() } catch { leak.xhr = 'blocked' }
    try { const w = new WebSocket('${out.replace('http', 'ws')}/ws'); w.onopen = () => { leak.ws = 'reached' }; w.onerror = () => { leak.ws = 'blocked' } } catch { leak.ws = 'blocked' }
    const img = new Image(); img.onload = () => { leak.img = 'reached' }; img.onerror = () => { leak.img = 'blocked' }; img.src = '${out}/pixel.png'
    try { leak.beacon = navigator.sendBeacon('${out}/beacon', 'x') ? 'reached' : 'blocked' } catch { leak.beacon = 'blocked' }
    const script = document.createElement('script'); script.onload = () => { leak.script = 'reached' }; script.onerror = () => { leak.script = 'blocked' }; script.src = '${out}/x.js'; document.head.append(script)
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.onload = () => { leak.css = 'reached' }; css.onerror = () => { leak.css = 'blocked' }; css.href = '${out}/x.css'; document.head.append(css)
  `
  const ATTEMPTED = ['fetch', 'xhr', 'ws', 'img', 'script', 'css']

  const html = (o: { policy: boolean; body: string }) =>
    `<!doctype html><html><head>${o.policy ? META : ''}<meta charset="utf-8"><title>test work</title></head><body>${o.body}</body></html>`
  const shell = (name: string) => `<!doctype html><title>shell</title><iframe id="work" sandbox="allow-scripts" src="works/${name}/index.html" width="200" height="200"></iframe>`
  const writeWork = (name: string, page: string) => {
    mkdirSync(join(root, 'works', name), { recursive: true })
    writeFileSync(join(root, 'works', name, 'index.html'), page)
    writeFileSync(join(root, `shell-${name}.html`), shell(name))
  }

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'sandbox-proof-'))
    copyLibs(root)
    outside = await outsideServer()
    const p5Body = `<script>${attempts(outside.origin)}</script>
      <script src="../../lib/p5.min.js"></script>
      <script>function setup() { createCanvas(100, 100) } function draw() { background(20); noStroke(); fill(255, 0, 0); rect(10, 10, 60, 60) }</script>`
    writeWork('p5', html({ policy: true, body: p5Body }))
    writeWork('p5-open', html({ policy: false, body: p5Body }))
    writeWork('tone', html({ policy: true, body: '<script src="../../lib/Tone.js"></script>' }))
    writeWork('three', html({ policy: true, body: `<script type="module">import * as THREE from '../../lib/three/three.module.js'; window.__three = { revision: THREE.REVISION, ok: typeof THREE.Scene }</script>` }))
    writeWork(
      'navigates',
      html({ policy: true, body: `<script>setTimeout(() => { location.href = '${outside.origin}/navigated' }, 300)</script>` }),
    )
    site = await serveDir(root)
    siteNoCors = await serveDir(root, { acaoStar: false })
    context = await browser!.newContext()
  })

  afterAll(async () => {
    await context?.close()
    await browser?.close()
    await Promise.all([site?.close(), siteNoCors?.close(), outside?.close()])
    rmSync(root, { recursive: true, force: true })
  })

  async function open(name: string, from: Fixture = site): Promise<{ page: Page; frame: Frame }> {
    const page = await context.newPage()
    await page.goto(`${from.origin}/shell-${name}.html`)
    const deadline = Date.now() + 5_000
    while (Date.now() < deadline) {
      const frame = page.frames().find((f) => f.url().endsWith(`/works/${name}/index.html`))
      if (frame) return { page, frame }
      await page.waitForTimeout(50)
    }
    throw new Error(`the frame for ${name} never appeared`)
  }
  // The code that runs in the page is written as strings: this project has no DOM types, and a string is what runs there anyway.
  interface Probe {
    leak: Record<string, string>
    violations: number
    errors: string[]
  }
  const probe = (frame: Frame) => frame.evaluate('window.__probe') as Promise<Probe>
  const settled = (frame: Frame) => frame.waitForFunction(`${JSON.stringify(ATTEMPTED)}.every((k) => k in window.__probe.leak)`, undefined, { timeout: 10_000 })
  const TWO_FRAMES = 'new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))'

  it('loads p5.js from the site\'s own lib/ and draws, with no script error', async () => {
    const { page, frame } = await open('p5')
    await frame.waitForFunction("!!document.querySelector('canvas')")
    await frame.evaluate(TWO_FRAMES)
    expect(await frame.evaluate('typeof window.p5')).toBe('function')
    const pixel = await frame.evaluate(`(() => {
      const c = document.querySelector('canvas')
      const k = c.width / 100
      return Array.from(c.getContext('2d').getImageData(Math.floor(30 * k), Math.floor(30 * k), 1, 1).data)
    })()`)
    expect(pixel).toEqual([255, 0, 0, 255])
    expect((await probe(frame)).errors).toEqual([])
    await page.close()
  })

  it('cannot reach the network: fetch, XHR, WebSocket, an image, a script, a stylesheet and a beacon are all stopped, and none arrives', async () => {
    const before = outside.total()
    const { page, frame } = await open('p5')
    await settled(frame)
    const result = await probe(frame)
    expect(result.leak).toMatchObject({ fetch: 'blocked', xhr: 'blocked', ws: 'blocked', img: 'blocked', script: 'blocked', css: 'blocked' })
    expect(result.violations).toBeGreaterThanOrEqual(5)
    // sendBeacon's return value only says it was queued; what counts is whether anything arrived.
    await page.waitForTimeout(800)
    expect(outside.total() - before, `beacon said ${result.leak.beacon}; arrived: ${JSON.stringify([...outside.hits])}`).toBe(0)
    await page.close()
  })

  it('has no way to the page around it or the visitor\'s storage: it is sandboxed without allow-same-origin', async () => {
    const { page, frame } = await open('p5')
    expect(await frame.evaluate("(() => { try { return parent.document.title } catch { return 'blocked' } })()")).toBe('blocked')
    expect(await frame.evaluate("(() => { try { return String(localStorage.length) } catch { return 'blocked' } })()")).toBe('blocked')
    expect(await frame.evaluate("(() => { try { return document.cookie.length >= 0 ? 'allowed' : 'x' } catch { return 'blocked' } })()")).toBe('blocked')
    await page.close()
  })

  it('control: the same work without the policy does reach the outside, so the test can see a leak', async () => {
    const before = outside.total()
    const { page, frame } = await open('p5-open')
    await settled(frame)
    const result = await probe(frame)
    expect(result.leak.fetch).toBe('reached')
    expect(result.leak.img).toBe('reached')
    expect(outside.total() - before).toBeGreaterThan(0)
    await page.close()
  })

  it('loads Tone.js from lib/ under the policy', async () => {
    const { page, frame } = await open('tone')
    await frame.waitForFunction("typeof window.Tone?.Synth === 'function'")
    await page.close()
  })

  it('loads three.js, an ES module, from lib/three/ under the policy, because the site sends access-control-allow-origin: * (GitHub Pages does)', async () => {
    const { page, frame } = await open('three')
    await frame.waitForFunction('!!window.__three')
    expect(await frame.evaluate('window.__three.ok')).toBe('function')
    await page.close()
  })

  it('cannot load that module from a site that does not send the header: a sandboxed page has an opaque origin, so the module needs CORS', async () => {
    const { page, frame } = await open('three', siteNoCors)
    await page.waitForTimeout(1_000)
    expect(await frame.evaluate('!!window.__three')).toBe(false)
    await page.close()
  })

  it('documents a limit: a policy cannot stop a work navigating its own frame away (so the check bans location and meta refresh, and fails a navigation)', async () => {
    const before = outside.hits.get('/navigated') ?? 0
    const { page } = await open('navigates')
    await page.waitForTimeout(1_500)
    expect(outside.hits.get('/navigated') ?? 0).toBeGreaterThan(before)
    await page.close()
  })
})
