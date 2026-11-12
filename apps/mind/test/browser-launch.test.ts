import { beforeEach, describe, expect, it, vi } from 'vitest'

const launches: Record<string, unknown>[] = []
vi.mock('playwright', () => ({
  chromium: {
    launch: async (options: Record<string, unknown>) => {
      launches.push(options)
      throw new Error('no browser in this test')
    },
  },
}))

const { launchChromium } = await import('../src/builds/browser.ts')

describe('launchChromium (spec 7.3: the pages are written by a model, so the browser keeps its own sandbox)', () => {
  beforeEach(() => {
    launches.length = 0
  })

  it('asks for the sandbox on every launch, for the bundled Chromium, Chrome and Edge alike (Playwright turns it off unless asked)', async () => {
    expect(await launchChromium()).toBeNull()
    expect(launches).toHaveLength(3)
    for (const options of launches) expect(options).toMatchObject({ chromiumSandbox: true })
    expect(launches.map((o) => o.channel)).toEqual([undefined, 'chrome', 'msedge'])
  })
})
