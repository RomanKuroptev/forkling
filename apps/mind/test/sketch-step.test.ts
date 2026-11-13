import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Interests, MindState, Souvenir, WorkMeta } from '@forkling/schema'
import type { WorkCheckResult, WorkChecker } from '../src/builds/browser-check.ts'
import { hasPolicy } from '../src/builds/sandbox.ts'
import { drawConstraint } from '../src/prompts/constraints.ts'
import type { LlmClient, LlmRequest } from '../src/llm.ts'
import { loadSpecies } from '../src/species.ts'
import { runTick } from '../src/tick.ts'
import type { FetchImpl } from '../src/web/fetch.ts'
import { noBatch } from './noBatch.ts'

const templates = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const cat = loadSpecies('cat')
const NOW = '2026-11-03T09:00:00Z' // 10:00 in Stockholm, long after waking
const minutesAfter = (min: number) => new Date(Date.parse(NOW) + min * 60_000).toISOString()
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const step = (verb: string, target: string | null, minutes: number, reason: string, over: Record<string, unknown> = {}) => ({ verb, target, reason, minutes, wantId: null, deep: null, size: null, ...over })
const planWith = (sketch: Record<string, unknown> = {}) => ({
  thought: 'A small thing first.',
  longGoal: null,
  dropLongGoal: false,
  plan: [step('tinker', 'a lamp that hums', 60, 'I want to make a small thing.', { size: 'sketch', ...sketch }), step('write', 'home', 25, 'A plaque.'), step('rest', null, 30, 'Rest.')],
  planReason: 'A day of small things.',
  stayUpLate: null,
})
const keep = { thought: 'Nothing to change.', longGoal: null, dropLongGoal: false, plan: null, planReason: null, stayUpLate: null }

const HTML = `<!doctype html><html><head><meta charset="utf-8"><title>t</title></head><body><script src="../../lib/p5.min.js"></script><script>function setup(){createCanvas(480,360)} function draw(){background(20)}</script></body></html>`
const sketchOutput = (title = 'Humming lamp') => ({ meta: { title, kind: 'art', about: 'A lamp that hums in a small way.', interest: null, sources: [] }, html: HTML })

interface Fake {
  llm: LlmClient
  calls: LlmRequest[]
}
/** A model that plans like the morning, makes a sketch when asked for one, and otherwise keeps the plan. */
function fakeLlm(first: unknown, sketch: unknown = sketchOutput()): Fake {
  const calls: LlmRequest[] = []
  let planned = false
  const llm: LlmClient = {
    ...noBatch,
    async complete<T>(req: LlmRequest<T>) {
      calls.push(req)
      const usage = { input: 800, cacheRead: 0, cacheWrite: 0, output: 400 }
      if (req.kind === 'sketch' || req.kind === 'repair') return { parsed: (sketch as T | null) ?? null, stopReason: sketch ? 'end_turn' : 'refusal', usage }
      const parsed = planned ? keep : first
      planned = true
      return { parsed: parsed as T, stopReason: 'end_turn', usage }
    },
  }
  return { llm, calls }
}

const checkerOf = (result: Partial<WorkCheckResult>): WorkChecker & { pages: string[] } => {
  const pages: string[] = []
  return {
    pages,
    async check(html) {
      pages.push(html)
      return { ok: result.ok ?? true, reasons: result.reasons ?? [], thumb: result.ok === false ? null : (result.thumb ?? PNG), ...(result.unavailable ? { unavailable: true as const } : {}) }
    },
    available: async () => true,
    close: async () => undefined,
  }
}

let dir: string
const file = (rel: string) => join(dir, rel)
const stateOf = () => MindState.parse(JSON.parse(readFileSync(file('mind/state.json'), 'utf8')))
const streamText = () => readFileSync(file('memory/stream/2026-11-03.jsonl'), 'utf8')
const workIds = () => (existsSync(file('works')) ? readdirSync(file('works')) : [])

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sketch-'))
  copyFileSync(join(templates, 'forkling.json'), file('forkling.json'))
  mkdirSync(file('objects'))
  for (const f of readdirSync(join(templates, 'objects'))) copyFileSync(join(templates, 'objects', f), file(`objects/${f}`))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const deps = (llm: LlmClient | null, now: string, workCheck?: WorkChecker, web?: { fetchImpl: FetchImpl; sleep: () => Promise<void> }) => ({ now: new Date(now), llm, pack: cat.pack, behaviors: cat.behaviors, speciesPersona: cat.persona, ...(workCheck ? { workCheck } : {}), ...(web ? { web } : {}) })

