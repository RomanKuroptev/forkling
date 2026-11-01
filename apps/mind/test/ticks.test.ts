import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { Health, TICK_KEEP_DAYS, TickLine, type SpeciesPack } from '@forkling/schema'
import type { Decision } from '../src/decision.ts'
import type { LlmClient, LlmRequest } from '../src/llm.ts'
import { loadSpecies } from '../src/species.ts'
import { readTicks } from '../src/ticklog.ts'
import { runTick, type TickDeps } from '../src/tick.ts'
import { noBatch } from './noBatch.ts'

const templates = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const cat = loadSpecies('cat')
const pack: SpeciesPack = { ...cat.pack, needs: Object.fromEntries(Object.entries(cat.pack.needs).map(([id, n]) => [id, { ...n!, decayPerHour: 0 }])) }

const NOW = '2026-11-03T09:00:00Z' // 10:00 in Stockholm, long after waking
const DAY = '2026-11-03'

const morning: Decision = {
  thought: 'The rock catches the sun first.',
  longGoal: { text: 'Make the sunny rock mine.', reason: 'It is warm.' },
  dropLongGoal: false,
  plan: [
    { verb: 'watch', target: 'sunny-rock', x: null, z: null, reason: 'The best seat.', minutes: 30, materials: null, makes: null, because: null, topic: null },
    { verb: 'sit', target: null, x: null, z: null, reason: 'Rest.', minutes: 10, materials: null, makes: null, because: null, topic: null },
  ],
  planReason: 'A day for claiming things.',
  stayUpLate: null,
}

function fakeLlm(decision: Decision | null = morning): LlmClient & { calls: LlmRequest[] } {
  const calls: LlmRequest[] = []
  return {
    calls,
    ...noBatch,
    async complete<T>(req: LlmRequest<T>) {
      calls.push(req)
      return { parsed: decision as T | null, stopReason: decision ? 'end_turn' : 'refusal', usage: { input: 800, cacheRead: 0, cacheWrite: 3000, output: 400 } }
    },
  }
}

let dir: string
const file = (rel: string) => join(dir, rel)
const minutesAfter = (min: number) => new Date(Date.parse(NOW) + min * 60_000).toISOString()
const deps = (iso: string, over: Partial<TickDeps> = {}): TickDeps => ({ now: new Date(iso), llm: fakeLlm(), pack, behaviors: cat.behaviors, speciesPersona: cat.persona, pools: cat.pools, engine: 'v0.7.3', ...over })
const lines = (date = DAY) => readTicks(dir, date)
const health = () => Health.parse(JSON.parse(readFileSync(file('mind/health.json'), 'utf8')))

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ticks-'))
  copyFileSync(join(templates, 'forkling.json'), file('forkling.json'))
  mkdirSync(file('objects'))
  for (const f of readdirSync(join(templates, 'objects'))) copyFileSync(join(templates, 'objects', f), file(`objects/${f}`))
})

