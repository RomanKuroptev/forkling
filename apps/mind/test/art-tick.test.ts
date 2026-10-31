import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { Artifact, BudgetLedger, MindState, type SpeciesPack } from '@forkling/schema'
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

const step = (verb: string, target: string | null, topic: string | null = null) => ({
  verb, target, x: null, z: null, reason: `I want to ${verb}.`, minutes: 20, materials: null, makes: null, because: null, topic,
})
const plan = (steps: ReturnType<typeof step>[]): Decision => ({
  thought: 'Time to make things.',
  longGoal: { text: 'Fill the island with my work.', reason: 'I like making.' },
  dropLongGoal: false,
  plan: steps,
  planReason: 'A making day.',
  stayUpLate: null,
})

type ArtAnswers = Partial<Record<string, unknown>>
const answers: ArtAnswers = {
  writing: { title: 'The Sea', text: 'The sea is a big water bowl.' },
  drawing: { title: 'Hill', svg: '<svg viewBox="0 0 100 100" onload="steal()"><script>steal()</script><circle cx="50" cy="50" r="20" fill="orange"/></svg>' },
  melody: { title: 'Rock tune', bpm: 100, notes: [{ pitch: 'C4', beats: 1 }, { pitch: 'E4', beats: 1 }, { pitch: 'G4', beats: 2 }] },
}

interface Fake extends LlmClient {
  calls: LlmRequest[]
  kinds: () => string[]
}
function fake(decision: Decision, art: ArtAnswers = answers): Fake {
  const calls: LlmRequest[] = []
  return {
    ...noBatch,
    calls,
    kinds: () => calls.map((c) => c.kind),
    async complete<T>(req: LlmRequest<T>) {
      calls.push(req)
      let parsed: unknown = decision
      if (req.kind === 'art') {
        const kind = /You are making an? (\w+)/.exec(req.user)?.[1] ?? ''
        parsed = art[kind] ?? null
      }
      return { parsed: parsed as T | null, stopReason: 'end_turn', usage: { input: 800, cacheRead: 0, cacheWrite: 3000, output: 300 } }
    },
  }
}

let dir: string
const file = (rel: string) => join(dir, rel)
const readJson = (rel: string) => JSON.parse(readFileSync(file(rel), 'utf8'))
const tick = (now: Date | string, llm: LlmClient | null, over: Partial<TickDeps> = {}) =>
  runTick(dir, { now: new Date(now), llm, pack, behaviors: cat.behaviors, speciesPersona: cat.persona, pools: cat.pools, ...over })

/** A morning plan, then the first step runs out. */
async function makeADay(steps: ReturnType<typeof step>[], over: Partial<TickDeps> = {}, art?: ArtAnswers) {
  await tick(MORNING, fake(plan(steps)), over)
  const llm = fake(plan(steps), art)
  const result = await tick(at(25), llm, over)
  return { llm, result }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'art-'))
  copyFileSync(join(merge, 'forkling.json'), file('forkling.json'))
  mkdirSync(file('objects'))
  for (const f of readdirSync(join(world, 'objects'))) copyFileSync(join(world, 'objects', f), file(`objects/${f}`))
  for (const f of readdirSync(join(merge, 'objects'))) copyFileSync(join(merge, 'objects', f), file(`objects/${f}`))
})

