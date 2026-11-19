import { join } from 'node:path'
import { launchChromium } from '../browser.ts'
import { materialize, readQaJson } from '../fixtures/fixtures.ts'
import type { CheckResult } from '../report/finding.ts'
import { openWorld } from './open.ts'
import { buildViewer, serveWorld } from './serve.ts'

/**
 * Real frame rate (audit spec 7.5), on Roman's PC only: headed Chromium with the GPU, a laptop window (1280x800) and a phone
 * preset (390x844 with 4x CPU slowdown), 20 seconds per fixture while the visitor walks forward from the arrival point.
 */
export type Device = 'laptop' | 'phone'

/** Floors (spec 7.5): below is a major finding. day-30 is the heavy world; every other fixture uses day-7's floors. */
export function fpsFloor(fixture: string, device: Device): number {
  if (fixture === 'day-30') return device === 'laptop' ? 30 : 24
  return device === 'laptop' ? 50 : 30
}

export interface FpsResult {
  fixture: string
  device: Device
  fps: number
}

export function fpsFindings(results: readonly FpsResult[]): CheckResult[] {
  return results
    .filter((r) => r.fps < fpsFloor(r.fixture, r.device))
    .map((r) => ({
      id: 'world.fps',
      fingerprint: `world.fps|${r.fixture}|${r.device}`,
      severity: 'major' as const,
      title: `The world runs at ${r.fps.toFixed(0)} frames a second on the ${r.device === 'laptop' ? 'laptop window' : 'phone preset'} (${r.fixture})`,
      what: `${r.fps.toFixed(1)} fps while walking for the measured time; the floor is ${fpsFloor(r.fixture, r.device)}.`,
      causes: 'Walking the world stutters.',
      evidence: [],
      fixKind: 'code' as const,
      fixture: r.fixture,
    }))
}

export async function measureFps(fixtures: readonly string[], opts: { seconds: number; out: string; headed: boolean }): Promise<FpsResult[]> {
  const viewer = await buildViewer()
  // The real GPU: headed, with no software-rendering flags (launchChromium only adds SwiftShader when headless).
  const browser = await launchChromium({ headed: opts.headed })
  const results: FpsResult[] = []
  try {
    for (const fixture of fixtures) {
      const world = materialize(fixture, join(opts.out, 'fps', fixture, 'world'))
      const served = await serveWorld(viewer, world)
      try {
        for (const device of ['laptop', 'phone'] as const) {
          const page = await openWorld(browser, served.url, { now: readQaJson(fixture).now, phone: device === 'phone' })
          if (device === 'phone') await (await page.context().newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: 4 })
          const fps = await page.evaluate(async (seconds) => {
            const qa = (globalThis as unknown as { __qa: { step(ms: number): Promise<void>; fps(s: number): Promise<number> } }).__qa
            await qa.step(1000)
            const w = globalThis as unknown as { dispatchEvent(e: unknown): void; KeyboardEvent: new (t: string, o: object) => unknown }
            w.dispatchEvent(new w.KeyboardEvent('keydown', { code: 'KeyW', key: 'KeyW' }))
            const value = await qa.fps(seconds)
            w.dispatchEvent(new w.KeyboardEvent('keyup', { code: 'KeyW', key: 'KeyW' }))
            return value
          }, opts.seconds)
          results.push({ fixture, device, fps })
          await page.close()
        }
      } finally {
        await served.close()
      }
    }
  } finally {
    await browser.close()
  }
  return results
}
