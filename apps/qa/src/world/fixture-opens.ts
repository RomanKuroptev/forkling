import { mkdirSync, readFileSync, rmSync } from 'node:fs'
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
import { screenFindings } from './screens.ts'
import { galleryFindings } from './gallery.ts'
import { doorwayFindings } from './doorway.ts'
import { insideWallsFindings, standingFindings } from './inside-walls.ts'
import { pictureChecks } from './pictures.ts'
import { phoneCoversMerge } from './phone.ts'
import { walkChecks } from './walk.ts'
import { budgetFindings } from './budget.ts'
import { claimFindings, claimsFromSite } from './claims.ts'
import { exhibitFindings } from './exhibits.ts'
import { collectCoveredDoors, collectFights, coveredDoorFindings, fightFindings } from './fights.ts'
import { collectThinMarks, thinMarkFindings } from './marks.ts'
import { buildSite } from '@forkling/site/build'
import { buildViewer, serveWorld } from './serve.ts'

/**
 * Opens one world folder in the viewer with `?world=local&qa=1` and checks that it gets ready and that the scene lists
 * everything its files name. Takes the start picture as evidence. A world that never gets ready is a major finding.
 */
export async function checkWorldOpens(browser: Browser, viewer: string, world: string, opts: { fixture: string; now: string; out: string; timeoutMs?: number; pictures?: boolean; walk?: boolean; qaOut?: string }): Promise<CheckResult[]> {
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
    const found = [...sceneListsFiles(world, geometry.scene, opts.fixture), ...geometryFindings(geometry), ...screenFindings(opts.fixture, geometry.scene), ...exhibitFindings(geometry.scene, opts.fixture), ...galleryFindings(opts.fixture, geometry.scene), ...doorwayFindings(opts.fixture, geometry.scene), ...insideWallsFindings(opts.fixture, geometry.scene), ...standingFindings(opts.fixture, geometry.scene), ...fightFindings(await collectFights(page), opts.fixture), ...coveredDoorFindings(await collectCoveredDoors(page), opts.fixture), ...thinMarkFindings(await collectThinMarks(page), opts.fixture)].map((f) => ({ ...f, evidence: [shot] }))
    if (opts.pictures) {
      // Night is after sunset and before sunrise in Stockholm (look.md's night colours); the levels for light differ.
      const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Stockholm', hour: '2-digit', hourCycle: 'h23' }).format(new Date(opts.now)))
      const pictures = await pictureChecks(page, { fixture: opts.fixture, scene: geometry.scene, night: hour >= 17 || hour < 8, out: opts.qaOut ?? qaOut() })
      found.push(...pictures.findings, ...budgetFindings(pictures.costs, opts.fixture))
      // What the built site says is in the world (its places and what each place page has on show).
      const site = join(opts.qaOut ?? qaOut(), 'site', opts.fixture)
      rmSync(site, { recursive: true, force: true })
      buildSite(world, site)
      found.push(...claimFindings(claimsFromSite(site), geometry.scene, opts.fixture))
      found.push(...(await phoneCoversMerge(browser, served.url, { fixture: opts.fixture, now: opts.now })))
    }
    if (opts.walk) {
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
/**
 * Which fixtures get the long checks (pictures, the phone, walking). The pull request tier (`pnpm qa fast`) opens every
 * fixture for the scene and geometry checks but takes pictures and walks only in `day-7`, to stay well under 15 minutes on
 * CI; `pnpm qa world` does every fixture, and `/qa` runs it, so every world sheet is in its report.
 */
export const FAST_DEEP: readonly string[] = ['day-7']

function worldCheck(deep: (fixture: string) => boolean, id: string, title: string): Check {
  return {
    id,
    area: 'world',
    title,
    run: async () => {
      const viewer = await buildViewer()
      const browser = await launchChromium()
      try {
        const out: CheckResult[] = []
        for (const name of FIXTURES) {
          const world = materialize(name, qaOut('fixtures', name, 'world'))
          const d = deep(name)
          out.push(...(await checkWorldOpens(browser, viewer, world, { fixture: name, now: readQaJson(name).now, out: qaOut('world'), pictures: d, walk: d })))
        }
        return out
      } finally {
        await browser.close()
      }
    },
  }
}

export const fixtureOpensCheck = worldCheck((f) => FAST_DEEP.includes(f), 'world.fixture-opens', 'Every fixture world opens and shows what its files name (pictures and walks in day-7)')
export const worldFullCheck = worldCheck(() => true, 'world.full', 'Every fixture world: scene, geometry, pictures, the phone, walking')
