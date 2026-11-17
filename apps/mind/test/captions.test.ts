import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WorkMeta } from '@forkling/schema'
import type { LlmClient, LlmRequest } from '../src/llm.ts'
import { loadSpecies } from '../src/species.ts'
import { runTick } from '../src/tick.ts'
import { noBatch } from './noBatch.ts'

const merge = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const world = fileURLToPath(new URL('../../../templates/forkling-world', import.meta.url))
const cat = loadSpecies('cat')
const NOW = '2026-11-03T09:00:00Z'
const minutesAfter = (min: number) => new Date(Date.parse(NOW) + min * 60_000).toISOString()

const step = (verb: string, target: string | null, minutes: number, reason: string) => ({ verb, target, reason, minutes, wantId: null, deep: null, size: null })
const planFor = (first: ReturnType<typeof step>) => ({ thought: 'Words for what I made.', longGoal: null, dropLongGoal: false, plan: [first, step('rest', null, 30, 'Rest.'), step('rest', null, 30, 'Rest again.')], planReason: 'A quiet day.', stayUpLate: null })
const keep = { thought: 'Nothing to change.', longGoal: null, dropLongGoal: false, plan: null, planReason: null, stayUpLate: null }
const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ')

function fakeLlm(plan: unknown, text: string) {
  const calls: LlmRequest[] = []
  let planned = false
  const llm: LlmClient = {
    ...noBatch,
    async complete<T>(req: LlmRequest<T>) {
      calls.push(req)
      const usage = { input: 800, cacheRead: 0, cacheWrite: 0, output: 100 }
      if (req.kind === ('art' as never)) return { parsed: { title: 'The lamp', text } as T, stopReason: 'end_turn', usage }
      const parsed = planned ? keep : plan
      planned = true
      return { parsed: parsed as T, stopReason: 'end_turn', usage }
    },
  }
  return { llm, calls }
}

let dir: string
const file = (rel: string) => join(dir, rel)
const put = (rel: string, value: unknown) => {
  mkdirSync(join(dir, rel, '..'), { recursive: true })
  writeFileSync(file(rel), typeof value === 'string' ? value : JSON.stringify(value))
}
const deps = (llm: LlmClient, now: string) => ({ now: new Date(now), llm, pack: cat.pack, behaviors: cat.behaviors, speciesPersona: cat.persona })
const notebook = () => (existsSync(file('notebook/writing')) ? readdirSync(file('notebook/writing')) : [])
const workMeta = () => JSON.parse(readFileSync(file('works/the-lamp/meta.json'), 'utf8'))
async function land(first: ReturnType<typeof step>, text: string) {
  const fake = fakeLlm(planFor(first), text)
  await runTick(dir, deps(fake.llm, NOW))
  await runTick(dir, deps(fake.llm, minutesAfter(31)))
  return fake
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'captions-'))
  copyFileSync(join(merge, 'forkling.json'), file('forkling.json'))
  mkdirSync(file('places'))
  copyFileSync(join(world, 'places/home.json'), file('places/home.json'))
  copyFileSync(join(world, 'places/workshop.json'), file('places/workshop.json'))
  put('works/the-lamp/meta.json', WorkMeta.parse({ id: 'the-lamp', title: 'The Lamp', kind: 'art', about: 'A lamp that dims when alone.', interest: null, made: '2026-11-02T10:00:00Z', status: 'shelf', size: 'sketch' }))
  put('works/the-lamp/index.html', '<!doctype html><title>x</title>')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('a write step is a caption or a page, by its target (spec v4 6)', () => {
  it('asks a caption of up to 40 words when the target is a work, and keeps it in the work, not in the notebook', async () => {
    const fake = await land(step('write', 'the-lamp', 25, 'A label for the lamp.'), words(30))
    const ask = fake.calls.find((c) => c.kind === ('art' as never))!
    expect(ask.user).toMatch(/caption of up to 40 words/)
    expect(workMeta().caption).toBe(words(30))
    expect(notebook()).toEqual([])
  })

  it('keeps a caption of 40 words whole and cuts a longer one at 40 words, not throwing it away', async () => {
    await land(step('write', 'the-lamp', 25, 'A label.'), words(40))
    expect(workMeta().caption).toBe(words(40))
    rmSync(file('works/the-lamp/meta.json'))
    put('works/the-lamp/meta.json', WorkMeta.parse({ id: 'the-lamp', title: 'The Lamp', kind: 'art', about: 'A lamp that dims when alone.', interest: null, made: '2026-11-02T10:00:00Z', status: 'shelf', size: 'sketch' }))
    rmSync(file('mind'), { recursive: true, force: true })
    await land(step('write', 'the-lamp', 25, 'A label.'), words(51))
    expect(workMeta().caption).toBe(words(40))
  })

  it('makes a caption for a place a plaque text, as it always was, of up to 40 words', async () => {
    const fake = await land(step('write', 'workshop', 25, 'A plaque for the door.'), words(20))
    expect(fake.calls.find((c) => c.kind === ('art' as never))!.user).toMatch(/caption of up to 40 words/)
    expect(notebook()).toHaveLength(1)
  })

  it('makes a page of up to 80 words for a subject, kept to 100', async () => {
    const fake = await land(step('write', 'Joke languages', 25, 'A page on a subject.'), words(90))
    expect(fake.calls.find((c) => c.kind === ('art' as never))!.user).toMatch(/up to 80 words/)
    expect(notebook()).toHaveLength(1)
    rmSync(file('notebook'), { recursive: true, force: true })
    rmSync(file('mind'), { recursive: true, force: true })
    await land(step('write', 'Joke languages', 25, 'A page on a subject.'), words(101))
    expect(notebook()).toEqual([])
  })
})