describe('making art', () => {
  it('a finished write step leaves a piece of writing in art/, made at the skill it has', async () => {
    const { llm, result } = await makeADay([step('write', 'desk', 'the sea'), step('sit', null)])
    expect(llm.kinds()).toEqual(['art'])
    expect(llm.calls[0]!.user).toContain('the sea')
    expect(llm.calls[0]!.user).toMatch(/skill level is \d+ of 10/i)

    const a = Artifact.parse(readJson('art/the-sea.json'))
    expect(a).toMatchObject({ kind: 'writing', title: 'The Sea', goalRef: 'today:0', content: { text: 'The sea is a big water bowl.' } })
    expect(a.skillLevel).toBeLessThanOrEqual(1)
    expect(result.written).toContain('art/the-sea.json')
    expect(result.summary).toMatch(/made a writing/)
    expect(MindState.parse(readJson('mind/state.json')).arts).toEqual({ date: DAY, count: 1 })
    expect(BudgetLedger.parse(readJson('brain/budget.json')).calls.map((c) => c.kind)).toContain('art')
    expect(readFileSync(file(`memory/stream/${DAY}.jsonl`), 'utf8')).toContain('Made a writing: \\"The Sea\\"')
  })

  it('a drawing is cleaned before it is kept', async () => {
    await makeADay([step('draw', 'desk', 'a hill'), step('sit', null)])
    const a = Artifact.parse(readJson('art/hill.json'))
    expect(a.kind === 'drawing' && a.content.svg).toBe('<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="20" fill="orange"/></svg>')
  })

  it('composing at the drum leaves a melody', async () => {
    await makeADay([step('compose', 'drum', 'the tall rock'), step('sit', null)])
    const a = Artifact.parse(readJson('art/rock-tune.json'))
    expect(a.kind === 'melody' && a.content.notes).toHaveLength(3)
  })

  it('playing an instrument leaves nothing behind', async () => {
    const { llm } = await makeADay([step('play', 'drum'), step('sit', null)])
    expect(llm.kinds()).toEqual([])
    expect(existsSync(file('art'))).toBe(false)
  })

  it('does not reuse the name of earlier work', async () => {
    mkdirSync(file('art'))
    const earlier = Artifact.parse({ id: 'the-sea', kind: 'writing', title: 'The Sea', content: { text: 'Old.' }, skillLevel: 0, createdAt: '2026-11-02T10:00:00Z' })
    writeFileSync(file('art/the-sea.json'), JSON.stringify(earlier))
    const { llm } = await makeADay([step('write', 'desk', 'the sea'), step('sit', null)])
    expect(llm.calls[0]!.user).toContain('"The Sea"')
    expect(Artifact.parse(readJson('art/the-sea-2.json')).content).toEqual({ text: 'The sea is a big water bowl.' })
    expect(Artifact.parse(readJson('art/the-sea.json')).content).toEqual({ text: 'Old.' })
  })

  it('serves its obsession when it has one', async () => {
    const source = { id: 'hn:1', title: 't', url: 'https://x.test', at: '2026-11-01T07:00:00Z' }
    mkdirSync(file('brain'))
    writeFileSync(file('brain/interests.json'), JSON.stringify({ topics: { 'logic gates': { weight: 0.9, firstSeen: source.at, lastFed: source.at, sources: [source] } }, current: null, past: [] }))
    const { llm } = await makeADay([step('write', 'desk', null), step('sit', null)])
    expect(Artifact.parse(readJson('art/the-sea.json')).obsessionRef).toBe('logic gates')
    expect(llm.calls[0]!.user).toContain('obsessed with "logic gates"')
  })

  it('keeps nothing and says so when the model gives something unusable', async () => {
    const { llm, result } = await makeADay([step('draw', 'desk', 'a hill'), step('sit', null)], {}, { drawing: { title: 'Bad', svg: '<script>x()</script>' } })
    expect(llm.kinds()).toEqual(['art'])
    expect(existsSync(file('art'))).toBe(false)
    expect(result.notes.join('\n')).toMatch(/not usable/)
    expect(MindState.parse(readJson('mind/state.json')).arts).toBeUndefined()
  })

  it('stops at four a day', async () => {
    await tick(MORNING, fake(plan([step('write', 'desk', 'the sea'), step('sit', null)])))
    writeFileSync(file('mind/state.json'), JSON.stringify({ ...readJson('mind/state.json'), arts: { date: DAY, count: 4 } }))
    const llm = fake(plan([step('write', 'desk', 'the sea'), step('sit', null)]))
    const result = await tick(at(25), llm)
    expect(llm.kinds()).toEqual([])
    expect(result.notes.join('\n')).toMatch(/art limit reached/)
  })

  it('shows nothing and writes nothing in a dry run', async () => {
    await tick(MORNING, fake(plan([step('write', 'desk', 'the sea'), step('sit', null)])))
    const result = await tick(at(25), fake(plan([])), { dryRun: true })
    expect(existsSync(file('art'))).toBe(false)
    expect(result.notes.join('\n')).toMatch(/dry run/)
  })
})

describe('a plan that makes too much', () => {
  it('is turned down with the room that is left, and the model is asked again', async () => {
    const tooMuch = plan([
      step('write', 'desk', 'a'), step('sit', null), step('write', 'desk', 'b'), step('sit', null), step('write', 'desk', 'c'), step('sit', null), step('write', 'desk', 'd'), step('sit', null), step('write', 'desk', 'e'),
    ])
    const llm = fake(tooMuch)
    const result = await tick(MORNING, llm)
    expect(llm.kinds()).toEqual(['morning', 'morning'])
    expect(result.notes.join('\n')).toMatch(/would make 5 things, but there is room for 4 more today/)
  })

  it('counts what it has already made today', async () => {
    mkdirSync(file('mind'), { recursive: true })
    writeFileSync(file('mind/state.json'), JSON.stringify({ arts: { date: DAY, count: 3 } }))
    const llm = fake(plan([step('write', 'desk', 'a'), step('sit', null), step('write', 'desk', 'b')]))
    const result = await tick(MORNING, llm)
    expect(result.notes.join('\n')).toMatch(/room for 1 more today/)
  })
})
