import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import type { WorkChecker } from '../src/builds/browser-check.ts'
import { fakeFetch, fakeModel } from '../src/fast-forward-fakes.ts'
import { cappedModel, localMidnight, remotesOf, runFastForward, watchedFetch, type FastForwardOptions } from '../src/fast-forward.ts'
import type { LlmRequest } from '../src/llm.ts'
import { loadSpecies } from '../src/species.ts'

const merge = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const template = fileURLToPath(new URL('../../../templates/forkling-world', import.meta.url))
const cat = loadSpecies('cat')
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const HOUR = 3_600_000

const roots: string[] = []
afterAll(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true })
})
const temp = (name: string) => {
  const d = mkdtempSync(join(tmpdir(), name))
  roots.push(d)
  return d
}

/** A fresh world from the templates, as the W7 week test builds one. */
function world(): string {
  const dir = temp('ff-world-')
  copyFileSync(join(merge, 'forkling.json'), join(dir, 'forkling.json'))
  mkdirSync(join(dir, 'places'))
  for (const f of readdirSync(join(template, 'places'))) copyFileSync(join(template, 'places', f), join(dir, 'places', f))
  return dir
}

const checker = (): WorkChecker => ({
  async check() {
    return { ok: true, reasons: [], thumb: PNG }
  },
  available: async () => true,
  close: async () => undefined,
})

const START = localMidnight('Europe/Stockholm', '2026-11-03')
const options = (dir: string, over: Partial<FastForwardOptions> = {}): FastForwardOptions => ({
  dir,
  days: 1,
  capUsd: 1,
  startMs: START,
  // Midnight to early afternoon: a night, a wake, a morning plan and its sketch.
  durationMs: 14 * HOUR,
  llm: fakeModel(),
  fetchImpl: fakeFetch,
  realSleep: async () => undefined,
  workCheck: checker(),
  pack: cat.pack,
  behaviors: cat.behaviors,
  speciesPersona: cat.persona,
  engine: 'test-engine-abc123',
  outDir: temp('ff-out-'),
  ...over,
})

describe('localMidnight', () => {
  it('is midnight in the world\'s time zone, summer or winter', () => {
    expect(new Date(localMidnight('Europe/Stockholm', '2026-11-03')).toISOString()).toBe('2026-11-02T23:00:00.000Z')
    expect(new Date(localMidnight('Europe/Stockholm', '2026-07-01')).toISOString()).toBe('2026-06-30T22:00:00.000Z')
  })
})

describe('the cap for the run', () => {
  it('counts what each call cost and refuses every call once the cap is spent', async () => {
    const capped = cappedModel(fakeModel(), 0.0005)
    const req = { kind: 'decide', model: 'claude-haiku-5-5', system: '', user: '', maxTokens: 10, effort: 'low', schema: null } as unknown as LlmRequest
    await capped.client.complete(req)
    expect(capped.spentUsd).toBeCloseTo((800 * 0.1 + 300 * 0.5) / 1e6, 9)
    expect(capped.reached).toBe(false)
    await capped.client.complete(req)
    await capped.client.complete(req)
    expect(capped.reached).toBe(true)
    await expect(capped.client.complete(req)).rejects.toThrow(/cap/)
    expect(capped.refused).toBe(1)
  })
})

describe('the web during a run', () => {
  it('notes every request to a host off the allowlist, and waits a real second between two to one host', async () => {
    const off: string[] = []
    const waits: number[] = []
    const fetch = watchedFetch(fakeFetch, off, async (ms) => void waits.push(ms))
    await fetch('https://en.wikipedia.org/wiki/Cat')
    await fetch('https://en.wikipedia.org/wiki/Dog')
    await fetch('https://evil.example/')
    expect(off).toEqual(['https://evil.example/'])
    expect(waits).toHaveLength(1)
  })
})

describe('refusing a world that could push', () => {
  it('stops before anything runs when the world has a git remote', async () => {
    const dir = world()
    execFileSync('git', ['-C', dir, 'init', '-q'])
    execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', 'https://github.com/someone/world.git'])
    expect(remotesOf(dir)).toEqual(['origin'])
    await expect(runFastForward(options(dir))).rejects.toThrow(/remote/)
    expect(existsSync(join(dir, 'mind'))).toBe(false)
  })

  it('will not write its summary inside the world', async () => {
    const dir = world()
    await expect(runFastForward(options(dir, { outDir: join(dir, 'out') }))).rejects.toThrow(/outside/)
  })
})

describe('a short run with the fakes', () => {
  it('runs the loop and the build worker on the fake clock and passes', async () => {
    const dir = world()
    const lines: string[] = []
    const o = options(dir, { log: (l) => lines.push(l) })
    const result = await runFastForward(o)
    expect(result.crashes).toBe(0)
    expect(result.railsBroken).toEqual([])
    expect(result.report.made.items.length).toBeGreaterThan(0)
    expect(result.reasons).toEqual([])
    expect(result.pass).toBe(true)
    // 14 hours of ticks every 10 s awake and 60 s asleep, not real time.
    expect(result.ticks).toBeGreaterThan(14 * 60)
    expect(result.ticks).toBeLessThan(14 * 360)

    const summary = readFileSync(result.summaryPath, 'utf8')
    expect(summary).toContain('# Fast-forward: PASS')
    expect(summary).toContain('Engine: test-engine-abc123')
    expect(summary).toContain('## Spend per simulated day')
    expect(summary).toMatch(/## Screenshots: [1-9]/)
    expect(existsSync(join(o.outDir, 'run-report.txt'))).toBe(true)
    expect(readdirSync(join(o.outDir, 'shots')).length).toBeGreaterThan(0)
    // The tick log carries the engine it ran on.
    const tickLog = readFileSync(join(dir, 'mind/ticks/2026-11-03.jsonl'), 'utf8')
    expect(tickLog).toContain('"engine":"test-engine-abc123"')
  }, 300_000)

  it('stops cleanly at the cap and fails, saying why', async () => {
    const result = await runFastForward(options(world(), { capUsd: 0.000001 }))
    expect(result.stoppedAtCap).toBe(true)
    expect(result.crashes).toBe(0)
    expect(result.pass).toBe(false)
    expect(result.reasons.join(' ')).toMatch(/stopped at the cap/)
    expect(readFileSync(result.summaryPath, 'utf8')).toContain('# Fast-forward: FAIL')
  }, 300_000)

  it('fails a day with nothing visual made', async () => {
    const model = fakeModel()
    const plain = { ...model, complete: (async (req: LlmRequest) => (req.kind === 'sketch' ? { parsed: null, stopReason: 'refusal', usage: { input: 1, cacheRead: 0, cacheWrite: 0, output: 1 } } : model.complete(req))) as typeof model.complete }
    const result = await runFastForward(options(world(), { llm: plain }))
    expect(result.pass).toBe(false)
    expect(result.reasons).toContain('2026-11-03: nothing visual made')
  }, 300_000)
})
