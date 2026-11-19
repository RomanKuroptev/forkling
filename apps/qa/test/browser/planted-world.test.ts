import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Browser } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchChromium } from '../../src/browser.ts'
import { materialize, readQaJson } from '../../src/fixtures/fixtures.ts'
import { checkWorldOpens } from '../../src/world/fixture-opens.ts'
import { buildViewer } from '../../src/world/serve.ts'

/** The planted world flaws of audit QW.7, made at test time from day-7: through the world files where they can say it. */
describe.skipIf(process.env.QA_BROWSER !== '1')('planted flaws in day-7, found by the world checks', () => {
  let browser: Browser
  let viewer: string
  beforeAll(async () => {
    viewer = buildViewer()
    browser = await launchChromium()
  }, 180_000)
  afterAll(async () => {
    await browser?.close()
  })

  const day7 = () => materialize('day-7', join(mkdtempSync(join(tmpdir(), 'qa-plant-')), 'world'))
  const edit = (world: string, rel: string, change: (data: Record<string, unknown>) => void) => {
    const data = JSON.parse(readFileSync(join(world, rel), 'utf8')) as Record<string, unknown>
    change(data)
    writeFileSync(join(world, rel), JSON.stringify(data, null, 2))
  }
  const run = (world: string) => checkWorldOpens(browser, viewer, world, { fixture: 'day-7', now: readQaJson('day-7').now, out: mkdtempSync(join(tmpdir(), 'qa-shots-')) })

  it('a work its file says is in the Workshop, but is not there (files)', async () => {
    const world = day7()
    edit(world, 'works/stand-still/meta.json', (m) => (m.installedIn = 'workshop/bench/0/0'))
    const found = await run(world)
    expect(found.map((f) => f.fingerprint)).toContain('world.work-not-installed|day-7|stand-still')
  }, 120_000)

  it('a place pushed through another (files)', async () => {
    const world = day7()
    edit(world, 'places/hillside-room-five-lamps.json', (p) => {
      p.chunk = [0, 0]
      p.offset = [12, 0]
    })
    const found = await run(world)
    expect(found.some((f) => f.id === 'world.places-overlap' && f.fingerprint.includes('workshop') && f.fingerprint.includes('hillside-room-five-lamps'))).toBe(true)
  }, 120_000)

  it('a missing texture: the sign boards drawn with a texture that never loaded (planted in qa.json), found on the pictures', async () => {
    const world = day7()
    edit(world, 'qa.json', (q) => (q.plant = { missingTexture: ['signs'] }))
    const found = await checkWorldOpens(browser, viewer, world, { fixture: 'day-7', now: readQaJson('day-7').now, out: mkdtempSync(join(tmpdir(), 'qa-shots-')), pictures: true, qaOut: mkdtempSync(join(tmpdir(), 'qa-out-')) })
    expect(found.filter((f) => f.id === 'world.missing-texture').map((f) => f.fingerprint)).toEqual(['world.missing-texture|day-7|signs'])
  }, 240_000)

  it('the pictures of clean day-7 have no missing texture, blank view or bad light', async () => {
    const found = await checkWorldOpens(browser, viewer, day7(), { fixture: 'day-7', now: readQaJson('day-7').now, out: mkdtempSync(join(tmpdir(), 'qa-shots-')), pictures: true, qaOut: mkdtempSync(join(tmpdir(), 'qa-out-')) })
    expect(found.filter((f) => ['world.missing-texture', 'world.blank', 'world.too-dark', 'world.too-bright'].includes(f.id))).toEqual([])
  }, 240_000)

  it('a wall you can walk through, and an invisible wall in the way (planted in qa.json)', async () => {
    const world = day7()
    // The Workshop's walls stop no one; an undrawn wall stands across the way from the arrival point to the hillside place.
    edit(world, 'qa.json', (q) => (q.plant = { walkThrough: ['workshop'], invisibleWall: [{ x: 8, z: 21, w: 14, d: 0.4 }] }))
    const found = await checkWorldOpens(browser, viewer, world, { fixture: 'day-7', now: readQaJson('day-7').now, out: mkdtempSync(join(tmpdir(), 'qa-shots-')), walk: true, qaOut: mkdtempSync(join(tmpdir(), 'qa-out-')) })
    const ids = found.map((f) => f.fingerprint)
    expect(ids).toContain('world.walk-through-wall|day-7|workshop')
    expect(ids.some((f) => f.startsWith('world.invisible-wall|day-7|'))).toBe(true)
  }, 300_000)

  it('clean day-7 can be walked: every place reached, no wall walked through, no hole, no invisible wall', async () => {
    const found = await checkWorldOpens(browser, viewer, day7(), { fixture: 'day-7', now: readQaJson('day-7').now, out: mkdtempSync(join(tmpdir(), 'qa-shots-')), walk: true, qaOut: mkdtempSync(join(tmpdir(), 'qa-out-')) })
    expect(found.filter((f) => ['world.cannot-reach', 'world.invisible-wall', 'world.walk-through-wall', 'world.hole', 'world.camera-in-mesh'].includes(f.id))).toEqual([])
  }, 300_000)

  it('a floating sign (planted in qa.json: the files cannot say it)', async () => {
    const world = day7()
    edit(world, 'qa.json', (q) => (q.plant = { raise: [{ id: 'home/sign', dy: 3 }] }))
    const found = await run(world)
    expect(found.map((f) => f.fingerprint)).toContain('world.floating|day-7|home/sign')
  }, 120_000)
})
