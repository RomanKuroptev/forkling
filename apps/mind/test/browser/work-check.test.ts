import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { createBrowserChecker, CHECK_MS } from '../../src/builds/browser-check.ts'
import { withPolicy } from '../../src/builds/sandbox.ts'
import { launchBrowser, outsideServer } from './helpers.ts'

/**
 * The browser step of the check (spec 7.3, steps 2 to 4): the work loaded through the real layout (the 7.4 iframe and policy)
 * in headless Chromium, watched for a few seconds. It fails on an uncaught error, a library that did not load, a frame that
 * never renders, a navigation, or a screenshot of a single colour, and it saves the screenshot as the thumbnail.
 */

const probe = await launchBrowser()
await probe?.close()

// Starting a browser takes seconds when the whole suite is running at once, so these get far more than the default 5.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const MS = 1_200
const page = (body: string, head = '') => withPolicy(`<!doctype html><html><head><meta charset="utf-8"><title>w</title>${head}</head><body style="margin:0">${body}</body></html>`)
const P5 = '<script src="../../lib/p5.min.js"></script>'
const sketch = (draw: string) => page(`${P5}<script>function setup() { createCanvas(480, 360) } function draw() { ${draw} }</script>`)
const good = sketch('background(20); noStroke(); fill(255, 0, 0); rect(40, 40, 200, 150)')
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

describe.skipIf(!probe)('the browser check (spec 7.3)', () => {
  const checker = createBrowserChecker({ launch: launchBrowser, durationMs: MS })
  afterAll(() => checker.close())
  const run = (html: string, size: 'full' | 'sketch' = 'full') => checker.check(html, { size })

  it('passes a work that loads its library and draws, and gives back its screenshot as the thumbnail', async () => {
    const r = await run(good)
    expect(r.reasons).toEqual([])
    expect(r.ok).toBe(true)
    expect(r.thumb!.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true)
    expect(r.thumb!.length).toBeLessThan(300_000)
  })

  it('watches for 5 seconds unless told otherwise', () => {
    expect(CHECK_MS).toBe(5_000)
  })

  it('refuses at the static step without starting a browser, and says why', async () => {
    const lazy = createBrowserChecker({ launch: async () => { throw new Error('the browser must not start') }, durationMs: MS })
    const r = await lazy.check(page(`<script>fetch('https://example.org/steal')</script>`), { size: 'full' })
    expect(r.ok).toBe(false)
    expect(r.reasons.join(' ')).toMatch(/fetch/)
    expect(r.thumb).toBeNull()
    await lazy.close()
  })

  it('fails an uncaught error, with its message', async () => {
    const r = await run(sketch(`background(20); if (frameCount > 5) throw new Error('boom in draw')`))
    expect(r.ok).toBe(false)
    expect(r.reasons.join(' ')).toMatch(/boom in draw/)
  })

  it('fails a library that did not load, and names it', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'no-libs-'))
    mkdirSync(join(empty, 'lib'))
    const bare = createBrowserChecker({ launch: launchBrowser, durationMs: MS, libsDir: empty })
    const r = await bare.check(good, { size: 'full' })
    expect(r.ok).toBe(false)
    expect(r.reasons.join(' ')).toMatch(/p5\.min\.js/)
    expect(r.reasons.join(' ')).toMatch(/did not load/)
    await bare.close()
    rmSync(empty, { recursive: true, force: true })
  })

  it('fails a page of a single colour', async () => {
    const r = await run(page('<div style="width:100vw;height:100vh;background:#123456"></div>'))
    expect(r.ok).toBe(false)
    expect(r.reasons.join(' ')).toMatch(/single colour/i)
  })

  it('fails a frame that never renders (a loop that never ends), and is still usable afterwards', async () => {
    const r = await run(page('<script>while (true) {}</script>'))
    expect(r.ok).toBe(false)
    expect(r.reasons.join(' ')).toMatch(/never rendered/i)
    expect((await run(good)).ok).toBe(true)
  }, 60_000)

  it('fails a work that sends its frame away, even one written to slip past the text scan', async () => {
    const r = await run(sketch(`background(20); if (frameCount === 3) window['loc' + 'ation'].href = 'about:blank'`))
    expect(r.ok).toBe(false)
    expect(r.reasons.join(' ')).toMatch(/navigat/i)
  })

  it('keeps the reasons free of markup', async () => {
    const r = await run(sketch(`throw new Error('<script>alert(1)</script>')`))
    expect(r.ok).toBe(false)
    expect(r.reasons.join(' ')).not.toMatch(/[<>]/)
  })

  it('does not take two checks at once: they run one after the other', async () => {
    const both = await Promise.all([run(good), run(good)])
    expect(both.map((r) => r.ok)).toEqual([true, true])
  })
})

describe.skipIf(!probe)('a shelved work, as it is stored and shown (done when, spec 16)', () => {
  it('loads its library and cannot reach the network', async () => {
    const outside = await outsideServer()
    const out = outside.origin
    // Written to get out by every route, and to catch what stops it, so the check itself passes.
    const shelved = sketch(`background(20); noStroke(); fill(0, 200, 120); rect(40, 40, 200, 150)`).replace(
      '</body>',
      `<script>
        const g = window
        try { g['fe' + 'tch']('${out}/f').catch(() => {}) } catch {}
        try { const x = new g['XMLHttp' + 'Request'](); x.open('GET', '${out}/x'); x.send() } catch {}
        try { new g['Web' + 'Socket']('${out.replace('http', 'ws')}/w') } catch {}
        try { new Image().src = '${out}/i.png' } catch {}
        try { g.navigator['send' + 'Beacon']('${out}/b', 'x') } catch {}
      </script></body>`,
    )
    const checker = createBrowserChecker({ launch: launchBrowser, durationMs: 2_500 })
    const r = await checker.check(shelved, { size: 'full' })
    await checker.close()
    expect(r.reasons).toEqual([])
    expect(r.ok, 'its library loaded and it drew').toBe(true)
    expect(outside.total(), JSON.stringify([...outside.hits])).toBe(0)
    await outside.close()
  }, 60_000)
})