/** The morning plan starts the sketch step; an hour later it lands and the sketch is made. */
async function sketchHour(fake: Fake, workCheck?: WorkChecker, web?: { fetchImpl: FetchImpl; sleep: () => Promise<void> }) {
  await runTick(dir, deps(fake.llm, NOW, workCheck, web))
  return runTick(dir, deps(fake.llm, minutesAfter(61), workCheck, web))
}

describe('a sketch step (spec 7.6, 2.4)', () => {
  it('makes the sketch when the step lands: Haiku, one call, checked, and written to works/ with its thumbnail', async () => {
    const fake = fakeLlm(planWith())
    const checker = checkerOf({})
    const result = await sketchHour(fake, checker)
    const calls = fake.calls.filter((c) => c.kind === 'sketch')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ model: 'claude-haiku-5-5', effort: 'medium' })
    expect(workIds()).toEqual(['humming-lamp'])
    const html = readFileSync(file('works/humming-lamp/index.html'), 'utf8')
    expect(hasPolicy(html)).toBe(true)
    expect(checker.pages).toEqual([html])
    const meta = WorkMeta.parse(JSON.parse(readFileSync(file('works/humming-lamp/meta.json'), 'utf8')))
    expect(meta).toMatchObject({ status: 'shelf', size: 'sketch', title: 'Humming lamp', libraries: ['p5'] })
    expect(readFileSync(file('works/humming-lamp/thumb.png')).equals(PNG)).toBe(true)
    expect(result.written).toEqual(expect.arrayContaining(['works/humming-lamp/index.html', 'works/humming-lamp/meta.json', 'works/humming-lamp/thumb.png']))
    expect(streamText()).toMatch(/sketch: Humming lamp/)
    expect(result.summary).toMatch(/sketched "Humming lamp"/)
  })

  it('counts it against the 3 a day, in the state a replan reads', async () => {
    await sketchHour(fakeLlm(planWith()), checkerOf({}))
    expect(stateOf().sketches).toEqual({ date: '2026-11-03', count: 1 })
  })

  it('is made by Sonnet when it is marked deep (spec 9.8)', async () => {
    const fake = fakeLlm(planWith({ deep: true }))
    await sketchHour(fake, checkerOf({}))
    expect(fake.calls.find((c) => c.kind === 'sketch')).toMatchObject({ model: 'claude-sonnet-5-5', effort: 'medium' })
  })

  it('offers the newest souvenirs and the top interests to the call', async () => {
    mkdirSync(file('souvenirs'), { recursive: true })
    const s = Souvenir.parse({ kind: 'quote', id: 's1', why: 'it stuck', content: 'the tide keeps its own time', source: { url: 'https://en.wikipedia.org/wiki/Tide', title: 'Tide', fetchedAt: NOW } })
    writeFileSync(file('souvenirs/2026-11-02-tide.json'), JSON.stringify(s))
    const fake = fakeLlm(planWith())
    await sketchHour(fake, checkerOf({}))
    expect(fake.calls.find((c) => c.kind === 'sketch')!.user).toContain('the tide keeps its own time')
  })

  it('gives it an id no work has', async () => {
    mkdirSync(file('works/humming-lamp'), { recursive: true })
    writeFileSync(file('works/humming-lamp/meta.json'), JSON.stringify(WorkMeta.parse({ id: 'humming-lamp', title: 'Humming lamp', kind: 'art', about: 'x', interest: null, made: NOW, status: 'shelf', size: 'full' })))
    await sketchHour(fakeLlm(planWith()), checkerOf({}))
    expect(workIds().sort()).toEqual(['humming-lamp', 'humming-lamp-2'])
  })
})

