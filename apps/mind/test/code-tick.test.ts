import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { BuildRequest, MindState, type SpeciesPack } from '@forkling/schema'
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

const step = (verb: string, target: string | null, topic: string | null = null) => ({ verb, target, x: null, z: null, reason: `I want to ${verb}.`, minutes: 20, materials: null, makes: null, because: null, topic })
const plan = (steps: ReturnType<typeof step>[]): Decision => ({
  thought: 'Time to code.',
  longGoal: { text: 'Make a toy for my site.', reason: 'I like toys.' },
  dropLongGoal: false,
  plan: steps,
  planReason: 'A coding day.',
  stayUpLate: null,
})
const brief = { title: 'Gate Toy', idea: 'A toy of logic gates.', howItPlays: 'Click the switches and watch the lamp.' }

function fake(decision: Decision, answer: unknown = brief) {
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

let dir: string
const file = (rel: string) => join(dir, rel)
const readJson = (rel: string) => JSON.parse(readFileSync(file(rel), 'utf8'))
const state = () => MindState.parse(readJson('mind/state.json'))
const tick = (now: Date | string, llm: LlmClient) => runTick(dir, { now: new Date(now), llm, pack, behaviors: cat.behaviors, speciesPersona: cat.persona, pools: cat.pools })

async function codeADay(steps = [step('code', 'desk', 'a toy of gates'), step('sit', null)]) {
  await tick(MORNING, fake(plan(steps)).llm)
  const f = fake(plan(steps))
  const result = await tick(at(25), f.llm)
  return { ...f, result }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'code-'))
  copyFileSync(join(merge, 'forkling.json'), file('forkling.json'))
  mkdirSync(file('objects'))
  for (const f of readdirSync(join(world, 'objects'))) copyFileSync(join(world, 'objects', f), file(`objects/${f}`))
  for (const f of readdirSync(join(merge, 'objects'))) copyFileSync(join(merge, 'objects', f), file(`objects/${f}`))
})

describe('coding', () => {
  it('a finished code step writes a brief, asks the builder for the project, and opens the build', async () => {
    const { calls, result } = await codeADay()
    const art = calls.find((c) => c.kind === 'art')!
    expect(art.user).toMatch(/You are making a coded project/)
    expect(art.user).toContain('a toy of gates')
    const request = BuildRequest.parse(readJson('mind/builds/gate-toy.json'))
    expect(request).toMatchObject({ kind: 'code', name: 'Gate Toy', purpose: 'A toy of logic gates.', howItPlays: 'Click the switches and watch the lamp.', goalRef: 'today:0' })
    expect(state().openBuild).toMatchObject({ id: 'gate-toy', kind: 'code' })
    expect(state().codeWeek).toEqual({ week: '2026-W45', count: 1 })
    expect(result.build).toBe('gate-toy')
  })

  it('accepts a plan with a code step when the same decision also asks for a designed object', async () => {
    // The plan is checked against what was left before the design took the build slot, not after.
    const both: Decision = { ...plan([step('code', 'desk', 'a toy of gates'), step('sit', null)]), design: { name: 'A tiny lamp', purpose: 'To read by.', contraption: false } }
    await tick(MORNING, fake(both).llm)
    expect(readJson('mind/goals.json').today.steps.map((s: { verb: string }) => s.verb)).toEqual(['code', 'sit'])
    expect(state().rejections).toEqual([])
    expect(existsSync(file('mind/builds/a-tiny-lamp.json'))).toBe(true)
  })

  it('leaves no artifact yet: the project is on the site only when its pull request is merged', async () => {
    await codeADay()
    expect(existsSync(file('art'))).toBe(false)
  })

  it('does not ask for a third project in a week, nor while one is waiting', async () => {
    await codeADay()
    mkdirSync(file('mind'), { recursive: true })
    const s = state()
    writeFileSync(file('mind/state.json'), JSON.stringify({ ...s, openBuild: null, codeWeek: { week: '2026-W45', count: 2 } }))
    const goals = readJson('mind/goals.json')
    goals.now = { ...goals.now, index: 0, startedAt: '2026-11-03T09:30:00Z', until: '2026-11-03T09:50:00Z' }
    writeFileSync(file('mind/goals.json'), JSON.stringify(goals))
    const { notes } = await tick(at(55), fake(plan([step('code', 'desk'), step('sit', null)])).llm)
    expect(notes.join(' ')).toMatch(/two a week/)
    expect(state().codeWeek!.count).toBe(2)
  })

  it('does not plan more coding than the week has room for', async () => {
    mkdirSync(file('mind'))
    writeFileSync(file('mind/state.json'), JSON.stringify({ ...MindState.parse({}), codeWeek: { week: '2026-W45', count: 2 } }))
    const result = await tick(MORNING, fake(plan([step('code', 'desk'), step('sit', null)])).llm)
    expect(result.notes.join(' ')).toMatch(/room for 0 this week/)
  })

  it('closes the build when the project\'s artifact turns up', async () => {
    await codeADay()
    mkdirSync(file('art'), { recursive: true })
    writeFileSync(file('art/gate-toy.json'), JSON.stringify({ id: 'gate-toy', kind: 'code', title: 'Gate Toy', content: { project: 'gate-toy', idea: 'A toy.', howItPlays: 'Click.' }, skillLevel: 0, createdAt: '2026-11-03T12:00:00Z' }))
    await tick(at(60), fake(plan([step('sit', null)])).llm)
    expect(state().openBuild).toBeNull()
  })
})
