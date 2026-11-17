import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Goals, JobResult, MindState, SessionJob, sessionJobId } from '@forkling/schema'
import type { LlmClient, LlmRequest } from '../src/llm.ts'
import { loadSpecies } from '../src/species.ts'
import { runTick } from '../src/tick.ts'
import { noBatch } from './noBatch.ts'

/**
 * Step 4, slice C: a `build` step in the tick (spec-v4 3.2). It asks the worker for a session, holds the plan while the session
 * runs (no minute range), and the steps after it start when the session's result arrives.
 */

const templates = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const cat = loadSpecies('cat')
const NOW = '2026-11-03T09:00:00Z' // 10:00 in Stockholm
const minutesAfter = (min: number) => new Date(Date.parse(NOW) + min * 60_000).toISOString()

const step = (verb: string, target: string | null, minutes: number, reason: string) => ({ verb, target, reason, minutes, wantId: null, deep: null, size: null })
const morning = {
  thought: 'A day for the pool clock.',
  longGoal: null,
  dropLongGoal: false,
  plan: [step('rest', null, 30, 'Coffee first.'), step('build', 'Tide clock', 30, 'I want the pool to fill with the hours.'), step('write', 'home', 25, 'A plaque for it.'), step('rest', null, 30, 'Rest.')],
  planReason: 'One thing I build.',
  stayUpLate: null,
}
const keep = { thought: 'Carry on.', longGoal: null, dropLongGoal: false, plan: null, planReason: null, stayUpLate: null }

function fakeLlm() {
  const calls: LlmRequest[] = []
  let planned = false
  const llm: LlmClient = {
    ...noBatch,
    async complete<T>(req: LlmRequest<T>) {
      calls.push(req)
      if (req.kind === 'art') return { parsed: { title: 'Plaque', text: 'A pool that fills with hours.' } as T, stopReason: 'end_turn', usage: { input: 100, cacheRead: 0, cacheWrite: 0, output: 50 } }
      const parsed = planned ? keep : morning
      planned = true
      return { parsed: parsed as T, stopReason: 'end_turn', usage: { input: 800, cacheRead: 0, cacheWrite: 0, output: 400 } }
    },
  }
  return { llm, calls }
}

let dir: string
const file = (rel: string) => join(dir, rel)
const goalsOf = () => Goals.parse(JSON.parse(readFileSync(file('mind/goals.json'), 'utf8')))
const stateOf = () => MindState.parse(JSON.parse(readFileSync(file('mind/state.json'), 'utf8')))
const jobs = () => (existsSync(file('mind/builds')) ? readdirSync(file('mind/builds')).filter((f) => !f.endsWith('.result.json')) : [])
const deps = (llm: LlmClient, now: string) => ({ now: new Date(now), llm, pack: cat.pack, behaviors: cat.behaviors, speciesPersona: cat.persona })

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'build-step-'))
  copyFileSync(join(templates, 'forkling.json'), file('forkling.json'))
  mkdirSync(file('mind'), { recursive: true })
  writeFileSync(file('mind/state.json'), JSON.stringify({ allowance: { points: 450, day: '2026-11-03' } }))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

/** The worker's answer to the session job: done, with what it cost. */
function finishSession(id: string, usd: number, at: string) {
  writeFileSync(
    file(`mind/builds/${id}.result.json`),
    JSON.stringify(JobResult.parse({ id, kind: 'session', status: 'done', projectId: 'tide-clock', title: 'Tide clock', caption: 'the pool fills', calls: [{ at, kind: 'session', model: 'claude-sonnet-5-5', input: 1000, cacheRead: 0, cacheWrite: 0, output: 500, usd }], at })),
  )
}

describe('a build step in the tick', () => {
  it('asks the worker for a session with the target, the reason and the points in hand, and costs nothing when it starts', async () => {
    const fake = fakeLlm()
    await runTick(dir, deps(fake.llm, NOW))
    await runTick(dir, deps(fake.llm, minutesAfter(31)))
    expect(goalsOf().now?.index).toBe(1)
    const files = jobs()
    expect(files).toHaveLength(1)
    const job = SessionJob.parse(JSON.parse(readFileSync(file(`mind/builds/${files[0]}`), 'utf8')))
    expect(job).toMatchObject({ kind: 'session', target: 'Tide clock', reason: 'I want the pool to fill with the hours.' })
    expect(job.id).toBe(sessionJobId(goalsOf().now!.startedAt))
    // The rest step before it cost nothing; the build step costs nothing up front either.
    expect(job.pointsInHand).toBe(stateOf().allowance!.points)
  })

  it('holds the plan while the session runs, keeps its later steps, and starts them when the session ends', async () => {
    const fake = fakeLlm()
    await runTick(dir, deps(fake.llm, NOW))
    await runTick(dir, deps(fake.llm, minutesAfter(31)))
    const buildStart = goalsOf().now!
    expect(buildStart.index).toBe(1)
    // 40 minutes in, the session is still running: the plan holds.
    await runTick(dir, deps(fake.llm, minutesAfter(71)))
    expect(goalsOf().now?.index).toBe(1)
    const pointsBefore = stateOf().allowance!.points
    // 70 minutes into the session it ends; the next tick starts the write step.
    finishSession(sessionJobId(buildStart.startedAt), 0.212, minutesAfter(101))
    await runTick(dir, deps(fake.llm, minutesAfter(101)))
    const g = goalsOf()
    expect(g.today!.steps.map((s) => s.verb)).toEqual(['rest', 'build', 'write', 'rest'])
    expect(g.now?.index).toBe(2)
    expect(Date.parse(g.now!.startedAt)).toBe(Date.parse(minutesAfter(101)))
    // 212 points for the session ($0.212), and 1 for the write step that starts in the same tick.
    expect(stateOf().allowance!.points).toBe(pointsBefore - 212 - 1)
    expect(readFileSync(file('memory/stream/2026-11-03.jsonl'), 'utf8')).toMatch(/I worked on Tide clock: the pool fills/)
  })

  it('lets the plan go on after 90 minutes if no result came, and the late result only reports', async () => {
    const fake = fakeLlm()
    await runTick(dir, deps(fake.llm, NOW))
    await runTick(dir, deps(fake.llm, minutesAfter(31)))
    const buildStart = goalsOf().now!
    await runTick(dir, deps(fake.llm, minutesAfter(122)))
    expect(goalsOf().now?.index).toBe(2)
    finishSession(sessionJobId(buildStart.startedAt), 0.1, minutesAfter(125))
    await runTick(dir, deps(fake.llm, minutesAfter(125)))
    expect(goalsOf().now?.index).toBe(2)
  })

  it('ends a day with a 70-minute session in a valid state at bedtime', async () => {
    const fake = fakeLlm()
    await runTick(dir, deps(fake.llm, NOW))
    await runTick(dir, deps(fake.llm, minutesAfter(31)))
    finishSession(sessionJobId(goalsOf().now!.startedAt), 0.3, minutesAfter(101))
    for (let m = 101; m <= 14 * 60; m += 30) await runTick(dir, deps(fake.llm, minutesAfter(m)))
    expect(() => Goals.parse(JSON.parse(readFileSync(file('mind/goals.json'), 'utf8')))).not.toThrow()
    expect(() => MindState.parse(JSON.parse(readFileSync(file('mind/state.json'), 'utf8')))).not.toThrow()
    expect(stateOf().allowance!.points).toBeGreaterThanOrEqual(0)
  })
})
