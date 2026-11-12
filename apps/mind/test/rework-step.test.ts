import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MindState, TinkerJob, WorkMeta } from '@forkling/schema'
import type { WorkCheckResult, WorkChecker } from '../src/builds/browser-check.ts'
import type { LlmClient, LlmRequest } from '../src/llm.ts'
import { loadSpecies } from '../src/species.ts'
import { runTick } from '../src/tick.ts'
import { noBatch } from './noBatch.ts'

const templates = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const cat = loadSpecies('cat')
const NOW = '2026-11-03T09:00:00Z'
const minutesAfter = (min: number) => new Date(Date.parse(NOW) + min * 60_000).toISOString()
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const OLD_HTML = '<!doctype html><html><head><meta charset="utf-8"></head><body><p>OLD-LAMP-MARKER</p><script src="../../lib/p5.min.js"></script></body></html>'

const step = (verb: string, target: string | null, minutes: number, reason: string, over: Record<string, unknown> = {}) => ({ verb, target, reason, minutes, wantId: null, deep: null, size: null, ...over })
const planFor = (target: string, size: 'sketch' | 'full' = 'sketch') => ({
  thought: 'Back to the lamp.',
  longGoal: null,
  dropLongGoal: false,
  plan: [step('tinker', target, size === 'full' ? 90 : 60, 'I want to do something with the lamp.', { size }), step('write', 'home', 25, 'A plaque.'), step('rest', null, 30, 'Rest.')],
  planReason: 'A day with the lamp.',
  stayUpLate: null,
})
const keep = { thought: 'Nothing to change.', longGoal: null, dropLongGoal: false, plan: null, planReason: null, stayUpLate: null }
const sketchOut = { meta: { title: 'Lamp, again', kind: 'art', about: 'The lamp, taken apart and put back differently.', interest: null, sources: [] }, html: '<!doctype html><html><head><meta charset="utf-8"></head><body><script src="../../lib/p5.min.js"></script><script>function setup(){createCanvas(480,360)} function draw(){background(20)}</script></body></html>' }

function fakeLlm(plan: unknown, rework: unknown) {
  const calls: LlmRequest[] = []
  let planned = false
  const llm: LlmClient = {
    ...noBatch,
    async complete<T>(req: LlmRequest<T>) {
      calls.push(req)
      const usage = { input: 800, cacheRead: 0, cacheWrite: 0, output: 200 }
      if (req.kind === 'rework') return { parsed: (rework as T | null) ?? null, stopReason: rework ? 'end_turn' : 'refusal', usage }
      if (req.kind === 'sketch') return { parsed: sketchOut as T, stopReason: 'end_turn', usage }
      const parsed = planned ? keep : plan
      planned = true
      return { parsed: parsed as T, stopReason: 'end_turn', usage }
    },
  }
  return { llm, calls }
}
const checker = (): WorkChecker => ({ check: async () => ({ ok: true, reasons: [], thumb: PNG } satisfies WorkCheckResult), available: async () => true, close: async () => undefined })

