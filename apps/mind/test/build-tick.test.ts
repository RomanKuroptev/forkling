import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { BuildRequest, MindState, type SpeciesPack } from '@forkling/schema'
import type { Decision } from '../src/decision.ts'
import type { LlmClient, LlmRequest } from '../src/llm.ts'
import { loadSpecies } from '../src/species.ts'
import { runTick, type TickDeps } from '../src/tick.ts'
import { noBatch } from './noBatch.ts'

const merge = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const world = fileURLToPath(new URL('../../../templates/forkling-world', import.meta.url))
const cat = loadSpecies('cat')
const pack: SpeciesPack = { ...cat.pack, needs: Object.fromEntries(Object.entries(cat.pack.needs).map(([id, n]) => [id, { ...n!, decayPerHour: 0 }])) }

const DAY = '2026-11-03'
const MORNING = '2026-11-03T09:00:00Z'
const at = (min: number) => new Date(Date.parse(MORNING) + min * 60_000)

const sit = { verb: 'sit', target: null, x: null, z: null, reason: 'I sit.', minutes: 20, materials: null, makes: null, because: null, topic: null }
const decision = (design: Decision['design']): Decision => ({
  thought: 'I need a shelf.',
  longGoal: { text: 'Keep my cups tidy.', reason: 'Clutter bothers me.' },
  dropLongGoal: false,
  plan: [sit],
  planReason: 'A tidy day.',
  stayUpLate: null,
  design,
})
const shelf = { name: 'A clay shelf', purpose: 'Somewhere to keep my cups.' }

function fake(d: Decision): LlmClient & { calls: LlmRequest[] } {
  const calls: LlmRequest[] = []
  return {
    ...noBatch,
    calls,
    async complete<T>(req: LlmRequest<T>) {
      calls.push(req)
      return { parsed: d as T | null, stopReason: 'end_turn', usage: { input: 800, cacheRead: 0, cacheWrite: 3000, output: 300 } }
    },
  }
}

let dir: string
const file = (rel: string) => join(dir, rel)
const readJson = (rel: string) => JSON.parse(readFileSync(file(rel), 'utf8'))
const state = () => MindState.parse(readJson('mind/state.json'))
const tick = (now: Date | string, llm: LlmClient | null, over: Partial<TickDeps> = {}) =>
  runTick(dir, { now: new Date(now), llm, pack, behaviors: cat.behaviors, speciesPersona: cat.persona, pools: cat.pools, ...over })

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'build-'))
  copyFileSync(join(merge, 'forkling.json'), file('forkling.json'))
  mkdirSync(file('objects'))
  for (const f of readdirSync(join(world, 'objects'))) copyFileSync(join(world, 'objects', f), file(`objects/${f}`))
  for (const f of readdirSync(join(merge, 'objects'))) copyFileSync(join(merge, 'objects', f), file(`objects/${f}`))
})

describe('asking for a build', () => {
  it('writes the request, opens the build, and tells the workflow which one', async () => {
    const result = await tick(MORNING, fake(decision(shelf)))
    expect(result.build).toBe('a-clay-shelf')
    const request = BuildRequest.parse(readJson('mind/builds/a-clay-shelf.json'))
    expect(request).toMatchObject({ kind: 'object', name: 'A clay shelf', purpose: 'Somewhere to keep my cups.' })
    expect(state().openBuild).toMatchObject({ id: 'a-clay-shelf', kind: 'object' })
    expect(state().builds).toEqual({ date: DAY, count: 1 })
    expect(result.written).toContain('mind/builds/a-clay-shelf.json')
    expect(readFileSync(file(`memory/stream/${DAY}.jsonl`), 'utf8')).toContain('A clay shelf')
  })

  it('asks for nothing when it did not ask', async () => {
    const result = await tick(MORNING, fake(decision(null)))
    expect(result.build).toBeNull()
    expect(existsSync(file('mind/builds'))).toBe(false)
  })

  it('does not ask twice in a day, nor while one is waiting, and says why', async () => {
    await tick(MORNING, fake(decision(shelf)))
    const again = await tick(at(60), fake(decision({ name: 'A tall lamp', purpose: 'Light.' })), {})
    expect(again.build).toBeNull()
    expect(existsSync(file('mind/builds/a-tall-lamp.json'))).toBe(false)
  })

  it('writes nothing in a dry run', async () => {
    const result = await tick(MORNING, fake(decision(shelf)), { dryRun: true })
    expect(result.build).toBeNull()
    expect(existsSync(file('mind/builds'))).toBe(false)
  })

  it('never uses the id of an object that exists', async () => {
    const result = await tick(MORNING, fake(decision({ name: 'Bed', purpose: 'Another bed.' })))
    expect(result.build).toBe('bed-2')
  })
})

