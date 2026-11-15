import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BudgetLedger, Goals, JobResult, MindState, Wants, type ThoughtAnswer, type Want } from '@forkling/schema'
import type { LlmClient, LlmRequest, LlmResult } from '../src/llm.ts'
import { loadSpecies } from '../src/species.ts'
import { appendStream } from '../src/stream.ts'
import { makeAsk } from '../src/tick/ask.ts'
import type { Tick } from '../src/tick/context.ts'
import { reflectState, rememberScored } from '../src/tick/importance.ts'
import { leaveMindStep } from '../src/tick/mind-step.ts'
import { thoughtTick } from '../src/tick/thought.ts'
import { failWant } from '../src/tick/wants.ts'
import { runTick } from '../src/tick.ts'
import { noBatch } from './noBatch.ts'

const T = '2026-11-12T11:00:00Z'
const TODAY = '2026-11-12'
const want = (id: string, over: Partial<Want> = {}): Want => ({ id, kind: 'question', text: `want ${id}`, why: 'because', since: T, attempts: 0, lastTouched: T, ...over })

/** A tick with only what the pieces under test touch. */
function fakeTick(over: Record<string, unknown> = {}) {
  return {
    dir,
    today: TODAY,
    nowIso: T,
    nowMs: Date.parse(T),
    notes: [] as string[],
    parts: [] as string[],
    justNow: [] as string[],
    remember: [] as Tick['remember'],
    attempts: [] as Tick['attempts'],
    calls: [] as Tick['calls'],
    budget: BudgetLedger.parse({ month: '2026-11' }),
    mind: MindState.parse({}),
    wants: [] as Want[],
    visitorNotes: [] as Tick['visitorNotes'],
    deps: { llm: null },
    system: 'the seed',
    goals: Goals.parse({}),
    ...over,
  } as unknown as Tick
}

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wants-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('rememberScored (spec 9.3: code sets some importance)', () => {
  it('writes the entry with its fixed importance and adds it to the sum since the last reflection', () => {
    const t = fakeTick()
    rememberScored(t, { at: T, kind: 'event', text: 'A build failed.' }, 'buildFailed')
    rememberScored(t, { at: T, kind: 'made', text: 'Kept a souvenir.' }, 'souvenirKept')
    expect(t.remember.map((e) => e.importance)).toEqual([6, 3])
    expect(reflectState(t.mind).sum).toBe(9)
  })
  it('starts from nothing', () => {
    expect(reflectState(MindState.parse({}))).toEqual({ sum: 0, lastAt: null, date: '', today: 0, pending: null, questions: [] })
  })
})

describe('the thought tick and importance (spec 2.2, 9.3)', () => {
  const usage = { input: 100, cacheRead: 0, cacheWrite: 0, output: 50 }
  const answer = (over: Partial<ThoughtAnswer> = {}): ThoughtAnswer => ({ thought: 'The tide pools again.', scores: [], surprise: 1, action: 'continue', reason: null, ...over })
  function run(reply: Partial<ThoughtAnswer>, over: Record<string, unknown> = {}) {
    const seen: LlmRequest[] = []
    const llm = {
      async complete(request: LlmRequest) {
        seen.push(request)
        return { parsed: answer(reply), usage, stopReason: 'end_turn' } as LlmResult<unknown>
      },
    } as unknown as LlmClient
    const t = fakeTick({
      deps: { llm },
      goals: Goals.parse({ today: { date: TODAY, steps: [{ verb: 'wander', targetId: 'tide pools', reason: 'Again.', minutes: 30 }], reason: 'A day.' }, now: { index: 0, startedAt: '2026-11-12T10:45:00Z', until: '2026-11-12T11:15:00Z' } }),
      ...over,
    })
    t.ask = makeAsk(t)
    return { t, seen }
  }

  it('adds the importance the model gave to events it was shown', async () => {
    appendStream(dir, TODAY, [
      { at: '2026-11-12T10:56:00Z', kind: 'event', text: 'One.' },
      { at: '2026-11-12T10:57:00Z', kind: 'event', text: 'Two.' },
    ])
    const { t } = run({ scores: [{ id: '2026-11-12#1', importance: 8 }, { id: '2026-11-12#2', importance: 2 }] })
    await thoughtTick(t)
    expect(reflectState(t.mind).sum).toBe(10)
  })

  it('does not score what code already scored, and ignores ids it was not shown', async () => {
    appendStream(dir, TODAY, [
      { at: '2026-11-12T10:56:00Z', kind: 'event', text: 'A build failed.', importance: 6 },
      { at: '2026-11-12T10:57:00Z', kind: 'event', text: 'Two.' },
    ])
    const { t } = run({ scores: [{ id: '2026-11-12#1', importance: 10 }, { id: '2026-11-12#2', importance: 3 }, { id: '2026-11-12#99', importance: 10 }] })
    await thoughtTick(t)
    expect(reflectState(t.mind).sum).toBe(3)
    expect((t.remember[0] as { scored?: unknown }).scored).toEqual([{ id: '2026-11-12#2', importance: 3 }])
  })

  it('adds a step\'s surprise again from 7, and nothing below', async () => {
    const high = run({ surprise: 8 })
    await thoughtTick(high.t)
    expect(reflectState(high.t.mind).sum).toBe(8)
    const low = run({ surprise: 6 })
    await thoughtTick(low.t)
    expect(reflectState(low.t.mind).sum).toBe(0)
  })

  it('adds nothing when the call failed', async () => {
    const t = fakeTick()
    t.ask = makeAsk(t)
    await thoughtTick(t)
    expect(reflectState(t.mind).sum).toBe(0)
  })

  it('shows the first 5 wants and no more, and the top 5 are the head of the list', async () => {
    const wants = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6'].map((id) => want(id))
    const { t, seen } = run({}, { wants })
    await thoughtTick(t)
    for (const id of ['w1', 'w2', 'w3', 'w4', 'w5']) expect(seen[0]!.user).toContain(`want ${id}`)
    expect(seen[0]!.user).not.toContain('want w6')
    expect(seen[0]!.user).not.toMatch(/none yet/i)
  })

  it('says none yet when the list is empty', async () => {
    const { t, seen } = run({})
    await thoughtTick(t)
    expect(seen[0]!.user).toMatch(/none yet/i)
  })
})

