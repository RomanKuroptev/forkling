import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BudgetLedger, Forkling, MindState, Wants, type SleepRewriteAnswer } from '@forkling/schema'
import { sleepWindow } from '@forkling/sim'
import type { BatchOutcome, LlmClient, LlmRequest } from '../src/llm.ts'
import { loadSpecies } from '../src/species.ts'
import { appendStream } from '../src/stream.ts'
import { runTick } from '../src/tick.ts'

const templates = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const cat = loadSpecies('cat')
const DAY = '2026-11-03'
const usage = { input: 20_000, cacheRead: 0, cacheWrite: 0, output: 3_000 }

let dir: string
const file = (rel: string) => join(dir, rel)
const json = (rel: string) => JSON.parse(readFileSync(file(rel), 'utf8'))
const window = () => {
  const f = Forkling.parse(json('forkling.json'))
  return sleepWindow(DAY, f.seed, f.timezone)
}
const nextWake = () => {
  const f = Forkling.parse(json('forkling.json'))
  return sleepWindow('2026-11-04', f.seed, f.timezone).wakeMs
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sleep-tick-'))
  copyFileSync(join(templates, 'forkling.json'), file('forkling.json'))
  mkdirSync(file('objects'))
  for (const f of readdirSync(join(templates, 'objects'))) copyFileSync(join(templates, 'objects', f), file(`objects/${f}`))
  appendStream(dir, DAY, [{ at: '2026-11-03T09:00:00Z', kind: 'made', text: 'Kept a souvenir about fog.' }])
  mkdirSync(file('mind'), { recursive: true })
  // A plan is made for the day, so nothing else wants the model tonight.
  writeFileSync(file('mind/state.json'), JSON.stringify(MindState.parse({ lastPlanDate: DAY, knownObjects: readdirSync(file('objects')).map((f) => f.replace('.json', '')) })))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const answer: SleepRewriteAnswer = {
  diary: { title: 'A foggy day', paragraphs: [{ text: 'I kept a souvenir about fog.', refs: [`${DAY}#1`] }] },
  slots: [{ title: 'Running jokes', text: 'The fog is my landlord.' }],
  beliefOps: [],
  wants: [{ id: null, kind: 'question', text: 'Why does the fog come back?', why: 'It keeps showing up.' }],
}

function client(outcome: () => BatchOutcome) {
  const log = { submitted: [] as LlmRequest[], completed: 0, cancelled: 0 }
  const llm: LlmClient = {
    async complete<T>() {
      log.completed++
      return { parsed: null as T | null, stopReason: 'refusal', usage }
    },
    async submitBatch(req) {
      log.submitted.push(req)
      return 'batch-1'
    },
    async fetchBatch() {
      return outcome()
    },
    async cancelBatch() {
      log.cancelled++
    },
  }
  return { llm, log }
}
const deps = (llm: LlmClient, now: Date | number) => ({ now: new Date(now), llm, pack: cat.pack, behaviors: cat.behaviors, speciesPersona: cat.persona })

describe('the sleep rewrite through a tick (spec 9.4)', () => {
  it('is sent when Merge goes to bed, and its result writes the diary, the memory and the wants', async () => {
    let outcome: BatchOutcome = { status: 'pending' }
    const { llm, log } = client(() => outcome)
    const night = window().bedMs + 10 * 60_000
    await runTick(dir, deps(llm, night))
    expect(log.submitted).toHaveLength(1)
    expect(log.submitted[0]).toMatchObject({ kind: 'sleep', model: 'claude-sonnet-5-5' })
    expect(MindState.parse(json('mind/state.json')).sleepRewrite).toMatchObject({ id: 'batch-1', date: DAY })

    outcome = { status: 'done', parsed: answer, usage }
    await runTick(dir, deps(llm, night + 6 * 60_000))
    expect(readFileSync(file(`journal/${DAY}.md`), 'utf8')).toContain('I kept a souvenir about fog.')
    expect(readFileSync(file('memory/summary.md'), 'utf8')).toContain('## Running jokes')
    expect(Wants.parse(json('mind/wants.json')).wants.map((w) => w.text)).toEqual(['Why does the fog come back?'])
    const state = MindState.parse(json('mind/state.json'))
    expect(state.sleepRewrite).toBeNull()
    expect(state.lastRewriteDate).toBe(DAY)
    expect(BudgetLedger.parse(json('brain/budget.json')).byKind.sleep?.calls).toBe(1)
    expect(log.completed).toBe(0)
  })

  it('is sent once, not on every tick of the night', async () => {
    const { llm, log } = client(() => ({ status: 'pending' }))
    const night = window().bedMs + 10 * 60_000
    for (let i = 0; i < 4; i++) await runTick(dir, deps(llm, night + i * 60_000))
    expect(log.submitted).toHaveLength(1)
  })

  it('an hour after waking, a batch that is not back is cancelled and the request runs as a normal call', async () => {
    const { llm, log } = client(() => ({ status: 'pending' }))
    const night = window().bedMs + 10 * 60_000
    await runTick(dir, deps(llm, night))
    await runTick(dir, deps(llm, nextWake() + 30 * 60_000))
    expect(log.cancelled).toBe(0)
    await runTick(dir, deps(llm, nextWake() + 61 * 60_000))
    expect(log.cancelled).toBe(1)
    expect(log.completed).toBeGreaterThanOrEqual(1)
  })

  it('makes no model call at all while asleep except the batch', async () => {
    const { llm, log } = client(() => ({ status: 'pending' }))
    const night = window().bedMs + 10 * 60_000
    for (let i = 0; i < 3; i++) await runTick(dir, deps(llm, night + i * 10 * 60_000))
    expect(log.completed).toBe(0)
    expect(existsSync(file(`journal/${DAY}.md`))).toBe(false)
  })
})
