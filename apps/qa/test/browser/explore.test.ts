import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Browser } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchChromium } from '../../src/browser.ts'
import { materialize, readQaJson } from '../../src/fixtures/fixtures.ts'
import { ExploreSession } from '../../src/review/explore/session.ts'
import { openWorld } from '../../src/world/open.ts'
import { buildViewer, serveWorld, type Served } from '../../src/world/serve.ts'

describe.skipIf(process.env.QA_BROWSER !== '1')('the world explorer helpers on day-0', () => {
  let browser: Browser
  let served: Served
  let session: ExploreSession
  beforeAll(async () => {
    const world = materialize('day-0', join(mkdtempSync(join(tmpdir(), 'qa-explore-')), 'world'))
    served = await serveWorld(await buildViewer(), world)
    browser = await launchChromium()
    session = new ExploreSession(await openWorld(browser, served.url, { now: readQaJson('day-0').now }), 'test')
  }, 180_000)
  afterAll(async () => {
    await browser?.close()
    await served?.close()
  }, 60_000)

  it('takes a picture and says where the visitor is', async () => {
    const r = await session.run('shot', ['start'])
    expect(r.text).toMatch(/at x .*facing/)
    expect(existsSync(r.shot!)).toBe(true)
  }, 120_000)

  it('walks forward with the real key and ends up somewhere else', async () => {
    const before = await session.run('where', [])
    const after = await session.run('walk', ['forward', '1500'])
    expect(after.text).not.toBe(before.text)
    expect(existsSync(after.shot!)).toBe(true)
  }, 120_000)

  it('walks to the Workshop and looks at it', async () => {
    expect((await session.run('walk-to', ['workshop'])).text).toMatch(/arrived|stuck/)
    expect((await session.run('look-at', ['workshop'])).text).toContain('looking at place workshop')
  }, 240_000)

  it('says what is wrong with a command instead of failing silently', async () => {
    await expect(session.run('look-at', ['no-such-thing'])).rejects.toThrow(/nothing called/)
  })
})