describe('failed attempts and the 4-failure drop (spec 9.4)', () => {
  it('a step left before its time counts against the want it served', () => {
    const t = fakeTick({ wants: [want('w1'), want('w2')] })
    leaveMindStep(t, { verb: 'wander', reason: 'x', minutes: 30, wantId: 'w1' } as never)
    expect(t.wants.map((w) => w.attempts)).toEqual([1, 0])
  })
  it('a step with no want counts against none', () => {
    const t = fakeTick({ wants: [want('w1')] })
    leaveMindStep(t, { verb: 'wander', reason: 'x', minutes: 30 } as never)
    expect(t.wants[0]!.attempts).toBe(0)
  })
  it('the fourth failed attempt drops the want, with a line in the stream and the plan told', () => {
    const t = fakeTick({ wants: [want('w1', { attempts: 3, text: 'Why fog?' }), want('w2')] })
    failWant(t, 'w1')
    expect(t.wants.map((w) => w.id)).toEqual(['w2'])
    expect(t.remember).toHaveLength(1)
    expect(t.remember[0]).toMatchObject({ kind: 'event' })
    expect(t.remember[0]!.text).toMatch(/Why fog\?/)
    expect(t.remember[0]!.text).toMatch(/4/)
  })
  it('the third failed attempt keeps it', () => {
    const t = fakeTick({ wants: [want('w1', { attempts: 2 })] })
    failWant(t, 'w1')
    expect(t.wants[0]!.attempts).toBe(3)
    expect(t.remember).toHaveLength(0)
  })
})

// ---- through runTick: the wants file, the plan check and failed builds ----

const templates = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const cat = loadSpecies('cat')
const NOW = '2026-11-03T09:00:00Z'
const file = (rel: string) => join(dir, rel)
const readJson = (rel: string) => JSON.parse(readFileSync(file(rel), 'utf8'))
const deps = (llm: LlmClient | null, now = NOW) => ({ now: new Date(now), llm, pack: cat.pack, behaviors: cat.behaviors, speciesPersona: cat.persona })
const step = (verb: string, target: string | null, minutes: number, reason: string, over: Record<string, unknown> = {}) => ({ verb, target, reason, minutes, wantId: null, deep: null, size: null, ...over })
const planWith = (wantId: string | null) => ({
  thought: 'A day.',
  longGoal: null,
  dropLongGoal: false,
  plan: [step('write', 'home', 25, 'A plaque.', { wantId }), step('write', 'home', 25, 'Another.', { wantId }), step('rest', null, 30, 'Rest.', { wantId })],
  planReason: 'A quiet day.',
  stayUpLate: null,
})
function fakeLlm(plan: unknown) {
  const llm: LlmClient = {
    ...noBatch,
    async complete<T>() {
      return { parsed: plan as T, stopReason: 'end_turn', usage: { input: 800, cacheRead: 0, cacheWrite: 0, output: 400 } }
    },
  }
  return llm
}
const threeWants = () => Wants.parse({ wants: [want('w1'), want('w2'), want('w3')] })

