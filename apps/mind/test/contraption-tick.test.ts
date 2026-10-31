import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { Artifact, WorldObject, type SpeciesPack } from '@forkling/schema'
import type { Decision } from '../src/decision.ts'
import type { LlmClient, LlmRequest } from '../src/llm.ts'
import { loadSpecies } from '../src/species.ts'
import { runTick } from '../src/tick.ts'
import { noBatch } from './noBatch.ts'

const merge = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const world = fileURLToPath(new URL('../../../templates/forkling-world', import.meta.url))
const cat = loadSpecies('cat')
const pack: SpeciesPack = { ...cat.pack, needs: Object.fromEntries(Object.entries(cat.pack.needs).map(([id, n]) => [id, { ...n!, decayPerHour: 0 }])) }

const MORNING = '2026-11-03T09:00:00Z'
const at = (min: number) => new Date(Date.parse(MORNING) + min * 60_000)

const step = (verb: string, target: string | null) => ({ verb, target, x: null, z: null, reason: `I want to ${verb}.`, minutes: 20, materials: null, makes: null, because: null, topic: null })
const plan = (steps: ReturnType<typeof step>[]): Decision => ({
  thought: 'Time to play.',
  longGoal: { text: 'Build things that move.', reason: 'I like motion.' },
  dropLongGoal: false,
  plan: steps,
  planReason: 'A tinkering day.',
  stayUpLate: null,
})

function fake(decision: Decision, answer: unknown = { title: 'Run one', notes: 'The marble rolled along the plank.', opinion: 'I will do it again.' }) {
  const calls: LlmRequest[] = []
  const llm: LlmClient = {
    ...noBatch,
    async complete<T>(req: LlmRequest<T>) {
      calls.push(req)
      return { parsed: (req.kind === 'art' ? answer : decision) as T | null, stopReason: 'end_turn', usage: { input: 800, cacheRead: 0, cacheWrite: 3000, output: 300 } }
    },
  }
  return { llm, calls }
}

const marbleRun = (impulse: [number, number, number]) =>
  WorldObject.parse({
    id: 'marble-run',
    kind: 'marble-run',
    name: 'A marble run',
    position: [-9, 0, 12],
    model: { parts: [{ shape: 'sphere', size: [0.2, 0.2, 0.2], at: [0, 0.1, 0], color: '#cc3333' }] },
    contraption: { bodies: [{ part: 0, body: 'dynamic', massKg: 0.2 }], trigger: { part: 0, impulse }, runSec: 12 },
    reason: 'To watch it roll.',
  })

let dir: string
const file = (rel: string) => join(dir, rel)
const readJson = (rel: string) => JSON.parse(readFileSync(file(rel), 'utf8'))
const tick = (now: Date | string, llm: LlmClient) => runTick(dir, { now: new Date(now), llm, pack, behaviors: cat.behaviors, speciesPersona: cat.persona, pools: cat.pools })

async function tinkerADay(impulse: [number, number, number] = [0.1, 0, 0]) {
  writeFileSync(file('objects/marble-run.json'), JSON.stringify(marbleRun(impulse)))
  const steps = [step('tinker', 'marble-run'), step('sit', null)]
  await tick(MORNING, fake(plan(steps)).llm)
  const f = fake(plan(steps))
  const result = await tick(at(25), f.llm)
  return { ...f, result }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tinker-'))
  copyFileSync(join(merge, 'forkling.json'), file('forkling.json'))
  mkdirSync(file('objects'))
  for (const f of readdirSync(join(world, 'objects'))) copyFileSync(join(world, 'objects', f), file(`objects/${f}`))
  for (const f of readdirSync(join(merge, 'objects'))) copyFileSync(join(merge, 'objects', f), file(`objects/${f}`))
})

describe('tinkering', () => {
  it('runs the contraption itself, and keeps what the physics did with what it made of it', async () => {
    const { calls, result } = await tinkerADay()
    const art = calls.find((c) => c.kind === 'art')!
    expect(art.user).toMatch(/You are making a contraption/)
    expect(art.user).toMatch(/moved/i)
    const a = Artifact.parse(readJson('art/run-one.json'))
    expect(a).toMatchObject({ kind: 'contraption', content: { objectId: 'marble-run', moved: true, settled: true, notes: 'The marble rolled along the plank.' } })
    expect(a.kind === 'contraption' && a.content.maxTravel).toBeGreaterThan(0.5)
    expect(result.summary).toMatch(/made a contraption/)
  })

  it('remembers on the object how its last run went', async () => {
    await tinkerADay()
    const o = WorldObject.parse(readJson('objects/marble-run.json'))
    expect(o.contraption?.lastRun).toMatchObject({ moved: true, settled: true, at: at(25).toISOString() })
  })

  it('says honestly when nothing happened, rather than let the model claim something did', async () => {
    await tinkerADay([0.0005, 0, 0])
    const a = Artifact.parse(readJson('art/run-one.json'))
    expect(a.kind === 'contraption' && a.content.moved).toBe(false)
  })

  it('makes nothing from an object that is not a mechanism', async () => {
    const steps = [step('tinker', 'bowl'), step('sit', null)]
    await tick(MORNING, fake(plan(steps)).llm)
    const f = fake(plan(steps))
    await tick(at(25), f.llm)
    expect(existsSync(file('art'))).toBe(false)
  })
})
