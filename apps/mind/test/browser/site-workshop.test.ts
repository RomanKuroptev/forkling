import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { withPolicy, WorkMeta } from '@forkling/schema'
import { buildSite } from '@forkling/site/build'
import type { BrowserContext, Frame } from 'playwright'
import { launchBrowser, outsideServer, serveDir, type Fixture } from './helpers.ts'

/**
 * The whole path of W4, in a real browser: a work on the shelf of a world, the site built from it the way pages.yml builds it,
 * and the work opened from its own page. Its library comes from the site's `lib/`, it draws, and it cannot reach the network.
 */

// Starting a browser takes seconds when the whole suite is running at once.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 })

const templates = fileURLToPath(new URL('../../../../templates/merge', import.meta.url))
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
const browser = await launchBrowser()

describe.skipIf(!browser)('the workshop of the built site, in a browser', () => {
  let world: string
  let out: string
  let site: Fixture
  let outside: Fixture
  let context: BrowserContext

  beforeAll(async () => {
    world = mkdtempSync(join(tmpdir(), 'ws-world-'))
    out = mkdtempSync(join(tmpdir(), 'ws-out-'))
    outside = await outsideServer()
    copyFileSync(join(templates, 'forkling.json'), join(world, 'forkling.json'))
    // A shelved work, as the tinker step leaves it: the policy first in its head, p5 from lib/, and tries to get out by every route.
    const html = withPolicy(`<!doctype html><html><head><meta charset="utf-8"><title>Humming lamp</title></head><body style="margin:0">
      <script src="../../lib/p5.min.js"></script>
      <script>
        function setup() { createCanvas(480, 360) }
        function draw() { background(20); noStroke(); fill(255, 0, 0); rect(40, 40, 200, 150) }
        const g = window
        try { g['fe' + 'tch']('${outside.origin}/f').catch(() => {}) } catch {}
        try { new Image().src = '${outside.origin}/i.png' } catch {}
        try { g.navigator['send' + 'Beacon']('${outside.origin}/b', 'x') } catch {}
      </script></body></html>`)
    mkdirSync(join(world, 'works/humming-lamp'), { recursive: true })
    writeFileSync(join(world, 'works/humming-lamp/index.html'), html)
    writeFileSync(join(world, 'works/humming-lamp/thumb.png'), PNG)
    writeFileSync(
      join(world, 'works/humming-lamp/meta.json'),
      JSON.stringify(WorkMeta.parse({ id: 'humming-lamp', title: 'Humming lamp', kind: 'art', about: 'A lamp that hums in a small way.', interest: null, made: '2026-11-03T10:00:00Z', status: 'shelf', size: 'sketch', libraries: ['p5'] })),
    )
    buildSite(world, out)
    site = await serveDir(out)
    context = await browser!.newContext()
  })

  afterAll(async () => {
    await context?.close()
    await browser?.close()
    await Promise.all([site?.close(), outside?.close()])
    rmSync(world, { recursive: true, force: true })
    rmSync(out, { recursive: true, force: true })
  })

  async function workFrame(): Promise<{ frame: Frame; close: () => Promise<void> }> {
    const page = await context.newPage()
    await page.goto(`${site.origin}/workshop/humming-lamp.html`)
    const deadline = Date.now() + 8_000
    while (Date.now() < deadline) {
      const frame = page.frames().find((f) => f.url().endsWith('/works/humming-lamp/index.html'))
      if (frame) return { frame, close: () => page.close() }
      await page.waitForTimeout(50)
    }
    throw new Error('the work never appeared in its frame')
  }

  it('lists the work on the shelf, with its thumbnail, and puts no frame on the shelf page', async () => {
    const page = await context.newPage()
    await page.goto(`${site.origin}/workshop/`)
    expect(await page.locator('a[href="humming-lamp.html"]').count()).toBeGreaterThan(0)
    expect(await page.locator('iframe').count()).toBe(0)
    // A sketch is on the shelf and in the strip of its day.
    expect(await page.locator('img[src="../works/humming-lamp/thumb.png"]').count()).toBe(2)
    await page.close()
  })

  it('opens the work from its own page: p5 comes from the site, and it draws', async () => {
    const { frame, close } = await workFrame()
    await frame.waitForFunction("!!document.querySelector('canvas')")
    expect(await frame.evaluate('typeof window.p5')).toBe('function')
    await frame.evaluate('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))')
    const pixel = await frame.evaluate(`(() => {
      const c = document.querySelector('canvas')
      const k = c.width / 480
      return Array.from(c.getContext('2d').getImageData(Math.floor(80 * k), Math.floor(80 * k), 1, 1).data)
    })()`)
    expect(pixel).toEqual([255, 0, 0, 255])
    await close()
  })

  it('cannot reach the network, and cannot see the page around it', async () => {
    const before = outside.total()
    const { frame, close } = await workFrame()
    await frame.waitForFunction("!!document.querySelector('canvas')")
    await frame.page().waitForTimeout(1_000)
    expect(outside.total() - before, JSON.stringify([...outside.hits])).toBe(0)
    expect(await frame.evaluate("(() => { try { return parent.document.title } catch { return 'blocked' } })()")).toBe('blocked')
    await close()
  })
})