describe('mind/wants.json in a tick', () => {
  beforeEach(() => {
    copyFileSync(join(templates, 'forkling.json'), file('forkling.json'))
    mkdirSync(file('objects'))
    for (const f of readdirSync(join(templates, 'objects'))) copyFileSync(join(templates, 'objects', f), file(`objects/${f}`))
    mkdirSync(file('mind'), { recursive: true })
  })

  it('is not written when there is none and nothing changed it', async () => {
    await runTick(dir, deps(fakeLlm(planWith(null))))
    expect(() => readFileSync(file('mind/wants.json'))).toThrow()
  })

  it('once 3 wants exist, a plan step that names none is rejected (spec 2.6)', async () => {
    writeFileSync(file('mind/wants.json'), JSON.stringify(threeWants()))
    const result = await runTick(dir, deps(fakeLlm(planWith(null))))
    expect(result.notes.join(' ')).toMatch(/rejected/i)
  })

  it('a step that names one of the wants is accepted', async () => {
    writeFileSync(file('mind/wants.json'), JSON.stringify(threeWants()))
    const result = await runTick(dir, deps(fakeLlm(planWith('w2'))))
    expect(result.notes.join(' ')).not.toMatch(/rejected/i)
    expect(Goals.parse(readJson('mind/goals.json')).today?.steps[0]?.wantId).toBe('w2')
  })

  it('a step that names a want that does not exist is rejected', async () => {
    writeFileSync(file('mind/wants.json'), JSON.stringify(threeWants()))
    const result = await runTick(dir, deps(fakeLlm(planWith('w9'))))
    expect(result.notes.join(' ')).toMatch(/rejected/i)
  })

  it('with fewer than 3 wants a step needs none (the cold start)', async () => {
    writeFileSync(file('mind/wants.json'), JSON.stringify(Wants.parse({ wants: [want('w1')] })))
    const result = await runTick(dir, deps(fakeLlm(planWith(null))))
    expect(result.notes.join(' ')).not.toMatch(/rejected/i)
  })
})

describe('build results and importance (spec 9.3)', () => {
  const call = { at: '2026-11-03T10:00:00Z', kind: 'tinker', model: 'claude-sonnet-5-5', input: 20_000, cacheRead: 0, cacheWrite: 0, output: 12_000, usd: 0.16 }
  const put = (r: Record<string, unknown>) => {
    mkdirSync(file('mind/builds'), { recursive: true })
    writeFileSync(file(`mind/builds/${r.id}.result.json`), JSON.stringify(JobResult.parse(r)))
  }
  beforeEach(() => {
    copyFileSync(join(templates, 'forkling.json'), file('forkling.json'))
    mkdirSync(file('objects'))
    for (const f of readdirSync(join(templates, 'objects'))) copyFileSync(join(templates, 'objects', f), file(`objects/${f}`))
    mkdirSync(file('mind'), { recursive: true })
    writeFileSync(file('mind/wants.json'), JSON.stringify(Wants.parse({ wants: [want('w1', { attempts: 3 })] })))
    writeFileSync(file('mind/state.json'), JSON.stringify({ jobWants: { 'tinker-20261103-0800': 'w1' } }))
  })

  it('a build that landed adds 5 and a build that failed adds 6, each on its stream line', async () => {
    put({ id: 'tinker-20261103-0801', kind: 'tinker', status: 'done', workId: 'clock', title: 'Clock', workStatus: 'shelf', at: '2026-11-03T08:30:00Z', calls: [call] })
    await runTick(dir, deps(fakeLlm(planWith(null))))
    expect(MindState.parse(readJson('mind/state.json')).reflect?.sum).toBeGreaterThanOrEqual(5)
    expect(readFileSync(file('memory/stream/2026-11-03.jsonl'), 'utf8')).toMatch(/"importance":5/)
  })

  it('a failed build counts against the want of the step that asked for it, and the fourth drops it', async () => {
    put({ id: 'tinker-20261103-0800', kind: 'tinker', status: 'failed', reason: 'it broke', at: '2026-11-03T08:30:00Z', calls: [call] })
    await runTick(dir, deps(fakeLlm(planWith(null))))
    expect(readFileSync(file('memory/stream/2026-11-03.jsonl'), 'utf8')).toMatch(/"importance":6/)
    expect(Wants.parse(readJson('mind/wants.json')).wants).toEqual([])
    expect(readFileSync(file('memory/stream/2026-11-03.jsonl'), 'utf8')).toMatch(/gave up/i)
    expect(MindState.parse(readJson('mind/state.json')).jobWants ?? {}).toEqual({})
  })

  it('a build that landed does not count against its want', async () => {
    writeFileSync(file('mind/state.json'), JSON.stringify({ jobWants: { 'tinker-20261103-0800': 'w1' } }))
    put({ id: 'tinker-20261103-0800', kind: 'tinker', status: 'done', workId: 'clock', title: 'Clock', workStatus: 'shelf', at: '2026-11-03T08:30:00Z', calls: [call] })
    await runTick(dir, deps(fakeLlm(planWith(null))))
    expect(Wants.parse(readJson('mind/wants.json')).wants[0]?.attempts).toBe(3)
  })
})
