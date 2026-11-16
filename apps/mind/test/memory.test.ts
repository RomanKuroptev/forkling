import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { Beliefs, BudgetLedger, Forkling, Goals, MindState, type MemorySlots, type Reflection, type SpeciesPack } from '@forkling/schema'
import { sleepWindow } from '@forkling/sim'
import type { Decision } from '../src/decision.ts'
import type { BatchOutcome, LlmClient, LlmRequest } from '../src/llm.ts'
import { loadSpecies } from '../src/species.ts'
import { runTick, type TickDeps } from '../src/tick.ts'

const templates = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const cat = loadSpecies('cat')
const pack: SpeciesPack = cat.pack

const DAY = '2026-11-03'
const MORNING = '2026-11-03T09:00:00Z' // 10:00 in Stockholm

const step = (verb: string, target: string | null) => ({ verb, target, reason: `I want to ${verb}.`, minutes: 30, wantId: null, deep: null, size: null })

const plan = (): Decision => ({
  thought: 'The pond is calm, so I go there.',
  longGoal: { text: 'Learn the island.', reason: 'It is mine.' },
  dropLongGoal: false,
  plan: [step('wander', 'lighthouses'), step('write', 'home'), step('rest', null)],
  planReason: 'A calm day.',
  stayUpLate: null,
})

interface Fake extends LlmClient {
  calls: LlmRequest[]
}

function fake(answers: { decision?: Decision | null } = {}): Fake {
  const calls: LlmRequest[] = []
  const usage = { input: 800, cacheRead: 0, cacheWrite: 3000, output: 400 }
  return {
    calls,
    async complete<T>(req: LlmRequest<T>) {
      calls.push(req)
      return { parsed: (answers.decision ?? null) as T | null, stopReason: 'end_turn', usage }
    },
    async submitBatch() {
      throw new Error('this test does not expect a batch')
    },
    async fetchBatch(): Promise<BatchOutcome> {
      return { status: 'pending' }
    },
    async cancelBatch() {},
  }
}

let dir: string
const file = (rel: string) => join(dir, rel)
const readJson = (rel: string) => JSON.parse(readFileSync(file(rel), 'utf8'))
const writeJson = (rel: string, value: unknown) => {
  mkdirSync(join(dir, rel, '..'), { recursive: true })
  writeFileSync(file(rel), JSON.stringify(value, null, 2))
}
const lines = (rel: string) => readFileSync(file(rel), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const patchForkling = (patch: Record<string, unknown>) => writeJson('forkling.json', { ...readJson('forkling.json'), ...patch })

const bedMs = () => {
  const f = Forkling.parse(readJson('forkling.json'))
  return sleepWindow(DAY, f.seed, f.timezone).bedMs
}
const beforeBed = (min: number) => new Date(bedMs() - min * 60_000)
const afterBed = (min: number) => new Date(bedMs() + min * 60_000)

const tick = (now: Date | string, llm: LlmClient | null, over: Partial<TickDeps> = {}) =>
  runTick(dir, { now: new Date(now), llm, pack, behaviors: cat.behaviors, speciesPersona: cat.persona, ...over })

/** A day that has a stream to reflect on, and a plan already made, so nothing else wants the model. */
function seedDay() {
  writeJson('mind/state.json', MindState.parse({ lastPlanDate: DAY }))
  mkdirSync(file('memory/stream'), { recursive: true })
  writeFileSync(
    file(`memory/stream/${DAY}.jsonl`),
    `${JSON.stringify({ id: `${DAY}#1`, at: '2026-11-03T09:00:00Z', kind: 'step', text: 'Started watching the sunny rock.', verb: 'watch', objectId: 'sunny-rock' })}\n`,
  )
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'memory-'))
  copyFileSync(join(templates, 'forkling.json'), file('forkling.json'))
})

describe('the memory stream', () => {
  it('records the thought and the step it started, and keeps the step on the timeline with its reason', async () => {
    const result = await tick(MORNING, fake({ decision: plan() }))
    expect(result.written).toContain(`memory/stream/${DAY}.jsonl`)
    const stream = lines(`memory/stream/${DAY}.jsonl`)
    expect(stream.map((e) => e.kind)).toEqual(expect.arrayContaining(['thought', 'step']))
    expect(stream.find((e) => e.kind === 'step')).toMatchObject({ id: expect.stringMatching(new RegExp(`^${DAY}#\\d+$`)), verb: 'wander', goalRef: 'today:0' })
    expect(lines(`memory/timeline/${DAY}.jsonl`)[0]).toMatchObject({ verb: 'wander', targetId: 'lighthouses', goalRef: 'today:0', reason: 'The pond is calm, so I go there.' })
  })

  it('costs no model call: a quiet tick that only follows its plan still remembers the step it moves to', async () => {
    const llm = fake({ decision: plan() })
    await tick(MORNING, llm)
    const quiet = fake()
    await tick(new Date(Date.parse(MORNING) + 35 * 60_000), quiet)
    expect(quiet.calls).toHaveLength(0)
    expect(lines(`memory/stream/${DAY}.jsonl`).filter((e) => e.kind === 'step').length).toBeGreaterThanOrEqual(2)
  })

  it('notes waking up, and deletes streams older than a week', async () => {
    patchForkling({ asleep: true })
    mkdirSync(file('memory/stream'), { recursive: true })
    writeFileSync(file('memory/stream/2026-10-20.jsonl'), '{}\n')
    writeFileSync(file('memory/stream/2026-10-30.jsonl'), '{}\n')
    const result = await tick(MORNING, fake({ decision: plan() }))
    expect(lines(`memory/stream/${DAY}.jsonl`)[0]).toMatchObject({ kind: 'wake' })
    expect(existsSync(file('memory/stream/2026-10-20.jsonl'))).toBe(false)
    expect(existsSync(file('memory/stream/2026-10-30.jsonl'))).toBe(true)
    expect(result.written).toContain('memory/stream/2026-10-20.jsonl')
  })

  it('does not write memory in a dry run', async () => {
    await tick(MORNING, fake({ decision: plan() }), { dryRun: true })
    expect(existsSync(file('memory'))).toBe(false)
  })
})

describe('memory changes behaviour', () => {
  beforeEach(() => {
    writeJson('memory/beliefs.json', [
      { id: 'b1', statement: 'The sunny rock is warm in the morning.', confidence: 0.7, evidence: ['2026-11-02#3'], formedAt: '2026-11-02T20:00:00Z', status: 'active', history: [] },
      { id: 'b2', statement: 'Fish are friends.', confidence: 0.4, evidence: ['2026-11-02#4'], formedAt: '2026-11-02T20:00:00Z', status: 'dropped', history: [] },
    ])
    writeFileSync(file('memory/summary.md'), '## Running jokes\nThe tall rock is my enemy.\n')
  })

  it('shows what it believes and remembers when it decides', async () => {
    const llm = fake({ decision: plan() })
    await tick(MORNING, llm)
    const user = llm.calls[0]!.user
    expect(user).toContain('b1 (0.7): The sunny rock is warm in the morning.')
    expect(user).not.toContain('Fish are friends')
    expect(user).toContain('The tall rock is my enemy.')
  })
})
