import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Goals, MindState, WorkMeta, type WeeklyReview } from '@forkling/schema'
import type { LlmClient, LlmRequest } from '../src/llm.ts'
import { loadSpecies } from '../src/species.ts'
import { runTick } from '../src/tick.ts'
import { noBatch } from './noBatch.ts'

const templates = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const cat = loadSpecies('cat')
const SUNDAY = Date.parse('2026-11-15T19:00:00Z') // 20:00 in Stockholm
const usage = { input: 20_000, cacheRead: 0, cacheWrite: 0, output: 3_000 }

let dir: string
const file = (rel: string) => join(dir, rel)
const json = (rel: string) => JSON.parse(readFileSync(file(rel), 'utf8'))

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'weekly-tick-'))
  copyFileSync(join(templates, 'forkling.json'), file('forkling.json'))
  mkdirSync(file('mind'), { recursive: true })
  // A plan is made for the day and a long goal exists, so nothing else wants the model.
  writeFileSync(file('mind/state.json'), JSON.stringify(MindState.parse({ lastPlanDate: '2026-11-15' })))
  writeFileSync(file('mind/goals.json'), JSON.stringify(Goals.parse({ long: { text: 'Map the fog.', reason: 'It returns.', setAt: '2026-11-01T07:00:00Z', reviewedAt: '2026-11-08T07:00:00Z' } })))
  mkdirSync(file('works/tide-pool-clock'), { recursive: true })
  writeFileSync(file('works/tide-pool-clock/meta.json'), JSON.stringify(WorkMeta.parse({ id: 'tide-pool-clock', title: 'Tide pool clock', kind: 'art', about: 'A clock.', interest: null, made: '2026-11-14T10:00:00Z', status: 'shelf', size: 'full' })))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const review: WeeklyReview = {
  about: 'I am patient.\n- patient\n- fond of fog',
  aboutChanges: [{ what: 'wrote the first version', why: 'The week showed me what I keep doing.' }],
  longGoal: { action: 'continue', text: null, reason: 'It still pulls at me.' },
  renames: [{ kind: 'work', id: 'tide-pool-clock', name: 'Tide clock', reason: 'It is a tide, not a pool.' }],
  request: 'Could I read one more site?\nIt keeps blocking me.',
}

function client() {
  const log = { kinds: [] as string[], weekly: [] as LlmRequest[] }
  const llm: LlmClient = {
    ...noBatch,
    async complete<T>(req: LlmRequest<T>) {
      log.kinds.push(req.kind)
      if (req.kind === 'weekly') log.weekly.push(req as LlmRequest)
      return { parsed: (req.kind === 'weekly' ? review : null) as T | null, stopReason: req.kind === 'weekly' ? 'end_turn' : 'refusal', usage }
    },
  }
  return { llm, log }
}
const deps = (llm: LlmClient, now: number) => ({ now: new Date(now), llm, pack: cat.pack, behaviors: cat.behaviors, speciesPersona: cat.persona })

describe('the weekly review through a tick (spec 9.5)', () => {
  it('on Sunday at 20:00 writes about.md and its dated copy with the reasons, renames the work, and books the week', async () => {
    const { llm, log } = client()
    await runTick(dir, deps(llm, SUNDAY))
    expect(log.weekly).toHaveLength(1)
    expect(readFileSync(file('self/about.md'), 'utf8')).toBe('I am patient.\n- patient\n- fond of fog\n')
    const copy = readFileSync(file('self/history/2026-11-15.md'), 'utf8')
    expect(copy).toContain('I am patient.')
    expect(copy).toContain('- wrote the first version: The week showed me what I keep doing.')
    expect(WorkMeta.parse(json('works/tide-pool-clock/meta.json'))).toMatchObject({ title: 'Tide clock', titleHistory: [{ from: 'Tide pool clock', reason: 'It is a tide, not a pool.' }] })
    expect(MindState.parse(json('mind/state.json')).lastWeeklyDate).toBe('2026-11-15')
    expect(readFileSync(file('self/requests/2026-11-15.md'), 'utf8')).toBe('Could I read one more site?\nIt keeps blocking me.\n')
    expect(Goals.parse(json('mind/goals.json')).long?.reviewedAt).toBe(new Date(SUNDAY).toISOString())
  })

  it('runs once: later ticks that Sunday make no weekly call', async () => {
    const { llm, log } = client()
    await runTick(dir, deps(llm, SUNDAY))
    await runTick(dir, deps(llm, SUNDAY + 60_000))
    await runTick(dir, deps(llm, SUNDAY + 3_600_000))
    expect(log.weekly).toHaveLength(1)
  })

  it('does not run on a Monday, or on a Sunday before 20:00', async () => {
    const { llm, log } = client()
    await runTick(dir, deps(llm, Date.parse('2026-11-16T19:00:00Z')))
    await runTick(dir, deps(llm, Date.parse('2026-11-15T18:30:00Z')))
    expect(log.weekly).toHaveLength(0)
    expect(existsSync(file('self/about.md'))).toBe(false)
  })

  it('the old trigger is gone: a long goal not reviewed for a week no longer wakes a call on its own', async () => {
    const { llm, log } = client()
    await runTick(dir, deps(llm, Date.parse('2026-11-17T09:00:00Z')))
    expect(log.kinds).not.toContain('weekly')
  })
})
