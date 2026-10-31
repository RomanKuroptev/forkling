import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_PHOTOS_PER_DAY, MindState, type SpeciesPack } from '@forkling/schema'
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

const step = (verb: string, target: string | null) => ({
  verb, target, x: null, z: null, reason: `I want to ${verb}.`, minutes: 20, materials: null, makes: null, because: null, topic: null,
})
const plan = (steps: ReturnType<typeof step>[]): Decision => ({
  thought: 'Time to look around.',
  longGoal: { text: 'Keep what I see.', reason: 'I like pictures.' },
  dropLongGoal: false,
  plan: steps,
  planReason: 'A looking day.',
  stayUpLate: null,
})

interface Fake extends LlmClient {
  calls: LlmRequest[]
  kinds: () => string[]
}
function fake(decision: Decision): Fake {
  const calls: LlmRequest[] = []
  return {
    ...noBatch,
    calls,
    kinds: () => calls.map((c) => c.kind),
    async complete<T>(req: LlmRequest<T>) {
      calls.push(req)
      return { parsed: decision as T | null, stopReason: 'end_turn', usage: { input: 800, cacheRead: 0, cacheWrite: 3000, output: 300 } }
    },
  }
}

let dir: string
const file = (rel: string) => join(dir, rel)
const readJson = (rel: string) => JSON.parse(readFileSync(file(rel), 'utf8'))
const state = () => MindState.parse(readJson('mind/state.json'))
const tick = (now: Date | string, llm: LlmClient | null, over: Partial<TickDeps> = {}) =>
  runTick(dir, { now: new Date(now), llm, pack, behaviors: cat.behaviors, speciesPersona: cat.persona, pools: cat.pools, ...over })

/** A morning plan, then the first step runs out. */
async function photographADay(steps: ReturnType<typeof step>[]) {
  await tick(MORNING, fake(plan(steps)))
  const llm = fake(plan(steps))
  const result = await tick(at(25), llm)
  return { llm, result }
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'photo-'))
  copyFileSync(join(merge, 'forkling.json'), file('forkling.json'))
  mkdirSync(file('objects'))
  for (const f of readdirSync(join(world, 'objects'))) copyFileSync(join(world, 'objects', f), file(`objects/${f}`))
  for (const f of readdirSync(join(merge, 'objects'))) copyFileSync(join(merge, 'objects', f), file(`objects/${f}`))
})

describe('photographing', () => {
  it('a finished photograph step queues a shot of its target and calls no model yet', async () => {
    const { llm, result } = await photographADay([step('photograph', 'bowl'), step('sit', null)])
    expect(llm.kinds()).toEqual([])
    const photos = state().photos!
    const shot = photos.queue.find((s) => s.why === 'photograph')!
    expect(shot).toMatchObject({ subjectId: 'bowl', goalRef: 'today:0' })
    expect(shot.reason).toContain('photograph')
    expect(shot.eye[1]).toBeGreaterThan(0)
    expect(shot.look[1]).toBeGreaterThan(0)
    expect(photos.date).toBe(DAY)
    expect(photos.count).toBe(photos.queue.length)
    expect(result.photos).toBe(photos.queue.length)
    expect(existsSync(file('art'))).toBe(false)
  })

  it('looks at the middle of what it photographs from where it stands', async () => {
    await photographADay([step('photograph', 'bowl'), step('sit', null)])
    const shot = state().photos!.queue.find((s) => s.why === 'photograph')!
    const bowl = readJson('objects/bowl.json')
    expect(shot.look[0]).toBeCloseTo(bowl.position[0], 1)
    expect(shot.look[2]).toBeCloseTo(bowl.position[2], 1)
  })

  it('takes no more frames once the day is used up, and says so', async () => {
    await photographADay([step('photograph', 'bowl'), step('sit', null)])
    writeFileSync(file('mind/state.json'), JSON.stringify({ ...state(), photos: { date: DAY, count: MAX_PHOTOS_PER_DAY, queue: [] } }))
    // The first step is running again: its time runs out at 09:50.
    const goals = readJson('mind/goals.json')
    goals.now = { ...goals.now, index: 0, startedAt: '2026-11-03T09:30:00Z', until: '2026-11-03T09:50:00Z' }
    writeFileSync(file('mind/goals.json'), JSON.stringify(goals))
    const { notes } = await tick(at(55), fake(plan([step('photograph', 'bowl'), step('sit', null)])))
    expect(state().photos!.count).toBe(MAX_PHOTOS_PER_DAY)
    expect(state().photos!.queue).toEqual([])
    expect(notes.join(' ')).toMatch(/photo limit/)
  })

  it('does not plan more photographs than it has frames for', async () => {
    mkdirSync(file('mind'))
    writeFileSync(file('mind/state.json'), JSON.stringify({ ...MindState.parse({}), photos: { date: DAY, count: MAX_PHOTOS_PER_DAY, queue: [] } }))
    const llm = fake(plan([step('photograph', 'bowl'), step('sit', null)]))
    const result = await tick(MORNING, llm)
    expect(result.notes.join(' ')).toMatch(/0 frames/)
  })
})

describe('noticing', () => {
  it('queues a shot of something new that appears near it, once', async () => {
    await tick(MORNING, fake(plan([step('sit', null)])))
    const before = state().photos?.queue.length ?? 0
    const forkling = readJson('forkling.json')
    const [x, , z] = forkling.position as [number, number, number]
    const bowl = readJson('objects/bowl.json')
    writeFileSync(file('objects/gift.json'), JSON.stringify({ ...bowl, id: 'gift', name: 'A gift', position: [x + 1, 0, z + 1] }))
    await tick(at(10), fake(plan([step('sit', null)])))
    const shots = state().photos!.queue.filter((s) => s.subjectId === 'gift')
    expect(shots).toHaveLength(1)
    expect(shots[0]).toMatchObject({ why: 'noticed' })
    expect(state().photos!.queue.length).toBe(before + 1)
    await tick(at(20), fake(plan([step('sit', null)])))
    expect(state().photos!.queue.filter((s) => s.subjectId === 'gift')).toHaveLength(1)
  })

  it('does not see what is too far away', async () => {
    await tick(MORNING, fake(plan([step('sit', null)])))
    const bowl = readJson('objects/bowl.json')
    writeFileSync(file('objects/faraway.json'), JSON.stringify({ ...bowl, id: 'faraway', name: 'Faraway', position: [45, 0, 45] }))
    await tick(at(10), fake(plan([step('sit', null)])))
    expect(state().photos!.queue.some((s) => s.subjectId === 'faraway')).toBe(false)
  })
})
