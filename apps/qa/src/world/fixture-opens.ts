import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { Browser } from 'playwright'
import { launchChromium } from '../browser.ts'
import { FIXTURES, materialize, readQaJson } from '../fixtures/fixtures.ts'
import { qaOut } from '../paths.ts'
import type { CheckResult } from '../report/finding.ts'
import type { Check } from '../run/check.ts'
import { openWorld } from './open.ts'
import { sceneListsFiles } from './scene-lists-files.ts'
import { collectGeometry } from './collect.ts'
import { geometryFindings } from './geometry.ts'
import { buildViewer, serveWorld } from './serve.ts'

/**
 * Opens one world folder in the viewer with `?world=local&qa=1` and checks that it gets ready and that the scene lists
 * everything its files name. Takes the start picture as evidence. A world that never gets ready is a major finding.
 */
export async function checkWorldOpens(browser: Browser, viewer: string, world: string, opts: { fixture: string; now: string; out: string; timeoutMs?: number }): Promise<CheckResult[]> {
  const served = await serveWorld(viewer, world)
  try {
    let page
    try {
      page = await openWorld(browser, served.url, { now: opts.now, ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}) })
    } catch (e) {
      return [
        {
          id: 'world.fixture-opens',
          fingerprint: `world.fixture-opens|${opts.fixture}`,
          severity: 'major',
          title: `The 3D world of ${opts.fixture} does not open`,
          what: e instanceof Error ? e.message : String(e),
          causes: 'A visitor waits on the loading screen, or sees an error, instead of the world.',
          evidence: [],
          fixKind: 'code',
          fixture: opts.fixture,
        },
      ]
    }
    // One second of world time, so the visitor has landed on the ground (it starts 1.5 m up) and the arrival view is the real one.
    await page.evaluate(() => (globalThis as unknown as { __qa: { step(ms: number): Promise<void> } }).__qa.step(1000))
    mkdirSync(opts.out, { recursive: true })
    const shot = join(opts.out, `${opts.fixture}-start.png`)
    await page.screenshot({ path: shot })
    const geometry = await collectGeometry(page, world, opts.fixture, Date.parse(opts.now) + 1000)
    const found = [...sceneListsFiles(world, geometry.scene, opts.fixture), ...geometryFindings(geometry)].map((f) => ({ ...f, evidence: [shot] }))
    await page.close()
    return found
  } finally {
    await served.close()
  }
}

/** Every committed fixture opens and lists every place, room, work and Merge (steps Q1, done when). */
export const fixtureOpensCheck: Check = {
  id: 'world.fixture-opens',
  area: 'world',
  title: 'Every fixture world opens and shows what its files name',
  run: async () => {
    const viewer = buildViewer()
    const browser = await launchChromium()
    try {
      const out: CheckResult[] = []
      for (const name of FIXTURES) {
        const world = materialize(name, qaOut('fixtures', name, 'world'))
        out.push(...(await checkWorldOpens(browser, viewer, world, { fixture: name, now: readQaJson(name).now, out: qaOut('world') })))
      }
      return out
    } finally {
      await browser.close()
    }
  },
}
