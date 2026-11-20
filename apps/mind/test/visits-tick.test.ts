import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Forkling, MindState, WorkMeta } from '@forkling/schema'
import type { LlmClient, LlmRequest } from '../src/llm.ts'
import { loadSpecies } from '../src/species.ts'
import { runTick } from '../src/tick.ts'
import type { VisitHits } from '../src/visits.ts'
import { noBatch } from './noBatch.ts'

const templates = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const cat = loadSpecies('cat')
const NOW = '2026-11-03T09:00:00Z' // 10:00 in Stockholm

let dir: string
const file = (rel: string) => join(dir, rel)
const json = (rel: string) => JSON.parse(readFileSync(file(rel), 'utf8'))

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'visits-tick-'))
  copyFileSync(join(templates, 'forkling.json'), file('forkling.json'))
  writeFileSync(file('forkling.json'), JSON.stringify({ ...Forkling.parse(json('forkling.json')), asleep: true }))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const step = (verb: string, target: string | null, minutes: number, reason: string) => ({ verb, target, reason, minutes, wantId: null, deep: null, size: null })
function client() {
  const seen: LlmRequest[] = []
  const llm: LlmClient = {
    ...noBatch,
    async complete<T>(req: LlmRequest<T>) {
      seen.push(req as LlmRequest)
      const plan = [step('write', 'home', 25, 'A plaque.'), step('rest', null, 30, 'Rest.'), step('tend', 'home', 30, 'Tidy.')]
      return { parsed: { thought: 'A new day.', longGoal: null, dropLongGoal: false, plan, planReason: 'A day.', stayUpLate: null } as T, stopReason: 'end_turn', usage: { input: 800, cacheRead: 0, cacheWrite: 0, output: 200 } }
    },
  }
  return { llm, seen }
}
const source = (hits: VisitHits) => ({ drain: () => hits })
const deps = (llm: LlmClient, extra: object = {}) => ({ now: new Date(NOW), llm, pack: cat.pack, behaviors: cat.behaviors, speciesPersona: cat.persona, ...extra })
const planPrompt = (seen: LlmRequest[]) => seen.find((r) => r.kind === 'morning' || r.kind === 'decide')!.user

describe('real visits and the work check reach the plan (#422 #400)', () => {
  it('a visit counted since the last tick is kept for the day, and the morning plan sees it as data', async () => {
    const { llm, seen } = client()
    await runTick(dir, deps(llm, { visits: source({ visitors: 2, places: { home: 2, nowhere: 1 } }) }))
    expect(MindState.parse(json('mind/state.json')).visits).toEqual({ date: '2026-11-03', visitors: 2, places: { home: 2 } })
    const prompt = planPrompt(seen)
    expect(prompt).toContain('<data source="visits">\nvisitors today: 2\nplaces they stood in: home (2)\n</data>')
  })

  it('with a counter and nobody yet, it is told so; with no counter (the Actions tick), nothing is shown', async () => {
    const a = client()
    await runTick(dir, deps(a.llm, { visits: source({ visitors: 0, places: {} }) }))
    expect(planPrompt(a.seen)).toContain('visitors today: 0')
    rmSync(file('mind'), { recursive: true, force: true })
    writeFileSync(file('forkling.json'), JSON.stringify({ ...Forkling.parse(json('forkling.json')), asleep: true }))
    const b = client()
    await runTick(dir, deps(b.llm))
    expect(planPrompt(b.seen)).not.toContain('source="visits"')
  })

  it("the plan is told what the work check found for its recent works", async () => {
    const put = (meta: object) => {
      const m = WorkMeta.parse(meta)
      mkdirSync(file(`works/${m.id}`), { recursive: true })
      writeFileSync(file(`works/${m.id}/meta.json`), JSON.stringify(m))
    }
    put({ id: 'counter-toy', title: 'Counter toy', kind: 'tool', about: 'counts', interest: null, made: '2026-11-02T09:00:00Z', status: 'shelf', size: 'sketch' })
    put({ id: 'rain-grid', title: 'Rain grid', kind: 'art', about: 'rain', interest: null, made: '2026-11-02T10:00:00Z', status: 'scrap', scrapReason: 'the screenshot is a single colour, so the page drew nothing to see', size: 'sketch' })
    const { llm, seen } = client()
    await runTick(dir, deps(llm))
    const prompt = planPrompt(seen)
    expect(prompt).toContain('- "Counter toy" (sketch, made 2026-11-02): ran in the check and drew something to see')
    expect(prompt).toContain('- "Rain grid" (sketch, made 2026-11-02): did not pass the check: the screenshot is a single colour, so the page drew nothing to see')
  })
})