describe('the tick log', () => {
  it('writes one line for a tick that did something, saying what woke the mind and what it was asked', async () => {
    const result = await runTick(dir, deps(NOW))
    const [line] = lines()
    expect(lines()).toHaveLength(1)
    expect(TickLine.parse(line)).toMatchObject({ at: '2026-11-03T09:00:00.000Z', engine: 'v0.7.3', asleep: false, think: 'morning' })
    expect(line!.triggers.map((t) => t.kind)).toContain('newDay')
    expect(line!.calls).toHaveLength(1)
    expect(line!.calls[0]).toMatchObject({ kind: 'morning', model: 'claude-haiku-5-5', ok: true })
    expect(line!.calls[0]!.usd).toBeGreaterThan(0)
    expect(line!.stepBefore).toBeNull()
    expect(line!.stepAfter).toMatchObject({ index: 0, verb: 'watch', targetId: 'sunny-rock' })
    expect(line!.planId).toMatch(/^2026-11-03:[0-9a-f]{6,}$/)
    expect(line!.needs).toHaveProperty('hunger')
    expect(line!.wrote).toContain('mind/goals.json')
    expect(result.logged).toBe(true)
  })

  it('writes a line for a tick that changed nothing, and only the log and the health summary', async () => {
    await runTick(dir, deps(NOW))
    const before = readFileSync(file('forkling.json'), 'utf8')
    const goals = readFileSync(file('mind/goals.json'), 'utf8')
    const result = await runTick(dir, deps(minutesAfter(5), { llm: fakeLlm() }))
    expect(result.changed).toBe(false)
    expect(result.written).toEqual([])
    expect(result.logged).toBe(true)
    expect(readFileSync(file('forkling.json'), 'utf8')).toBe(before)
    expect(readFileSync(file('mind/goals.json'), 'utf8')).toBe(goals)
    expect(lines()).toHaveLength(2)
    expect(lines()[1]).toMatchObject({ think: null, triggers: [], calls: [], wrote: [] })
    expect(lines()[1]!.notes.join(' ')).toMatch(/no trigger, no call/)
    expect(lines()[1]!.stepBefore).toEqual(lines()[1]!.stepAfter)
  })

  it('says when a call did not happen, and why', async () => {
    await runTick(dir, deps(NOW, { llm: null }))
    expect(lines()[0]).toMatchObject({ think: 'morning' })
    expect(lines()[0]!.calls).toEqual([expect.objectContaining({ kind: 'morning', ok: false, usd: 0, error: expect.stringMatching(/no credentials/) })])
  })

  it('says when a call failed', async () => {
    const failing: LlmClient = {
      ...noBatch,
      async complete() {
        throw new Error('overloaded')
      },
    }
    await runTick(dir, deps(NOW, { llm: failing }))
    expect(lines()[0]!.calls).toEqual([expect.objectContaining({ kind: 'morning', ok: false, error: expect.stringMatching(/overloaded/) })])
  })

  it('says when the budget refused a call', async () => {
    mkdirSync(file('brain'), { recursive: true })
    writeFileSync(file('brain/budget.json'), JSON.stringify({ month: '2026-11', spentUsd: 10 }))
    await runTick(dir, deps(NOW))
    expect(lines()[0]!.calls[0]).toMatchObject({ ok: false, error: expect.stringMatching(/budget/) })
  })

  it('records the step before and after, when a step ends and the next begins', async () => {
    await runTick(dir, deps(NOW))
    await runTick(dir, deps(minutesAfter(31), { llm: fakeLlm() }))
    const second = lines()[1]!
    expect(second.triggers.map((t) => t.kind)).toEqual(['stepDone'])
    expect(second.stepBefore).toMatchObject({ index: 0, verb: 'watch' })
    expect(second.stepAfter).toMatchObject({ index: 1, verb: 'sit' })
    expect(second.planId).toBe(lines()[0]!.planId)
  })

  it('changes the plan id when the plan is replaced', async () => {
    await runTick(dir, deps(NOW))
    // Something new on the beach makes it think again, and it writes a different plan.
    const rock = JSON.parse(readFileSync(file('objects/sunny-rock.json'), 'utf8'))
    writeFileSync(file('objects/pebble.json'), JSON.stringify({ ...rock, id: 'pebble', name: 'A pebble', position: [12, 0, 24] }))
    await runTick(dir, deps(minutesAfter(10), { llm: fakeLlm({ ...morning, plan: [morning.plan![1]!] }) }))
    expect(lines()[1]!.think).toBe('decide')
    expect(lines()[1]!.planId).not.toBe(lines()[0]!.planId)
  })

  it('writes nothing on a dry run', async () => {
    await runTick(dir, deps(NOW, { dryRun: true }))
    expect(existsSync(file('mind/ticks'))).toBe(false)
    expect(existsSync(file('mind/health.json'))).toBe(false)
  })

  it('keeps two weeks of days and removes the rest', async () => {
    mkdirSync(file('mind/ticks'), { recursive: true })
    for (const day of ['2026-10-01', '2026-10-20', '2026-10-21', '2026-11-02']) writeFileSync(file(`mind/ticks/${day}.jsonl`), '')
    await runTick(dir, deps(NOW))
    // The 14 days from 2026-10-21 to 2026-11-03 stay.
    expect(readdirSync(file('mind/ticks')).sort()).toEqual(['2026-10-21.jsonl', '2026-11-02.jsonl', '2026-11-03.jsonl'])
    expect(TICK_KEEP_DAYS).toBe(14)
  })

  it('skips a line it cannot read rather than failing', async () => {
    await runTick(dir, deps(NOW))
    writeFileSync(file(`mind/ticks/${DAY}.jsonl`), `${readFileSync(file(`mind/ticks/${DAY}.jsonl`), 'utf8')}{not json\n`)
    expect(lines()).toHaveLength(1)
  })
})

describe('the health summary', () => {
  it('is rebuilt every tick from the last one and the tick that just ran', async () => {
    await runTick(dir, deps(NOW))
    await runTick(dir, deps(minutesAfter(10), { llm: fakeLlm() }))
    const h = health()
    expect(h.lastTick.at).toBe('2026-11-03T09:10:00.000Z')
    expect(h.today.ticks).toBe(2)
    expect(h.today.decideCalls).toBe(1)
    expect(h.plan.current).toMatchObject({ verb: 'watch' })
    expect(h.warnings).toEqual([])
  })

  it('warns when a need has been under 15 for over an hour', async () => {
    await runTick(dir, deps(NOW))
    const f = JSON.parse(readFileSync(file('forkling.json'), 'utf8'))
    // Nothing in the template's reach would fix hunger, and nothing decays in this pack, so it stays empty.
    writeFileSync(file('forkling.json'), JSON.stringify({ ...f, needs: { hunger: 2, energy: 80, curiosity: 60 } }))
    for (let m = 10; m <= 90; m += 10) await runTick(dir, deps(minutesAfter(m), { llm: fakeLlm({ ...morning, plan: null }) }))
    expect(health().warnings.join(' ')).toMatch(/hunger has been under 15 for/)
  })
})
