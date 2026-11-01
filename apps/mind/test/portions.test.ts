import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { WorldObject, type SpeciesPack } from '@forkling/schema'
import type { Decision } from '../src/decision.ts'
import type { LlmClient, LlmRequest } from '../src/llm.ts'
import { loadSpecies } from '../src/species.ts'
import { runTick } from '../src/tick.ts'
import { noBatch } from './noBatch.ts'

const merge = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const world = fileURLToPath(new URL('../../../templates/forkling-world', import.meta.url))
const cat = loadSpecies('cat')
/** Needs that never decay, so a test says when it is hungry. */
const pack: SpeciesPack = { ...cat.pack, needs: Object.fromEntries(Object.entries(cat.pack.needs).map(([id, n]) => [id, { ...n!, decayPerHour: 0 }])) }

const NOW = '2026-11-03T09:00:00Z' // 10:00 in Stockholm, long after waking
const at = (min: number) => new Date(Date.parse(NOW) + min * 60_000)

const keep: Decision = { thought: 'Nothing to change.', longGoal: null, dropLongGoal: false, plan: null, planReason: null, stayUpLate: null }
const sit = { verb: 'sit', target: null, x: null, z: null, reason: 'I sit.', minutes: 120, materials: null, makes: null, because: null, topic: null }
const plan: Decision = { ...keep, longGoal: { text: 'Rest.', reason: 'Tired.' }, plan: [sit], planReason: 'Rest.' }

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
const writeJson = (rel: string, v: unknown) => writeFileSync(file(rel), JSON.stringify(v, null, 2))
const tick = (when: Date, llm: LlmClient | null = null) => runTick(dir, { now: when, llm, pack, behaviors: cat.behaviors, speciesPersona: cat.persona, pools: cat.pools })
const bowl = () => WorldObject.parse(readJson('objects/bowl.json'))
const setBowl = (state: Record<string, unknown>) => writeJson('objects/bowl.json', { ...readJson('objects/bowl.json'), state })
const hungry = () => writeJson('forkling.json', { ...readJson('forkling.json'), needs: { hunger: 3, energy: 80, curiosity: 60 } })

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'portions-'))
  copyFileSync(join(merge, 'forkling.json'), file('forkling.json'))
  mkdirSync(file('objects'))
  for (const f of readdirSync(join(merge, 'objects'))) copyFileSync(join(merge, 'objects', f), file(`objects/${f}`))
  copyFileSync(join(world, 'objects', 'bowl.json'), file('objects/bowl.json'))
})

describe('the bowl', () => {
  it('is a bowl of three meals in a new world', () => {
    expect(bowl().properties.portions).toBe(3)
    expect(bowl().state.portionsLeft).toBeUndefined()
  })

  it('has a portion taken for each time the body ate from it, written with the body', async () => {
    await tick(at(0), fake(plan))
    hungry()
    await tick(at(25))
    expect(bowl().state.portionsLeft).toBeLessThan(3)
    expect(bowl().state.portionsLeft).toBeGreaterThanOrEqual(0)
  })

  it('never goes below none', async () => {
    await tick(at(0), fake(plan))
    setBowl({ portionsLeft: 1 })
    hungry()
    await tick(at(25))
    expect(bowl().state.portionsLeft).toBe(0)
  })

  it('is filled again when it wakes, and not before', async () => {
    await tick(at(0), fake(plan))
    setBowl({ portionsLeft: 0 })
    await tick(at(5))
    expect(bowl().state.portionsLeft).toBe(0)
    // Bed, then a morning.
    writeJson('forkling.json', { ...readJson('forkling.json'), asleep: true })
    await tick(at(10))
    expect(bowl().state.portionsLeft).toBe(3)
  })

  it('is empty to the body once the portions are gone: nothing to eat there', async () => {
    await tick(at(0), fake(plan))
    setBowl({ portionsLeft: 0 })
    hungry()
    await tick(at(25))
    expect(bowl().state.portionsLeft).toBe(0)
    // Hunger stays empty, and nothing it can do by itself would fix it: that is the mind's to deal with.
    expect(readJson('forkling.json').needs.hunger).toBeLessThan(15)
  })
})

describe('what the mind is told about the bowl', () => {
  it('says how many meals are left and when it is filled', async () => {
    const llm = fake(plan)
    setBowl({ portionsLeft: 2 })
    // Nothing has happened since the last tick, so nothing is counted yet.
    writeJson('forkling.json', { ...readJson('forkling.json'), lastTickAt: at(0).toISOString() })
    await tick(at(0), llm)
    expect(llm.calls[0]!.user).toMatch(/food to share out: The bowl 2 of 3 portions left, filled again when you wake/)
  })

  it('says nothing about food that never runs out', async () => {
    const llm = fake(plan)
    const o = readJson('objects/bowl.json')
    delete o.properties.portions
    writeJson('objects/bowl.json', o)
    await tick(at(0), llm)
    expect(llm.calls[0]!.user).not.toMatch(/food to share out/)
  })
})
