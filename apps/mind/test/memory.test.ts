import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
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
const pack: SpeciesPack = { ...cat.pack, needs: Object.fromEntries(Object.entries(cat.pack.needs).map(([id, n]) => [id, { ...n!, decayPerHour: 0 }])) }

const DAY = '2026-11-03'
const MORNING = '2026-11-03T09:00:00Z' // 10:00 in Stockholm

const step = (verb: string, target: string | null, because: string[] | null = null) => ({
  verb,
  target,
  x: null,
  z: null,
  reason: `I want to ${verb}.`,
  minutes: 30,
  materials: null,
  makes: null,
  because,
  topic: null,
})

const plan = (because: string[] | null = null): Decision => ({
  thought: 'The pond is calm, so I go there.',
  longGoal: { text: 'Learn the island.', reason: 'It is mine.' },
  dropLongGoal: false,
  plan: [step('watch', 'sunny-rock', because), step('sit', null)],
  planReason: 'A calm day.',
  stayUpLate: null,
})

const reflection = (over: Partial<Reflection> = {}): Reflection => ({
  journal: { title: 'A calm day', paragraphs: [{ text: 'I watched the sunny rock all morning.', refs: [`${DAY}#1`] }] },
  beliefOps: [{ op: 'new', beliefId: null, statement: 'The sunny rock is warm in the morning.', confidence: 0.6, evidence: [`${DAY}#1`], why: 'I felt it.' }],
  ...over,
})

interface Fake extends LlmClient {
  calls: LlmRequest[]
  batches: LlmRequest[]
}

function fake(answers: { decision?: Decision | null; reflections?: (Reflection | null)[]; batch?: BatchOutcome } = {}): Fake {
  const calls: LlmRequest[] = []
  const batches: LlmRequest[] = []
  const reflections = [...(answers.reflections ?? [reflection()])]
  const usage = { input: 800, cacheRead: 0, cacheWrite: 3000, output: 400 }
  return {
    calls,
    batches,
    async complete<T>(req: LlmRequest<T>) {
      calls.push(req)
      const parsed = req.kind === 'bedtime' ? (reflections.length > 1 ? reflections.shift()! : (reflections[0] ?? null)) : (answers.decision ?? null)
      return { parsed: parsed as T | null, stopReason: 'end_turn', usage }
    },
    async submitBatch(req) {
      batches.push(req)
      return 'batch_1'
    },
    async fetchBatch(): Promise<BatchOutcome> {
      return answers.batch ?? { status: 'pending' }
    },
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
  runTick(dir, { now: new Date(now), llm, pack, behaviors: cat.behaviors, speciesPersona: cat.persona, pools: cat.pools, ...over })

/** A day that has a stream to reflect on, and a plan already made, so nothing else wants the model. */
function seedDay() {
  writeJson('mind/state.json', MindState.parse({ lastPlanDate: DAY, knownObjects: readdirSync(file('objects')).map((f) => f.replace('.json', '')) }))
  mkdirSync(file('memory/stream'), { recursive: true })
  writeFileSync(
    file(`memory/stream/${DAY}.jsonl`),
    `${JSON.stringify({ id: `${DAY}#1`, at: '2026-11-03T09:00:00Z', kind: 'step', text: 'Started watching the sunny rock.', verb: 'watch', objectId: 'sunny-rock' })}\n`,
  )
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'memory-'))
  copyFileSync(join(templates, 'forkling.json'), file('forkling.json'))
  mkdirSync(file('objects'))
  for (const f of readdirSync(join(templates, 'objects'))) copyFileSync(join(templates, 'objects', f), file(`objects/${f}`))
})

