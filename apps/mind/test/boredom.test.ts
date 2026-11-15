import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MindState } from '@forkling/schema'
import type { LlmClient, LlmRequest } from '../src/llm.ts'
import { readDiaries, readWritings } from '../src/novelty-inputs.ts'
import { loadSpecies } from '../src/species.ts'
import { runTick } from '../src/tick.ts'
import { noBatch } from './noBatch.ts'

const merge = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const world = fileURLToPath(new URL('../../../templates/forkling-world', import.meta.url))
const cat = loadSpecies('cat')
const NOW = '2026-11-03T09:00:00Z'
const minutesAfter = (min: number) => new Date(Date.parse(NOW) + min * 60_000).toISOString()

const rest = { thought: 'Quiet.', longGoal: null, dropLongGoal: false, plan: [{ verb: 'rest', target: null, reason: 'Rest.', minutes: 30, wantId: null, deep: null, size: null }], planReason: 'A rest.', stayUpLate: null }
const keep = { thought: 'Nothing.', longGoal: null, dropLongGoal: false, plan: null, planReason: null, stayUpLate: null }
function fakeLlm(): LlmClient {
  let planned = false
  return {
    ...noBatch,
    async complete<T>(req: LlmRequest<T>) {
      const parsed = planned ? keep : rest
      planned = true
      return { parsed: parsed as T, stopReason: 'end_turn', usage: { input: 800, cacheRead: 0, cacheWrite: 0, output: 200 } }
    },
  }
}
const deps = (llm: LlmClient, now: string) => ({ now: new Date(now), llm, pack: cat.pack, behaviors: cat.behaviors, speciesPersona: cat.persona })

let dir: string
const file = (rel: string) => join(dir, rel)
const stream = () => readFileSync(file('memory/stream/2026-11-03.jsonl'), 'utf8')
const state = () => MindState.parse(JSON.parse(readFileSync(file('mind/state.json'), 'utf8')))
const putWork = (id: string, made: string) => {
  mkdirSync(file(`works/${id}`), { recursive: true })
  writeFileSync(file(`works/${id}/meta.json`), JSON.stringify({ id, title: 'Moss clock', kind: 'art', about: 'A clock that runs on moss and tells nothing at all.', interest: null, made, status: 'shelf', size: 'full' }))
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bored-'))
  copyFileSync(join(merge, 'forkling.json'), file('forkling.json'))
  mkdirSync(file('objects'))
  mkdirSync(file('places'))
  copyFileSync(join(world, 'places/home.json'), file('places/home.json'))
  copyFileSync(join(world, 'places/workshop.json'), file('places/workshop.json'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('the boredom event (spec 12.4 item 8)', () => {
  it('writes "I keep repeating myself" with importance 6 when the nudges would have fired 3 or more times in a day, and counts it for the reflection', async () => {
    for (let i = 0; i < 5; i++) putWork(`clock-${i}`, `2026-11-03T0${i}:00:00Z`)
    const llm = fakeLlm()
    await runTick(dir, deps(llm, NOW))
    expect(stream()).toMatch(/I keep repeating myself[^\n]*"importance":6/)
    expect(state().reflect?.sum).toBeGreaterThanOrEqual(6)
    expect(state().boredom).toEqual({ date: '2026-11-03' })
  })

  it('writes it once a day, however long the repetition goes on', async () => {
    for (let i = 0; i < 5; i++) putWork(`clock-${i}`, `2026-11-03T0${i}:00:00Z`)
    const llm = fakeLlm()
    await runTick(dir, deps(llm, NOW))
    await runTick(dir, deps(llm, minutesAfter(10)))
    expect(stream().match(/I keep repeating myself/g)).toHaveLength(1)
  })

  it('says nothing when the nudges fired fewer than 3 times', async () => {
    putWork('clock-1', '2026-11-03T01:00:00Z')
    putWork('clock-2', '2026-11-03T02:00:00Z')
    await runTick(dir, deps(fakeLlm(), NOW))
    expect(stream()).not.toMatch(/repeating myself/)
  })
})

describe('reading what Merge has written, for the text numbers', () => {
  it('reads notebook writings with the time in their names, and diary entries by date; nothing for a world with neither', () => {
    expect(readWritings(dir)).toEqual([])
    expect(readDiaries(dir)).toEqual([])
    mkdirSync(file('notebook/writing'), { recursive: true })
    mkdirSync(file('journal'), { recursive: true })
    writeFileSync(file('notebook/writing/2026-11-02-1430-fog.md'), '# Fog\n\nIt came in.\n')
    writeFileSync(file('notebook/writing/notes.txt'), 'not a writing')
    writeFileSync(file('journal/2026-11-02.md'), '# A day\n\nQuiet.\n')
    expect(readWritings(dir)).toEqual([{ id: '2026-11-02-1430-fog.md', at: '2026-11-02T14:30:00Z', text: '# Fog\n\nIt came in.\n' }])
    expect(readDiaries(dir)).toEqual([{ date: '2026-11-02', text: '# A day\n\nQuiet.\n' }])
  })
})