describe('waiting for a build', () => {
  it('notices when the object has arrived, and closes the build', async () => {
    await tick(MORNING, fake(decision(shelf)))
    const bowl = readJson('objects/bowl.json')
    writeFileSync(file('objects/a-clay-shelf.json'), JSON.stringify({ ...bowl, id: 'a-clay-shelf', name: 'A clay shelf' }))
    await tick(at(30), fake(decision(null)))
    expect(state().openBuild).toBeNull()
    expect(readFileSync(file(`memory/stream/${DAY}.jsonl`), 'utf8')).toMatch(/arrived/)
  })

  it('is glad when what it asked for arrives', async () => {
    await tick(MORNING, fake(decision(shelf)))
    const before = readJson('forkling.json').feelings.valence
    const bowl = readJson('objects/bowl.json')
    writeFileSync(file('objects/a-clay-shelf.json'), JSON.stringify({ ...bowl, id: 'a-clay-shelf', name: 'A clay shelf' }))
    await tick(at(10), null)
    expect(readJson('forkling.json').feelings.valence).toBeGreaterThan(before + 0.15)
  })

  it('gives up on one that never comes', async () => {
    await tick(MORNING, fake(decision(shelf)))
    await tick(new Date(Date.parse(MORNING) + 80 * 3_600_000), fake(decision(null)))
    expect(state().openBuild).toBeNull()
  })
})

const designCall = { at: '2026-11-03T09:03:00.000Z', kind: 'design', model: 'claude-haiku-5-5', input: 1200, cacheRead: 0, cacheWrite: 2500, output: 400, usd: 0.0021 }
const putResult = (over: Record<string, unknown> = {}) =>
  writeFileSync(file('mind/builds/a-clay-shelf.result.json'), JSON.stringify({ id: 'a-clay-shelf', kind: 'object', status: 'designed', calls: [designCall], at: '2026-11-03T09:03:00.000Z', ...over }))
const stream = () => readFileSync(file(`memory/stream/${DAY}.jsonl`), 'utf8')

describe("what the builder reports back in its result file", () => {
  it('has its cost booked in the ledger by the mind, once, however many ticks follow', async () => {
    await tick(MORNING, fake(decision(shelf)))
    putResult()
    await tick(at(20), null)
    await tick(at(30), null)
    const calls = readJson('brain/budget.json').calls.filter((c: { kind: string }) => c.kind === 'design')
    expect(calls).toHaveLength(1)
    expect(calls[0].usd).toBe(0.0021)
    expect(readJson('brain/budget.json').spentUsd).toBeGreaterThanOrEqual(0.0021)
  })

  it('keeps waiting for an object whose pull request is on its way', async () => {
    await tick(MORNING, fake(decision(shelf)))
    putResult({ status: 'designed' })
    await tick(at(20), null)
    expect(state().openBuild).toMatchObject({ id: 'a-clay-shelf' })
  })

  it('closes a build that could not be made, says why, and gives back the slot for the day', async () => {
    await tick(MORNING, fake(decision(shelf)))
    expect(state().builds).toEqual({ date: DAY, count: 1 })
    putResult({ status: 'failed', reason: 'nothing in the design could be built' })
    await tick(at(20), null)
    expect(state().openBuild).toBeNull()
    expect(state().builds).toEqual({ date: DAY, count: 0 })
    expect(stream()).toMatch(/could not be built: nothing in the design could be built/)
  })

  it('closes a build whose pull request was closed without merging, and gives back the slot', async () => {
    await tick(MORNING, fake(decision(shelf)))
    putResult({ status: 'closed', reason: 'the pull request was closed without merging' })
    await tick(at(20), null)
    expect(state().openBuild).toBeNull()
    expect(state().builds?.count).toBe(0)
    expect(stream()).toMatch(/did not make it into the world/)
  })

  it('still counts a build that arrived as asked for, and keeps its slot', async () => {
    await tick(MORNING, fake(decision(shelf)))
    putResult({ status: 'merged' })
    const bowl = readJson('objects/bowl.json')
    writeFileSync(file('objects/a-clay-shelf.json'), JSON.stringify({ ...bowl, id: 'a-clay-shelf', name: 'A clay shelf' }))
    await tick(at(30), null)
    expect(state().openBuild).toBeNull()
    expect(state().builds?.count).toBe(1)
  })

  it('ignores a result file that does not fit, instead of failing the tick', async () => {
    await tick(MORNING, fake(decision(shelf)))
    writeFileSync(file('mind/builds/a-clay-shelf.result.json'), '{not json')
    await tick(at(20), null)
    expect(state().openBuild).toMatchObject({ id: 'a-clay-shelf' })
  })
})