describe('the memory stream', () => {
  it('records the thought and the step it started, and keeps the step on the timeline with its reason', async () => {
    const result = await tick(MORNING, fake({ decision: plan() }))
    expect(result.written).toContain(`memory/stream/${DAY}.jsonl`)
    const stream = lines(`memory/stream/${DAY}.jsonl`)
    expect(stream.map((e) => e.kind)).toEqual(expect.arrayContaining(['thought', 'step']))
    expect(stream.find((e) => e.kind === 'step')).toMatchObject({ id: expect.stringMatching(new RegExp(`^${DAY}#\\d+$`)), verb: 'watch', objectId: 'sunny-rock', goalRef: 'today:0' })
    expect(lines(`memory/timeline/${DAY}.jsonl`)[0]).toMatchObject({ verb: 'watch', targetId: 'sunny-rock', goalRef: 'today:0', reason: 'The pond is calm, so I go there.' })
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

describe('the bedtime reflection', () => {
  beforeEach(seedDay)

  it('is one Sonnet call in the half hour before bed, and writes the journal and a belief with its evidence', async () => {
    const llm = fake()
    const result = await tick(beforeBed(20), llm)
    expect(llm.calls).toHaveLength(1)
    expect(llm.calls[0]).toMatchObject({ kind: 'bedtime', model: 'claude-sonnet-5-5' })
    expect(llm.calls[0]!.user).toContain(`${DAY}#1`)

    expect(readFileSync(file(`journal/${DAY}.md`), 'utf8')).toContain('I watched the sunny rock all morning.')
    const beliefs = Beliefs.parse(readJson('memory/beliefs.json'))
    expect(beliefs).toHaveLength(1)
    expect(beliefs[0]).toMatchObject({ id: 'b1', statement: 'The sunny rock is warm in the morning.', evidence: [`${DAY}#1`], status: 'active' })
    expect(MindState.parse(readJson('mind/state.json')).lastReflectDate).toBe(DAY)
    expect(result.written).toEqual(expect.arrayContaining([`journal/${DAY}.md`, 'memory/beliefs.json']))
    expect(result.summary).toMatch(/journal/)
  })

  it('records the call in the ledger under its own kind', async () => {
    await tick(beforeBed(20), fake())
    const ledger = BudgetLedger.parse(readJson('brain/budget.json'))
    expect(ledger.calls.map((c) => c.kind)).toEqual(['bedtime'])
  })

  it('happens once a day', async () => {
    await tick(beforeBed(20), fake())
    const again = fake()
    await tick(beforeBed(10), again)
    expect(again.calls).toHaveLength(0)
  })

  it('waits until the half hour before bed', async () => {
    const llm = fake()
    await tick(beforeBed(90), llm)
    expect(llm.calls).toHaveLength(0)
  })

  it('throws out journal claims that point at nothing, and beliefs with no evidence', async () => {
    const llm = fake({
      reflections: [
        reflection({
          journal: {
            title: 'A day',
            paragraphs: [
              { text: 'I watched the sunny rock all morning.', refs: [`${DAY}#1`] },
              { text: 'A fox gave me a medal.', refs: [] },
            ],
          },
          beliefOps: [{ op: 'new', beliefId: null, statement: 'Foxes give medals.', confidence: 0.9, evidence: [`${DAY}#40`], why: 'x' }],
        }),
      ],
    })
    const result = await tick(beforeBed(20), llm)
    const journal = readFileSync(file(`journal/${DAY}.md`), 'utf8')
    expect(journal).toContain('sunny rock')
    expect(journal).not.toContain('medal')
    expect(existsSync(file('memory/beliefs.json'))).toBe(false)
    expect(result.notes.join('\n')).toMatch(/medal|cites nothing/)
  })

  it('asks once more when most of the journal was made up, and says why', async () => {
    const bogus = reflection({ journal: { title: 'x', paragraphs: [{ text: 'I flew to the moon.', refs: [] }, { text: 'I met a king.', refs: ['2026-11-03#77'] }] }, beliefOps: [] })
    const llm = fake({ reflections: [bogus, reflection()] })
    await tick(beforeBed(20), llm)
    expect(llm.calls).toHaveLength(2)
    expect(llm.calls[1]!.user).toContain('turned down')
    expect(llm.calls[1]!.user).toContain('I flew to the moon')
    expect(readFileSync(file(`journal/${DAY}.md`), 'utf8')).toContain('sunny rock')
  })

  it('lets a belief be weakened and dropped when the day contradicts it', async () => {
    writeJson('memory/beliefs.json', [
      { id: 'b1', statement: 'The pond is where good things happen.', confidence: 0.15, evidence: ['2026-11-02#3'], formedAt: '2026-11-02T20:00:00Z', status: 'active', history: [] },
    ])
    const llm = fake({ reflections: [reflection({ beliefOps: [{ op: 'weaken', beliefId: 'b1', statement: null, confidence: null, evidence: [], why: 'The pond was empty today.' }] })] })
    await tick(beforeBed(20), llm)
    expect(llm.calls[0]!.user).toContain('b1 (0.15): The pond is where good things happen.')
    const b = Beliefs.parse(readJson('memory/beliefs.json'))[0]!
    expect(b.status).toBe('dropped')
    expect(b.history[0]!.why).toBe('The pond was empty today.')
  })

  it('skips the model when the day left nothing to reflect on', async () => {
    mkdirSync(file('memory/stream'), { recursive: true })
    writeFileSync(file(`memory/stream/${DAY}.jsonl`), '')
    const llm = fake()
    const result = await tick(beforeBed(20), llm)
    expect(llm.calls).toHaveLength(0)
    expect(MindState.parse(readJson('mind/state.json')).lastReflectDate).toBe(DAY)
    expect(result.notes.join('\n')).toMatch(/nothing to reflect on/i)
  })

  it('does not spend past the monthly cap', async () => {
    writeJson('brain/budget.json', BudgetLedger.parse({ month: '2026-11', spentUsd: 9.999 }))
    const llm = fake()
    const result = await tick(beforeBed(20), llm)
    expect(llm.calls).toHaveLength(0)
    expect(result.notes.join('\n')).toMatch(/budget/)
  })

  it('shows the prompt in a dry run without calling or writing', async () => {
    const llm = fake()
    const result = await tick(beforeBed(20), llm, { dryRun: true })
    expect(llm.calls).toHaveLength(0)
    expect(result.prompt).toMatchObject({ kind: 'bedtime', model: 'claude-sonnet-5-5' })
    expect(existsSync(file(`journal/${DAY}.md`))).toBe(false)
  })
})

describe('the nightly memory rewrite', () => {
  const slots: MemorySlots = { slots: [{ title: 'Running jokes', text: 'The tall rock is my enemy.' }, { title: 'The sunny rock', text: 'Warm in the morning.' }] }
  const done: BatchOutcome = { status: 'done', parsed: slots, usage: { input: 2000, cacheRead: 0, cacheWrite: 0, output: 300 } }

  beforeEach(() => {
    seedDay()
    writeJson('mind/state.json', MindState.parse({ ...readJson('mind/state.json'), lastReflectDate: DAY }))
    writeFileSync(file('memory/summary.md'), 'Nothing has happened yet.\n')
    mkdirSync(file('journal'), { recursive: true })
    writeFileSync(file(`journal/${DAY}.md`), '# A calm day\n\n*2026-11-03*\n\nI watched the sunny rock.\n')
  })

  it('is sent once to the Batch API after the forkling is asleep, with the journal and the old memory', async () => {
    const llm = fake()
    await tick(afterBed(30), llm)
    expect(llm.calls).toHaveLength(0)
    expect(llm.batches).toHaveLength(1)
    expect(llm.batches[0]).toMatchObject({ kind: 'memory', model: 'claude-haiku-5-5' })
    expect(llm.batches[0]!.user).toContain('I watched the sunny rock.')
    expect(llm.batches[0]!.user).toContain('Nothing has happened yet.')
    expect(MindState.parse(readJson('mind/state.json')).memoryBatch).toEqual({ id: 'batch_1', date: DAY })
  })

  it('waits while the batch is still running, without sending it again', async () => {
    await tick(afterBed(30), fake())
    const llm = fake({ batch: { status: 'pending' } })
    await tick(afterBed(90), llm)
    expect(llm.batches).toHaveLength(0)
    expect(MindState.parse(readJson('mind/state.json')).memoryBatch?.id).toBe('batch_1')
  })

  it('writes the twelve-slot memory when the batch is done, at half price, and does not send another tonight', async () => {
    await tick(afterBed(30), fake())
    const llm = fake({ batch: done })
    const result = await tick(afterBed(120), llm)
    expect(readFileSync(file('memory/summary.md'), 'utf8')).toBe('## Running jokes\nThe tall rock is my enemy.\n\n## The sunny rock\nWarm in the morning.\n')
    expect(MindState.parse(readJson('mind/state.json')).memoryBatch).toBeNull()
    expect(result.written).toContain('memory/summary.md')
    const call = BudgetLedger.parse(readJson('brain/budget.json')).calls.find((c) => c.kind === 'memory')!
    expect(call.usd).toBeCloseTo((2000 * 0.1 + 300 * 0.5) / 1e6 / 2, 10)

    const later = fake()
    await tick(afterBed(180), later)
    expect(later.batches).toHaveLength(0)
  })

  it('keeps the old memory when the batch fails or answers badly', async () => {
    await tick(afterBed(30), fake())
    const result = await tick(afterBed(120), fake({ batch: { status: 'failed', reason: 'expired' } }))
    expect(readFileSync(file('memory/summary.md'), 'utf8')).toBe('Nothing has happened yet.\n')
    expect(MindState.parse(readJson('mind/state.json')).memoryBatch).toBeNull()
    expect(result.notes.join('\n')).toMatch(/expired/)
  })

  it('is not sent when it was never reflected on tonight', async () => {
    writeJson('mind/state.json', MindState.parse({ ...readJson('mind/state.json'), lastReflectDate: '2026-11-02' }))
    const llm = fake()
    await tick(afterBed(30), llm)
    expect(llm.batches).toHaveLength(0)
  })

  it('is not sent without credentials', async () => {
    const result = await tick(afterBed(30), null)
    expect(MindState.parse(readJson('mind/state.json')).memoryBatch).toBeNull()
    expect(result.notes.join('\n')).toMatch(/no credentials/)
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

  it('records which beliefs a step follows from, dropping ids it does not hold', async () => {
    await tick(MORNING, fake({ decision: plan(['b1', 'b2', 'b9']) }))
    const goals = Goals.parse(readJson('mind/goals.json'))
    expect(goals.today!.steps[0]!.because).toEqual(['b1'])
    expect(goals.today!.steps[1]!.because).toBeUndefined()
    expect(lines(`memory/timeline/${DAY}.jsonl`)[0].beliefRefs).toEqual(['b1'])
    expect(lines(`memory/stream/${DAY}.jsonl`).find((e) => e.kind === 'step').beliefRefs).toEqual(['b1'])
  })
})