describe('a sketch that does not come out', () => {
  it('goes to the scrap bin with its reason when the check fails, with no repair call, and still counts', async () => {
    const fake = fakeLlm(planWith())
    const result = await sketchHour(fake, checkerOf({ ok: false, reasons: ['the screenshot is a single colour, so the page drew nothing to see'] }))
    expect(fake.calls.filter((c) => c.kind === 'repair')).toHaveLength(0)
    const meta = WorkMeta.parse(JSON.parse(readFileSync(file('works/humming-lamp/meta.json'), 'utf8')))
    expect(meta).toMatchObject({ status: 'scrap', size: 'sketch' })
    expect(meta.scrapReason).toMatch(/single colour/)
    expect(existsSync(file('works/humming-lamp/thumb.png'))).toBe(false)
    expect(existsSync(file('works/humming-lamp/index.html'))).toBe(true)
    expect(stateOf().sketches?.count).toBe(1)
    expect(streamText()).toMatch(/did not pass its check/)
    expect(result.summary).toMatch(/scrapped/)
  })

  it('rests with a note when there is no browser to check it (the Actions tick), and writes and counts nothing', async () => {
    const result = await sketchHour(fakeLlm(planWith()))
    expect(workIds()).toEqual([])
    expect(result.notes.join(' ')).toMatch(/no browser/i)
    expect(streamText()).toMatch(/could not check the sketch/i)
    expect(stateOf().sketches).toBeUndefined()
  })

  it('rests the same way when the checker says there is no browser, after the call was made', async () => {
    const result = await sketchHour(fakeLlm(planWith()), checkerOf({ ok: false, reasons: ['no browser is available to check the work'], unavailable: true }))
    expect(workIds()).toEqual([])
    expect(result.notes.join(' ')).toMatch(/no browser/i)
    expect(stateOf().sketches).toBeUndefined()
  })

  it('writes nothing and counts nothing when the model refuses, and says so', async () => {
    const result = await sketchHour(fakeLlm(planWith(), null), checkerOf({}))
    expect(workIds()).toEqual([])
    expect(result.notes.join(' ')).toMatch(/refus/i)
    expect(stateOf().sketches).toBeUndefined()
  })
})

describe('the plan sees how many sketches were made (spec 9.8: 3 a day)', () => {
  it('rejects a plan with a sketch once 3 are made today', async () => {
    mkdirSync(file('mind'), { recursive: true })
    writeFileSync(file('mind/state.json'), JSON.stringify({ sketches: { date: '2026-11-03', count: 3 } }))
    const result = await runTick(dir, deps(fakeLlm(planWith()).llm, NOW, checkerOf({})))
    expect(result.notes.join(' ')).toMatch(/at most 3 sketches a day/)
  })

  it('starts the count again on a new day', async () => {
    mkdirSync(file('mind'), { recursive: true })
    writeFileSync(file('mind/state.json'), JSON.stringify({ sketches: { date: '2026-11-02', count: 3 } }))
    const result = await runTick(dir, deps(fakeLlm(planWith()).llm, NOW, checkerOf({})))
    expect(result.notes.join(' ')).not.toMatch(/at most 3 sketches a day/)
  })
})

describe('the manuals offered to a sketch (spec 6.1: for tinker only; 12.4: untried things)', () => {
  const page = '<html><head><title>p5 reference</title></head><body><p>circle(x, y, d) draws a circle.</p></body></html>'
  const web = (answer: (url: string) => Response) => {
    const asked: string[] = []
    // The morning tick reads front pages through the same web; only the manuals are counted here.
    const manuals = () => asked.filter((u) => /p5js\.org|tonejs\.github\.io|threejs\.org|developer\.mozilla\.org/.test(u))
    return { manuals, web: { fetchImpl: (async (url: string) => (asked.push(url), answer(url))) as FetchImpl, sleep: async () => undefined } }
  }

  it('reads the manuals of the first two libraries it has never used, and shows them to the call as data', async () => {
    const w = web(() => new Response(page))
    const fake = fakeLlm(planWith())
    await sketchHour(fake, checkerOf({}), w.web)
    const user = fake.calls.find((c) => c.kind === 'sketch')!.user
    expect(user).toContain('<data source="manuals">')
    expect(user).toContain('circle(x, y, d) draws a circle.')
    expect(w.manuals()).toEqual(['https://p5js.org/reference/', 'https://tonejs.github.io/docs/'])
  })

  it('reads none when every library has been used, and still makes the sketch', async () => {
    mkdirSync(file('works/old'), { recursive: true })
    writeFileSync(file('works/old/meta.json'), JSON.stringify(WorkMeta.parse({ id: 'old', title: 'Old work', kind: 'art', about: 'x', interest: null, made: NOW, status: 'shelf', size: 'full', libraries: ['p5', 'tone', 'three'] })))
    const w = web(() => new Response(page))
    const fake = fakeLlm(planWith())
    await sketchHour(fake, checkerOf({}), w.web)
    expect(w.manuals()).toEqual([])
    expect(workIds()).toContain('humming-lamp')
  })

  it('goes without a manual that cannot be read, and still makes the sketch', async () => {
    const w = web(() => new Response('nope', { status: 500 }))
    const fake = fakeLlm(planWith())
    await sketchHour(fake, checkerOf({}), w.web)
    expect(fake.calls.find((c) => c.kind === 'sketch')!.user).not.toContain('<data source="manuals">')
    expect(workIds()).toEqual(['humming-lamp'])
  })

  it('reads no manual when the tick has no way to reach the web', async () => {
    const fake = fakeLlm(planWith())
    await sketchHour(fake, checkerOf({}))
    expect(fake.calls.find((c) => c.kind === 'sketch')!.user).not.toContain('manuals')
  })
})