let dir: string
const file = (rel: string) => join(dir, rel)
const metaOf = (id: string) => WorkMeta.parse(JSON.parse(readFileSync(file(`works/${id}/meta.json`), 'utf8')))
const stateOf = () => MindState.parse(JSON.parse(readFileSync(file('mind/state.json'), 'utf8')))
const streamText = () => readFileSync(file('memory/stream/2026-11-03.jsonl'), 'utf8')
const putWork = (id: string, over: Record<string, unknown> = {}) => {
  mkdirSync(file(`works/${id}`), { recursive: true })
  writeFileSync(file(`works/${id}/index.html`), OLD_HTML)
  writeFileSync(file(`works/${id}/meta.json`), JSON.stringify(WorkMeta.parse({ id, title: 'Humming lamp', kind: 'art', about: 'A lamp that hums.', interest: null, made: '2026-11-01T10:00:00Z', status: 'shelf', size: 'full', libraries: ['p5'], ...over })))
}
const seedState = (extra: Record<string, unknown>) => {
  mkdirSync(file('mind'), { recursive: true })
  writeFileSync(file('mind/state.json'), JSON.stringify(extra))
}
const deps = (llm: LlmClient, now: string, workCheck?: WorkChecker) => ({ now: new Date(now), llm, pack: cat.pack, behaviors: cat.behaviors, speciesPersona: cat.persona, ...(workCheck ? { workCheck } : {}) })
async function landOn(fake: ReturnType<typeof fakeLlm>, workCheck?: WorkChecker) {
  await runTick(dir, deps(fake.llm, NOW, workCheck))
  return runTick(dir, deps(fake.llm, minutesAfter(91), workCheck))
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rework-'))
  copyFileSync(join(templates, 'forkling.json'), file('forkling.json'))
  mkdirSync(file('objects'))
  for (const f of readdirSync(join(templates, 'objects'))) copyFileSync(join(templates, 'objects', f), file(`objects/${f}`))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('a tinker step on an earlier work (spec 7.5, 9.9)', () => {
  it('first asks a cheap Haiku question: remix it, put it away, or (if it is put away) bring it back', async () => {
    putWork('lamp')
    const fake = fakeLlm(planFor('lamp'), { action: 'retire', reason: 'I have outgrown it.' })
    await landOn(fake)
    const ask = fake.calls.find((c) => c.kind === 'rework')!
    expect(ask).toMatchObject({ model: 'claude-haiku-5-5', effort: 'low' })
    expect(ask.user).toContain('Humming lamp')
    expect(ask.user).toMatch(/remix/i)
    expect(ask.user).toMatch(/retire/i)
    expect(ask.user).not.toMatch(/restore|bring it back/i)
  })

  it('retires a shelved work with its reason: only the meta changes, no browser is needed, and no sketch is counted', async () => {
    putWork('lamp')
    const result = await landOn(fakeLlm(planFor('lamp'), { action: 'retire', reason: 'I have outgrown it.' }))
    expect(metaOf('lamp')).toMatchObject({ status: 'retired', retireReason: 'I have outgrown it.' })
    expect(readFileSync(file('works/lamp/index.html'), 'utf8')).toBe(OLD_HTML)
    expect(result.written).toContain('works/lamp/meta.json')
    expect(stateOf().retirements).toHaveLength(1)
    expect(stateOf().sketches).toBeUndefined()
    expect(streamText()).toMatch(/put away[^a-z]+Humming lamp/i)
    expect(result.summary).toMatch(/retired "Humming lamp"/)
  })

  it('puts away at most 2 a week, counting back 7 days, and says so', async () => {
    putWork('lamp')
    seedState({ retirements: [minutesAfter(-60), minutesAfter(-3000)] })
    const result = await landOn(fakeLlm(planFor('lamp'), { action: 'retire', reason: 'Enough.' }))
    expect(metaOf('lamp').status).toBe('shelf')
    expect(result.notes.join(' ')).toMatch(/2 a week|two works/i)
  })

  it('does not count a retirement from more than 7 days ago', async () => {
    putWork('lamp')
    seedState({ retirements: [minutesAfter(-60 * 24 * 8), minutesAfter(-60)] })
    await landOn(fakeLlm(planFor('lamp'), { action: 'retire', reason: 'Enough.' }))
    expect(metaOf('lamp').status).toBe('retired')
    expect(stateOf().retirements).toHaveLength(2)
  })

  it('needs a reason to put one away', async () => {
    putWork('lamp')
    const result = await landOn(fakeLlm(planFor('lamp'), { action: 'retire', reason: '   ' }))
    expect(metaOf('lamp').status).toBe('shelf')
    expect(result.notes.join(' ')).toMatch(/reason/i)
  })

  it('brings a retired work back to the shelf, with no limit, and drops the reason', async () => {
    putWork('lamp', { status: 'retired', retireReason: 'old news' })
    seedState({ retirements: [minutesAfter(-60), minutesAfter(-120)] })
    const result = await landOn(fakeLlm(planFor('lamp'), { action: 'restore', reason: 'I miss it.' }))
    const meta = metaOf('lamp')
    expect(meta.status).toBe('shelf')
    expect(meta.retireReason).toBeUndefined()
    expect(streamText()).toMatch(/brought back[^a-z]+Humming lamp/i)
    expect(result.summary).toMatch(/brought back/)
  })

  it('offers restore, not retire, for a work that is put away', async () => {
    putWork('lamp', { status: 'retired', retireReason: 'old news' })
    const fake = fakeLlm(planFor('lamp'), { action: 'restore', reason: 'x' })
    await landOn(fake)
    const ask = fake.calls.find((c) => c.kind === 'rework')!.user
    expect(ask).toMatch(/restore|bring it back/i)
    expect(ask).not.toMatch(/\bretire\b/i)
  })

  it('does nothing with an answer that does not fit the work: restoring a shelved one, retiring a retired one', async () => {
    putWork('lamp')
    const a = await landOn(fakeLlm(planFor('lamp'), { action: 'restore', reason: 'x' }))
    expect(metaOf('lamp').status).toBe('shelf')
    expect(a.notes.join(' ')).toMatch(/cannot|not on|nothing to/i)
  })

  it('rests on a scrap, without asking: it cannot be remixed, put away or restored', async () => {
    putWork('lamp', { status: 'scrap', scrapReason: 'blank page' })
    const fake = fakeLlm(planFor('lamp'), { action: 'retire', reason: 'x' })
    const result = await landOn(fake)
    expect(fake.calls.filter((c) => c.kind === 'rework')).toHaveLength(0)
    expect(result.notes.join(' ')).toMatch(/scrap bin/)
  })

  it('leaves everything as it was when the model refuses to answer', async () => {
    putWork('lamp')
    const result = await landOn(fakeLlm(planFor('lamp'), null))
    expect(metaOf('lamp').status).toBe('shelf')
    expect(result.notes.join(' ')).toMatch(/refus/i)
  })
})

describe('remixing (spec 7.5)', () => {
  it('makes a new sketch from the old page, and says it is a remix of it; the old work is untouched', async () => {
    putWork('lamp')
    const fake = fakeLlm(planFor('lamp'), { action: 'remix', reason: 'There is more to say.' })
    await landOn(fake, checker())
    const call = fake.calls.find((c) => c.kind === 'sketch')!
    expect(call.user).toContain('<data source="remix">')
    expect(call.user).toContain('OLD-LAMP-MARKER')
    const newId = readdirSync(file('works')).find((id) => id !== 'lamp')!
    expect(metaOf(newId)).toMatchObject({ remixOf: 'lamp', size: 'sketch', status: 'shelf' })
    expect(metaOf('lamp').status).toBe('shelf')
    expect(readFileSync(file('works/lamp/index.html'), 'utf8')).toBe(OLD_HTML)
  })

  it('rests, with a note, when there is no browser to check the new sketch', async () => {
    putWork('lamp')
    const result = await landOn(fakeLlm(planFor('lamp'), { action: 'remix', reason: 'More to say.' }))
    expect(readdirSync(file('works'))).toEqual(['lamp'])
    expect(result.notes.join(' ')).toMatch(/no browser/i)
  })

  it('asks the worker for a full remix, naming the work, and the request carries remixOf', async () => {
    putWork('lamp')
    seedState({ allowance: { points: 450, day: '2026-11-03' } })
    await landOn(fakeLlm(planFor('lamp', 'full'), { action: 'remix', reason: 'More to say.' }))
    const jobs = readdirSync(file('mind/builds')).filter((f) => !f.endsWith('.result.json'))
    expect(jobs).toHaveLength(1)
    const job = TinkerJob.parse(JSON.parse(readFileSync(file(`mind/builds/${jobs[0]}`), 'utf8')))
    expect(job.remixOf).toBe('lamp')
    expect(job.idea).toMatch(/Humming lamp/)
  })

  it('does not ask the worker when the answer is to put it away', async () => {
    putWork('lamp')
    seedState({ allowance: { points: 450, day: '2026-11-03' } })
    await landOn(fakeLlm(planFor('lamp', 'full'), { action: 'retire', reason: 'Enough.' }))
    expect(existsSync(file('mind/builds'))).toBe(false)
    expect(metaOf('lamp').status).toBe('retired')
  })
})
