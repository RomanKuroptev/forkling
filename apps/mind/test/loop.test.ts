import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Health } from '@forkling/schema'
import type { Decision } from '../src/decision.ts'
import type { LlmClient, LlmRequest } from '../src/llm.ts'
import { loadSpecies } from '../src/species.ts'
import type { GitRunner } from '../src/tick/git.ts'
import { createLoop, isProduct } from '../src/tick/loop.ts'
import { noBatch } from './noBatch.ts'

const templates = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const cat = loadSpecies('cat')
const MIN = 60_000

// An hour of reflex ticks is 360 real ticks over a real world directory, so a test can take several seconds.
vi.setConfig({ testTimeout: 60_000 })

/** 10:00 in Stockholm on a Thursday, long after waking; and 00:30 the same night, long after bedtime. */
const AWAKE = Date.parse('2026-11-12T09:00:00Z')
const ASLEEP = Date.parse('2026-11-12T23:30:00Z')

const step = (verb: string, target: string | null, minutes: number, reason: string) => ({ verb, target, reason, minutes, wantId: null, deep: null, size: null })
const plan: Decision = {
  thought: 'A quiet start.',
  longGoal: null,
  dropLongGoal: false,
  plan: [step('rest', null, 30, 'I want a slow start.'), step('wander', 'lighthouses', 30, 'I want to know what a keeper does.'), step('rest', null, 30, 'Time to think it over.')],
  planReason: 'A slow day.',
  stayUpLate: null,
}

function fakeLlm() {
  const calls: LlmRequest[] = []
  const llm: LlmClient = {
    ...noBatch,
    async complete<T>(req: LlmRequest<T>) {
      calls.push(req)
      const parsed = req.kind === 'thought' ? { thought: 'Hm, the lighthouse.', scores: [], surprise: 1, action: 'continue', reason: null } : plan
      return { parsed: parsed as T, stopReason: 'end_turn', usage: { input: 800, cacheRead: 0, cacheWrite: 0, output: 200 } }
    },
  }
  return { llm, calls }
}

function fakeGit(answer: (args: readonly string[]) => number = (a) => (a[0] === 'diff' ? 1 : 0)) {
  const log: string[] = []
  const run: GitRunner = async (args) => {
    log.push(args.join(' '))
    return { code: answer(args), stdout: '' }
  }
  return { log, run }
}

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'loop-'))
  copyFileSync(join(templates, 'forkling.json'), join(dir, 'forkling.json'))
  mkdirSync(join(dir, 'objects'))
  for (const f of readdirSync(join(templates, 'objects'))) copyFileSync(join(templates, 'objects', f), join(dir, 'objects', f))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function makeLoop(start: number, llm: LlmClient | null, git: GitRunner | null) {
  const clock = { ms: start }
  const loop = createLoop({
    dir,
    clock: () => clock.ms,
    deps: { llm, pack: cat.pack, behaviors: cat.behaviors, speciesPersona: cat.persona, engine: 'test' },
    git,
  })
  /** Runs the loop on fake time for `minutes`, one reflex tick after another, as the real loop would. */
  const runFor = async (minutes: number) => {
    const end = clock.ms + minutes * MIN
    let ticks = 0
    while (clock.ms < end) {
      await loop.tickOnce()
      ticks++
      clock.ms += loop.nextDelayMs()
    }
    return ticks
  }
  return { loop, clock, runFor }
}

const tickLines = () => {
  const folder = join(dir, 'mind/ticks')
  return readdirSync(folder).flatMap((f) => readFileSync(join(folder, f), 'utf8').split('\n').filter(Boolean))
}

describe('the reflex tick (spec 2.2)', () => {
  it('comes every 10 seconds while awake: an hour is 360 ticks', async () => {
    const { llm } = fakeLlm()
    const { runFor } = makeLoop(AWAKE, llm, null)
    expect(await runFor(60)).toBe(360)
  })

  it('comes every 60 seconds while asleep, and makes no model call', async () => {
    const { llm, calls } = fakeLlm()
    const { runFor, loop } = makeLoop(ASLEEP, llm, null)
    expect(await runFor(60)).toBe(60)
    expect(calls).toEqual([])
    expect(loop.now()?.asleep).toBe(true)
  })

  it('writes the tick log about once a minute, not at every tick', async () => {
    const { llm } = fakeLlm()
    const { runFor } = makeLoop(AWAKE, llm, null)
    await runFor(60)
    const lines = tickLines().length
    expect(lines).toBeGreaterThanOrEqual(55)
    expect(lines).toBeLessThanOrEqual(85)
  })
})

