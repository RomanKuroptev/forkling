import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Browser } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchChromium } from '../../src/browser.ts'
import { materialize, readQaJson } from '../../src/fixtures/fixtures.ts'
import { checkWorldOpens } from '../../src/world/fixture-opens.ts'
import { buildViewer } from '../../src/world/serve.ts'

// Drives Chromium: runs where the browser is installed (qa.yml sets QA_BROWSER=1 after `playwright install`).
describe.skipIf(process.env.QA_BROWSER !== '1')('a fixture world in the real viewer', () => {
  let browser: Browser
  let viewer: string
  beforeAll(async () => {
    viewer = buildViewer()
    browser = await launchChromium()
  }, 180_000)
  afterAll(async () => {
    await browser?.close()
  })

  it('day-0 opens, gets ready and lists its places, rooms and Merge', async () => {
    const world = materialize('day-0', join(mkdtempSync(join(tmpdir(), 'qa-open-')), 'world'))
    const out = mkdtempSync(join(tmpdir(), 'qa-shots-'))
    expect(await checkWorldOpens(browser, viewer, world, { fixture: 'day-0', now: readQaJson('day-0').now, out })).toEqual([])
  }, 120_000)

  it('planted: day-7 with the long exhibit id the engine wrote loses its Workshop, and the check says so', async () => {
    const world = materialize('day-7', join(mkdtempSync(join(tmpdir(), 'qa-open-')), 'world'))
    const file = join(world, 'places', 'workshop.json')
    const place = JSON.parse(readFileSync(file, 'utf8')) as { rooms: { id: string }[] }
    place.rooms[0]!.id = 'a-workshop-room-with-a-name-far-too-long-for-it'
    writeFileSync(file, JSON.stringify(place))
    const found = await checkWorldOpens(browser, viewer, world, { fixture: 'day-7', now: readQaJson('day-7').now, out: mkdtempSync(join(tmpdir(), 'qa-shots-')) })
    expect(found.map((f) => f.fingerprint)).toEqual(['world.scene-lists-files|day-7|place|workshop'])
    expect(found[0]!.what).toContain('does not fit the schema')
  }, 120_000)

  it('the R2 Workshop with its 42-character exhibit id (as the engine wrote it) is shown, since every reader repairs that id (#285)', async () => {
    const world = materialize('day-7', join(mkdtempSync(join(tmpdir(), 'qa-open-')), 'world'))
    const file = join(world, 'places', 'workshop.json')
    const place = JSON.parse(readFileSync(file, 'utf8')) as { exhibits: { id: string }[] }
    const cut = place.exhibits.find((e) => e.id === 'screen-a-door-that-opens-only-when-watche')!
    cut.id = 'screen-a-door-that-opens-only-when-watched'
    writeFileSync(file, JSON.stringify(place))
    expect(await checkWorldOpens(browser, viewer, world, { fixture: 'day-7', now: readQaJson('day-7').now, out: mkdtempSync(join(tmpdir(), 'qa-shots-')) })).toEqual([])
  }, 120_000)

  it('planted: a world with no forkling.json never gets ready, and that is a major finding', async () => {
    const world = materialize('day-0', join(mkdtempSync(join(tmpdir(), 'qa-open-')), 'world'))
    writeFileSync(join(world, 'forkling.json'), '{}')
    const found = await checkWorldOpens(browser, viewer, world, { fixture: 'day-0', now: readQaJson('day-0').now, out: mkdtempSync(join(tmpdir(), 'qa-shots-')), timeoutMs: 8000 })
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ id: 'world.fixture-opens', severity: 'major' })
  }, 120_000)
})
