import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BudgetLedger, Forkling, JobResult, MindState, TinkerJob } from '@forkling/schema'
import type { LlmClient, LlmRequest } from '../src/llm.ts'
import { loadSpecies } from '../src/species.ts'
import { runTick } from '../src/tick.ts'
import { noBatch } from './noBatch.ts'

const templates = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const cat = loadSpecies('cat')
const NOW = '2026-11-03T09:00:00Z' // 10:00 in Stockholm
const minutesAfter = (min: number) => new Date(Date.parse(NOW) + min * 60_000).toISOString()

const step = (verb: string, target: string | null, minutes: number, reason: string, over: Record<string, unknown> = {}) => ({ verb, target, reason, minutes, wantId: null, deep: null, size: null, ...over })
const morning = {
  thought: 'Time for something bigger.',
  longGoal: null,
  dropLongGoal: false,
  plan: [step('tinker', 'a clock made of a tide pool', 90, 'I keep coming back to the tide pools.', { size: 'full' }), step('write', 'home', 25, 'A plaque.'), step('rest', null, 30, 'Rest.')],
  planReason: 'A day for one big thing.',
  stayUpLate: null,
}
const keep = { thought: 'Carry on.', longGoal: null, dropLongGoal: false, plan: null, planReason: null, stayUpLate: null }

function fakeLlm(first: unknown = morning) {
  const calls: LlmRequest[] = []
  let planned = false
  const llm: LlmClient = {
    ...noBatch,
    async complete<T>(req: LlmRequest<T>) {
      calls.push(req)
      const parsed = planned ? keep : first
      planned = true
      return { parsed: parsed as T, stopReason: 'end_turn', usage: { input: 800, cacheRead: 0, cacheWrite: 0, output: 400 } }
    },
  }
  return { llm, calls }
}

let dir: string
const file = (rel: string) => join(dir, rel)
const stateOf = () => MindState.parse(JSON.parse(readFileSync(file('mind/state.json'), 'utf8')))
const ledgerOf = () => BudgetLedger.parse(JSON.parse(readFileSync(file('brain/budget.json'), 'utf8')))
const jobFiles = () => (existsSync(file('mind/builds')) ? readdirSync(file('mind/builds')).filter((f) => !f.endsWith('.result.json')) : [])
const deps = (llm: LlmClient | null, now: string) => ({ now: new Date(now), llm, pack: cat.pack, behaviors: cat.behaviors, speciesPersona: cat.persona })

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'job-'))
  copyFileSync(join(templates, 'forkling.json'), file('forkling.json'))
  mkdirSync(file('objects'))
  for (const f of readdirSync(join(templates, 'objects'))) copyFileSync(join(templates, 'objects', f), file(`objects/${f}`))
  // A full work costs 240 points, which is two days of saving: start with enough.
  mkdirSync(file('mind'), { recursive: true })
  writeFileSync(file('mind/state.json'), JSON.stringify({ allowance: { points: 450, day: '2026-11-03' } }))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

/** The morning plan starts the full tinker step; 91 minutes later it lands. */
async function landFull(first: unknown = morning) {
  const fake = fakeLlm(first)
  await runTick(dir, deps(fake.llm, NOW))
  const result = await runTick(dir, deps(fake.llm, minutesAfter(91)))
  return { fake, result }
}

describe('a full tinker step (spec 2.4, 10.2)', () => {
  it('asks the worker for the work: one job file in mind/builds with the idea and the reason, and no model call of its own', async () => {
    const { fake, result } = await landFull()
    const files = jobFiles()
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/^tinker-20261103-\d{4}\.json$/)
    const job = TinkerJob.parse(JSON.parse(readFileSync(file(`mind/builds/${files[0]}`), 'utf8')))
    expect(job).toMatchObject({ kind: 'tinker', idea: 'a clock made of a tide pool', reason: 'I keep coming back to the tide pools.', remixOf: null })
    expect(job.id).toBe(files[0]!.replace('.json', ''))
    expect(fake.calls.filter((c) => c.kind === 'tinker' || c.kind === 'sketch')).toHaveLength(0)
    expect(result.written).toContain(`mind/builds/${files[0]}`)
    expect(readFileSync(file('memory/stream/2026-11-03.jsonl'), 'utf8')).toMatch(/Asked the workshop to build/)
    expect(result.summary).toMatch(/asked for a work/)
  })

  it('does not ask for a second work while one is still being built, and says so', async () => {
    mkdirSync(file('mind/builds'), { recursive: true })
    writeFileSync(file('mind/builds/tinker-20261103-0800.json'), JSON.stringify({ id: 'tinker-20261103-0800', kind: 'tinker', requestedAt: '2026-11-03T08:00:00Z', idea: 'x', reason: 'y' }))
    const { result } = await landFull()
    expect(jobFiles()).toEqual(['tinker-20261103-0800.json'])
    expect(result.notes.join(' ')).toMatch(/already being built/)
  })

  it('may ask again once the earlier one has its result', async () => {
    mkdirSync(file('mind/builds'), { recursive: true })
    writeFileSync(file('mind/builds/tinker-20261103-0800.json'), JSON.stringify({ id: 'tinker-20261103-0800', kind: 'tinker', requestedAt: '2026-11-03T08:00:00Z', idea: 'x', reason: 'y' }))
    writeFileSync(file('mind/builds/tinker-20261103-0800.result.json'), JSON.stringify({ id: 'tinker-20261103-0800', kind: 'tinker', status: 'failed', reason: 'no', at: '2026-11-03T08:30:00Z' }))
    await landFull()
    expect(jobFiles()).toHaveLength(2)
  })
})

