import { mkdirSync, readFileSync } from 'node:fs'
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
import { pictureChecks } from './pictures.ts'
import { phoneCoversMerge } from './phone.ts'
import { walkChecks } from './walk.ts'
import { buildViewer, serveWorld } from './serve.ts'

/**
 * Opens one world folder in the viewer with `?world=local&qa=1` and checks that it gets ready and that the scene lists
 * everything its files name. Takes the start picture as evidence. A world that never gets ready is a major finding.
 */
export async function checkWorldOpens(browser: Browser, viewer: string, world: string, opts: { fixture: string; now: string; out: string; timeoutMs?: number; pictures?: boolean; qaOut?: string }): Promise<CheckResult[]> {
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
    if (opts.pictures) {
      // Night is after sunset and before sunrise in Stockholm (look.md's night colours); the levels for light differ.
      const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Stockholm', hour: '2-digit', hourCycle: 'h23' }).format(new Date(opts.now)))
      const pictures = await pictureChecks(page, { fixture: opts.fixture, scene: geometry.scene, night: hour >= 17 || hour < 8, out: opts.qaOut ?? qaOut() })
      found.push(...pictures.findings)
      found.push(...(await phoneCoversMerge(browser, served.url, { fixture: opts.fixture, now: opts.now })))
      const seed = (JSON.parse(readFileSync(join(world, 'forkling.json'), 'utf8')) as { seed: number }).seed
      const start = { x: geometry.start.eye[0], z: geometry.start.eye[2], yaw: geometry.start.yaw }
      found.push(...(await walkChecks(page, { fixture: opts.fixture, seed, places: geometry.places, scene: geometry.scene, start })))
    }
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
        out.push(...(await checkWorldOpens(browser, viewer, world, { fixture: name, now: readQaJson(name).now, out: qaOut('world'), pictures: true })))
      }
      return out
    } finally {
      await browser.close()
    }
  },
}
