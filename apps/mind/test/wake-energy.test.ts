import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Forkling, Goals } from '@forkling/schema'
import type { LlmClient, LlmRequest } from '../src/llm.ts'
import { loadSpecies } from '../src/species.ts'
import { runTick } from '../src/tick.ts'
import { noBatch } from './noBatch.ts'

const templates = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const cat = loadSpecies('cat')
const NOW = '2026-11-03T09:00:00Z' // 10:00 in Stockholm, awake

let dir: string
const file = (rel: string) => join(dir, rel)
const json = (rel: string) => JSON.parse(readFileSync(file(rel), 'utf8'))

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wake-energy-'))
  copyFileSync(join(templates, 'forkling.json'), file('forkling.json'))
  // In bed at the last write, worn out from the day before: this tick is the waking up.
  writeFileSync(file('forkling.json'), JSON.stringify({ ...Forkling.parse(json('forkling.json')), asleep: true, energy: -0.8 }))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const step = (verb: string, target: string | null, minutes: number, reason: string) => ({ verb, target, reason, minutes, wantId: null, deep: null, size: null })
// Five steps: one more than a tired plan may hold.
const plan = [
  step('write', 'home', 20, 'A plaque.'),
  step('rest', null, 20, 'Rest.'),
  step('write', 'home', 20, 'Another plaque.'),
  step('rest', null, 20, 'Rest again.'),
  step('write', 'home', 20, 'A third plaque.'),
]

function client() {
  const seen: LlmRequest[] = []
  const llm: LlmClient = {
    ...noBatch,
    async complete<T>(req: LlmRequest<T>) {
      seen.push(req as LlmRequest)
      const usage = { input: 800, cacheRead: 0, cacheWrite: 0, output: 200 }
      return { parsed: { thought: 'A new day.', longGoal: null, dropLongGoal: false, plan, planReason: 'A day.', stayUpLate: null } as T, stopReason: 'end_turn', usage }
    },
  }
  return { llm, seen }
}

describe('waking comes before the morning plan', () => {
  it("a tick at wake with last night's energy under -0.5 plans rested, with no tired limit", async () => {
    const { llm, seen } = client()
    await runTick(dir, { now: new Date(NOW), llm, pack: cat.pack, behaviors: cat.behaviors, speciesPersona: cat.persona })
    const morning = seen.find((r) => r.kind === 'morning')
    expect(morning).toBeDefined()
    expect(morning!.user).toMatch(/rested/)
    expect(morning!.user).not.toMatch(/\btired\b/)
    expect(morning!.user).not.toContain('- Tired:')
    expect(Goals.parse(json('mind/goals.json')).today?.steps).toHaveLength(5)
    expect(Forkling.parse(json('forkling.json')).energy).toBe(0.5)
  })
})