describe('a result that has come back (spec 2.3: buildResult; 11.3)', () => {
  const call = { at: '2026-11-03T10:00:00Z', kind: 'tinker', model: 'claude-sonnet-5-5', input: 20_000, cacheRead: 0, cacheWrite: 0, output: 12_000, usd: 0.16 }
  const result = (over: Record<string, unknown> = {}) =>
    JobResult.parse({ id: 'tinker-20261103-0800', kind: 'tinker', status: 'done', workId: 'tide-pool-clock', title: 'Tide pool clock', workStatus: 'shelf', prUrl: 'https://github.com/RomanKuroptev/merge/pull/3', at: '2026-11-03T10:20:00Z', calls: [call], ...over })
  const putResult = (r: JobResult) => {
    mkdirSync(file('mind/builds'), { recursive: true })
    writeFileSync(file(`mind/builds/${r.id}.result.json`), JSON.stringify(r))
  }
  /** A world that has planned the day, so the next tick is quiet except for the result. */
  async function plannedDay() {
    const fake = fakeLlm(morning)
    await runTick(dir, deps(fake.llm, NOW))
    return fake
  }

  it('books what the worker spent, once, in the ledger by kind', async () => {
    const fake = await plannedDay()
    const before = ledgerOf().spentUsd
    putResult(result())
    await runTick(dir, deps(fake.llm, minutesAfter(5)))
    const ledger = ledgerOf()
    expect(ledger.byKind.tinker).toMatchObject({ calls: 1, usd: 0.16 })
    // The tick also made the small decide call that answers the result; nothing else was added.
    expect(ledger.spentUsd - before).toBeGreaterThanOrEqual(0.16)
    expect(ledger.spentUsd - before).toBeLessThan(0.17)
    await runTick(dir, deps(fake.llm, minutesAfter(40)))
    expect(ledgerOf().byKind.tinker?.calls).toBe(1)
    expect(stateOf().jobs?.seen).toContain('tinker-20261103-0800')
  })

  it('wakes one decide call that is told what happened, and the result is answered once', async () => {
    const fake = await plannedDay()
    putResult(result())
    const before = fake.calls.length
    await runTick(dir, deps(fake.llm, minutesAfter(5)))
    const decide = fake.calls.slice(before).filter((c) => c.kind === 'decide')
    expect(decide).toHaveLength(1)
    expect(decide[0]!.user).toMatch(/buildResult/)
    expect(decide[0]!.user).toContain('Tide pool clock')
    expect(stateOf().jobs?.pending).toEqual([])
    const later = fake.calls.length
    await runTick(dir, deps(fake.llm, minutesAfter(40)))
    expect(fake.calls.slice(later).filter((c) => c.kind === 'decide' && /buildResult/.test(c.user))).toHaveLength(0)
  })

  it('lifts the mood for a work that passed, and lowers it for one that did not', async () => {
    const good = await plannedDay()
    const mood0 = Forkling.parse(JSON.parse(readFileSync(file('forkling.json'), 'utf8'))).mood
    putResult(result())
    await runTick(dir, deps(good.llm, minutesAfter(5)))
    const up = Forkling.parse(JSON.parse(readFileSync(file('forkling.json'), 'utf8'))).mood
    expect(up - mood0).toBeGreaterThan(0.1)

    putResult(result({ id: 'tinker-20261103-0900', workStatus: 'scrap', title: 'Blank', calls: [] }))
    await runTick(dir, deps(good.llm, minutesAfter(30)))
    const down = Forkling.parse(JSON.parse(readFileSync(file('forkling.json'), 'utf8'))).mood
    expect(down).toBeLessThan(up)
  })

  it('says what happened in plain words for a shelved work, a scrap and a failure', async () => {
    const fake = await plannedDay()
    putResult(result({ id: 'tinker-20261103-0801', workStatus: 'scrap', title: 'Blank page', scrapReason: 'x' }))
    putResult(result({ id: 'tinker-20261103-0802', status: 'failed', reason: 'the model refused', workId: undefined, title: undefined, workStatus: undefined, prUrl: undefined, calls: [] }))
    const before = fake.calls.length
    await runTick(dir, deps(fake.llm, minutesAfter(5)))
    const text = fake.calls.slice(before).find((c) => c.kind === 'decide')!.user
    expect(text).toMatch(/Blank page[^\n]*scrap bin/)
    expect(text).toMatch(/could not build[^\n]*the model refused/)
  })

  it('skips a result file it cannot read, and does not stop', async () => {
    const fake = await plannedDay()
    mkdirSync(file('mind/builds'), { recursive: true })
    writeFileSync(file('mind/builds/broken.result.json'), '{ nope')
    await expect(runTick(dir, deps(fake.llm, minutesAfter(5)))).resolves.toBeDefined()
  })
})