describe('the constraint and the collision (spec 12.4)', () => {
  const seed = () => (JSON.parse(readFileSync(file('forkling.json'), 'utf8')) as { seed: number }).seed
  const keep1 = (id: string, topic: string) => {
    mkdirSync(file('souvenirs'), { recursive: true })
    const s = Souvenir.parse({ kind: 'quote', id, why: 'it stuck', content: `words about ${id}`, topics: [topic], source: { url: 'https://en.wikipedia.org/wiki/Tide', title: id, fetchedAt: NOW } })
    writeFileSync(file(`souvenirs/2026-11-02-${id}.json`), JSON.stringify(s))
  }
  const interests = (...topics: string[]) => {
    mkdirSync(file('brain'), { recursive: true })
    writeFileSync(file('brain/interests.json'), JSON.stringify(Interests.parse({ version: 2, topics: Object.fromEntries(topics.map((t) => [t, { weight: 40, firstSeen: NOW, lastFed: NOW, sources: [] }])) })))
  }
  const sketchMeta = () => WorkMeta.parse(JSON.parse(readFileSync(file('works/humming-lamp/meta.json'), 'utf8')))

  it('offers the constraint drawn for that step, and keeps it with the work', async () => {
    const fake = fakeLlm(planWith())
    await sketchHour(fake, checkerOf({}))
    const expected = drawConstraint(seed(), 'sketch:2026-11-03:0')
    const prompt = fake.calls.find((c) => c.kind === 'sketch')!.user
    expect(prompt).toContain('## A constraint for this one')
    expect(prompt).toContain(expected)
    expect(sketchMeta().constraint).toEqual({ text: expected, refused: false, reason: null })
  })

  it('keeps a refusal, with the reason Merge gave', async () => {
    const fake = fakeLlm(planWith(), { ...sketchOutput(), constraintRefusal: 'It would not read at that size.' })
    await sketchHour(fake, checkerOf({}))
    expect(sketchMeta().constraint).toMatchObject({ refused: true, reason: 'It would not read at that size.' })
  })

  it('offers two souvenirs from interests that share no place, as data, and keeps their ids', async () => {
    interests('maps', 'tides')
    keep1('s1', 'maps')
    keep1('s2', 'tides')
    const fake = fakeLlm(planWith())
    await sketchHour(fake, checkerOf({}))
    const prompt = fake.calls.find((c) => c.kind === 'sketch')!.user
    expect(prompt).toContain('## Two things side by side')
    expect(prompt).toContain('words about s1')
    expect(prompt).toContain('words about s2')
    expect(sketchMeta().collision?.slice().sort()).toEqual(['s1', 's2'])
  })

  it('offers no collision when there is nothing to put together, and still offers the constraint', async () => {
    const fake = fakeLlm(planWith())
    await sketchHour(fake, checkerOf({}))
    expect(fake.calls.find((c) => c.kind === 'sketch')!.user).not.toContain('Two things side by side')
    expect(sketchMeta().collision).toBeNull()
  })
})