describe('the thought tick in the loop', () => {
  it('runs every 5 minutes through the day: 12 in an hour, on time', async () => {
    const { llm, calls } = fakeLlm()
    const { runFor } = makeLoop(AWAKE, llm, null)
    await runFor(60)
    expect(calls.filter((c) => c.kind === 'thought')).toHaveLength(12)
  })

  it('runs every 2 minutes from 18:00: 30 in an hour', async () => {
    const { llm, calls } = fakeLlm()
    const { runFor } = makeLoop(Date.parse('2026-11-12T17:00:00Z'), llm, null)
    await runFor(60)
    expect(calls.filter((c) => c.kind === 'thought')).toHaveLength(30)
  })

  it('shows the last thought line in now.json', async () => {
    const { llm } = fakeLlm()
    const { loop } = makeLoop(AWAKE, llm, null)
    await loop.tickOnce()
    expect(loop.now()).toMatchObject({ asleep: false, thought: 'Hm, the lighthouse.' })
  })
})

describe('now.json', () => {
  it('has the step in progress, the mood in words and when it was made', async () => {
    const { llm } = fakeLlm()
    const { loop } = makeLoop(AWAKE, llm, null)
    await loop.tickOnce()
    const now = loop.now()
    expect(now?.updatedAt).toBe(new Date(AWAKE).toISOString())
    expect(now?.step).toMatchObject({ verb: 'rest' })
    expect(typeof now?.mood).toBe('string')
  })

  it('is null before the first tick', () => {
    expect(makeLoop(AWAKE, null, null).loop.now()).toBeNull()
  })
})

describe('commits (spec 2.2: every 15 minutes, and when a step produces a file)', () => {
  it('commits about every 15 minutes, each time pulling with rebase before the push', async () => {
    const { llm } = fakeLlm()
    const git = fakeGit()
    const { runFor } = makeLoop(AWAKE, llm, git.run)
    await runFor(60)
    const commits = git.log.filter((c) => c.startsWith('commit')).length
    expect(commits).toBeGreaterThanOrEqual(3)
    expect(commits).toBeLessThanOrEqual(6)
    git.log.forEach((c, i) => {
      if (c === 'push') expect(git.log[i - 1]).toBe('pull --rebase')
    })
  })

  it('commits a new plan at once, since the plan page is a file Merge wrote, and then waits for the 15 minutes', async () => {
    const { llm } = fakeLlm()
    const git = fakeGit()
    const { runFor } = makeLoop(AWAKE, llm, git.run)
    await runFor(10)
    expect(git.log.filter((c) => c.startsWith('commit'))).toHaveLength(1)
    expect(git.log.join(' ')).toContain('morning plan')
  })

  it('treats what Merge makes as a produced file, and the stream, tick log and health as not', () => {
    expect(isProduct(['souvenirs/a.json'])).toBe(true)
    expect(isProduct(['trails/t.json'])).toBe(true)
    expect(isProduct(['notebook/writing/a.md'])).toBe(true)
    expect(isProduct(['works/w/index.html'])).toBe(true)
    expect(isProduct(['memory/stream/2026-11-12.jsonl', 'mind/ticks/2026-11-12.jsonl', 'mind/health.json', 'mind/state.json', 'forkling.json'])).toBe(false)
  })

  it('keeps running when pushes fail, and says so in health.json until one goes through', async () => {
    const { llm } = fakeLlm()
    let failing = true
    const git = fakeGit((args) => (args[0] === 'diff' ? 1 : args[0] === 'push' && failing ? 1 : 0))
    const { runFor, loop } = makeLoop(AWAKE, llm, git.run)
    await runFor(17)
    expect(loop.pushFailing).toBe(true)
    const health = () => Health.parse(JSON.parse(readFileSync(join(dir, 'mind/health.json'), 'utf8')))
    expect(health().warnings).toContain('push failing')

    failing = false
    await runFor(16)
    expect(loop.pushFailing).toBe(false)
    expect(health().warnings).not.toContain('push failing')
  })
})

describe('run', () => {
  it('goes on after a tick that throws, and reports it', async () => {
    writeFileSync(join(dir, 'forkling.json'), '{ not json')
    const { llm } = fakeLlm()
    const { loop, clock } = makeLoop(AWAKE, llm, null)
    const errors: string[] = []
    const stop = { aborted: false }
    let sleeps = 0
    await loop.run({
      signal: stop,
      onError: (e) => errors.push(e instanceof Error ? e.message : String(e)),
      sleep: async (ms) => {
        clock.ms += ms
        if (++sleeps === 3) stop.aborted = true
      },
    })
    expect(errors).toHaveLength(3)
  })

  it('never runs two ticks at once: a model call never overlaps another', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const slow: LlmClient = {
      ...noBatch,
      async complete<T>(req: LlmRequest<T>) {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise((r) => setTimeout(r, 5))
        inFlight--
        const parsed = req.kind === 'thought' ? { thought: 'Hm.', scores: [], surprise: 1, action: 'continue', reason: null } : plan
        return { parsed: parsed as T, stopReason: 'end_turn', usage: { input: 800, cacheRead: 0, cacheWrite: 0, output: 200 } }
      },
    }
    const { loop } = makeLoop(AWAKE, slow, null)
    await Promise.all([loop.tickOnce(), loop.tickOnce(), loop.tickOnce()])
    expect(maxInFlight).toBe(1)
  })
})
