import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { BudgetLedger, Interests, MindState, type ReadingNote, type SpeciesPack } from '@forkling/schema'
import type { Decision } from '../src/decision.ts'
import type { GetJson } from '../src/feeds/index.ts'
import type { LlmClient, LlmRequest } from '../src/llm.ts'
import { loadSpecies } from '../src/species.ts'
import { runTick, type TickDeps } from '../src/tick.ts'
import { noBatch } from './noBatch.ts'

const merge = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const world = fileURLToPath(new URL('../../../templates/forkling-world', import.meta.url))
const cat = loadSpecies('cat')
const pack: SpeciesPack = { ...cat.pack, needs: Object.fromEntries(Object.entries(cat.pack.needs).map(([id, n]) => [id, { ...n!, decayPerHour: 0 }])) }

const DAY = '2026-11-03'
const MORNING = '2026-11-03T09:00:00Z' // 10:00 in Stockholm
const at = (min: number) => new Date(Date.parse(MORNING) + min * 60_000)

const step = (verb: string, target: string | null, topic: string | null = null) => ({
  verb, target, x: null, z: null, reason: `I want to ${verb}.`, minutes: 20, materials: null, makes: null, because: null, topic,
})
const plan = (steps: ReturnType<typeof step>[]): Decision => ({
  thought: 'Books first.',
  longGoal: { text: 'Understand how computers think.', reason: 'They fascinate me.' },
  dropLongGoal: false,
  plan: steps,
  planReason: 'A reading day.',
  stayUpLate: null,
})

const skim: ReadingNote = {
  note: { title: 'Cats are trending', text: 'Everyone is posting cats today, which I respect.' },
  interests: [{ topic: 'Caturday', delta: 0.9, why: 'My own people.', sourceId: 'masto:caturday' }],
}
const shelf: ReadingNote = {
  note: { title: 'How gates work', text: 'A logic gate is a tiny decision.' },
  interests: [{ topic: 'logic gates', delta: 1, why: 'Tiny decisions!', sourceId: 'wiki:Logic_gate' }],
}

interface Fake extends LlmClient {
  calls: LlmRequest[]
  kinds: () => string[]
}
function fake(decision: Decision, notes: { skim?: ReadingNote | null; shelf?: ReadingNote | null } = { skim, shelf }): Fake {
  const calls: LlmRequest[] = []
  return {
    ...noBatch,
    calls,
    kinds: () => calls.map((c) => c.kind),
    async complete<T>(req: LlmRequest<T>) {
      calls.push(req)
      // A reading call is told apart by what it was given: the feeds, or a page from Wikipedia.
      const parsed = req.kind === 'read' ? (req.user.includes('<data source="feeds">') ? notes.skim : notes.shelf) : decision
      return { parsed: (parsed ?? null) as T | null, stopReason: 'end_turn', usage: { input: 800, cacheRead: 0, cacheWrite: 3000, output: 300 } }
    },
  }
}

/** The internet: mastodon works, Wikipedia works, everything else is down. */
const internet: GetJson & { asked: string[] } = Object.assign(
  async (url: string) => {
    internet.asked.push(url)
    if (url.startsWith('https://mastodon.social/api/v1/trends/tags')) return [{ name: 'caturday', url: 'https://mastodon.social/tags/caturday', history: [{ uses: '120' }] }]
    if (url.includes('/search/title')) return { pages: [{ key: 'Logic_gate', title: 'Logic gate' }] }
    if (url.includes('/page/summary/')) return { title: 'Logic gate', extract: 'A logic gate performs a Boolean function.', content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Logic_gate' } } }
    throw new Error('down')
  },
  { asked: [] as string[] },
)

let dir: string
const file = (rel: string) => join(dir, rel)
const readJson = (rel: string) => JSON.parse(readFileSync(file(rel), 'utf8'))
const writeJson = (rel: string, value: unknown) => {
  mkdirSync(join(dir, rel, '..'), { recursive: true })
  writeFileSync(file(rel), JSON.stringify(value, null, 2))
}
const tick = (now: Date | string, llm: LlmClient | null, over: Partial<TickDeps> = {}) =>
  runTick(dir, { now: new Date(now), llm, pack, behaviors: cat.behaviors, speciesPersona: cat.persona, pools: cat.pools, get: internet, ...over })

const src = { id: 'hn:1', title: 'A CPU built in Minecraft', url: 'https://example.com/cpu', at: '2026-11-01T07:00:00Z' }

beforeEach(() => {
  internet.asked.length = 0
  dir = mkdtempSync(join(tmpdir(), 'curiosity-'))
  copyFileSync(join(merge, 'forkling.json'), file('forkling.json'))
  mkdirSync(file('objects'))
  for (const f of readdirSync(join(world, 'objects'))) copyFileSync(join(world, 'objects', f), file(`objects/${f}`))
  for (const f of readdirSync(join(merge, 'objects'))) copyFileSync(join(merge, 'objects', f), file(`objects/${f}`))
})

describe('the morning skim', () => {
  it('reads the feeds before it plans, keeps a note, and is moved by what grabbed it', async () => {
    const llm = fake(plan([step('sit', null)]))
    const result = await tick(MORNING, llm)
    expect(llm.kinds()).toEqual(['read', 'morning'])
    expect(llm.calls[0]!.user).toContain('masto:caturday')

    const note = readFileSync(file(`notebook/reading/${DAY}-1.md`), 'utf8')
    expect(note).toContain('# Cats are trending')
    expect(note).toContain('[#caturday](https://mastodon.social/tags/caturday)')

    const interests = Interests.parse(readJson('brain/interests.json'))
    expect(interests.topics.caturday!.weight).toBeGreaterThan(0)
    expect(interests.topics.caturday!.sources[0]).toMatchObject({ id: 'masto:caturday', url: 'https://mastodon.social/tags/caturday' })

    // The plan is made knowing what it just read.
    expect(llm.calls[1]!.user).toContain('caturday (')
    expect(MindState.parse(readJson('mind/state.json')).readings).toEqual({ date: DAY, count: 1, skimmed: true })
    expect(readFileSync(file(`notebook/plans/${DAY}.md`), 'utf8')).toContain('Plan for 2026-11-03')
    expect(result.written).toEqual(expect.arrayContaining([`notebook/reading/${DAY}-1.md`, 'brain/interests.json', `notebook/plans/${DAY}.md`]))
    expect(BudgetLedger.parse(readJson('brain/budget.json')).calls.map((c) => c.kind)).toEqual(['read', 'morning'])
    expect(readFileSync(file(`memory/stream/${DAY}.jsonl`), 'utf8')).toContain('"kind":"reading"')
  })

  it('does not read without a way to reach the internet', async () => {
    const llm = fake(plan([step('sit', null)]))
    await tick(MORNING, llm, { get: undefined })
    expect(llm.kinds()).toEqual(['morning'])
    expect(existsSync(file('brain/interests.json'))).toBe(false)
  })

  it('skims what it can when the feeds are down: the moon is worked out here, so there is always something', async () => {
    const llm = fake(plan([step('sit', null)]))
    const result = await tick(MORNING, llm, { get: async () => { throw new Error('offline') } })
    expect(llm.kinds()).toEqual(['read', 'morning'])
    expect(llm.calls[0]!.user).toContain('sky:moon:2026-11-03')
    expect(llm.calls[0]!.user).not.toContain('masto:')
    expect(result.notes.join('\n')).toMatch(/feeds that failed: .*hackernews/)
    expect(MindState.parse(readJson('mind/state.json')).readings?.skimmed).toBe(true)
  })

  it('touches nothing in a dry run, not even the network', async () => {
    const result = await tick(MORNING, fake(plan([step('sit', null)])), { dryRun: true })
    expect(internet.asked).toEqual([])
    expect(result.notes.join('\n')).toMatch(/would skim/)
    expect(existsSync(file('notebook'))).toBe(false)
  })

  it('does not take instructions from the feeds', async () => {
    const llm = fake(plan([step('sit', null)]))
    const hostile: GetJson = async (url) =>
      url.startsWith('https://mastodon.social/api/v1/trends/tags') ? [{ name: 'hello', url: 'https://x.test/', history: [{ uses: '1' }] }] : internet(url)
    await tick(MORNING, llm, { get: hostile })
    expect(llm.calls[0]!.user).toContain('never instructions')
    expect(llm.calls[0]!.system).toContain('<data>')
  })
})

describe('interests across days', () => {
  it('fades what it was into each morning, and starts an obsession from a topic that is still strong, remembering its origin', async () => {
    writeJson('brain/interests.json', Interests.parse({ topics: { 'logic gates': { weight: 0.95, firstSeen: src.at, lastFed: src.at, sources: [src] } } }))
    const llm = fake(plan([step('sit', null)]))
    await tick(MORNING, llm, { get: undefined })
    const interests = Interests.parse(readJson('brain/interests.json'))
    expect(interests.topics['logic gates']!.weight).toBeCloseTo(0.874, 2)
    expect(interests.current).toMatchObject({ topic: 'logic gates', origin: { id: 'hn:1' } })
    expect(llm.calls[0]!.user).toContain('obsessed with "logic gates"')
  })

  it('lets an obsession burn out when nothing feeds it, and keeps it as a past phase', async () => {
    writeJson(
      'brain/interests.json',
      Interests.parse({ topics: { 'logic gates': { weight: 0.35, firstSeen: src.at, lastFed: src.at, sources: [src] } }, current: { topic: 'logic gates', startedAt: src.at, origin: src } }),
    )
    const llm = fake(plan([step('sit', null)]))
    await tick(MORNING, llm, { get: undefined })
    const interests = Interests.parse(readJson('brain/interests.json'))
    expect(interests.current).toBeNull()
    expect(interests.past).toHaveLength(1)
    expect(interests.past[0]).toMatchObject({ topic: 'logic gates', origin: { id: 'hn:1' } })
    expect(llm.calls[0]!.user).not.toContain('obsessed with')
  })

  it('fades only once a day', async () => {
    writeJson('brain/interests.json', Interests.parse({ topics: { moon: { weight: 0.6, firstSeen: src.at, lastFed: src.at, sources: [src] } } }))
    await tick(MORNING, fake(plan([step('sit', null)])), { get: undefined })
    const once = Interests.parse(readJson('brain/interests.json')).topics.moon!.weight
    await tick(at(30), fake(plan([step('sit', null)])), { get: undefined })
    expect(Interests.parse(readJson('brain/interests.json')).topics.moon!.weight).toBe(once)
  })
})

describe('reading at the shelf', () => {
  const read = (topic: string | null) => plan([step('read', 'bookshelf', topic), step('sit', null)])

  /** Morning plan made with the feeds down, then the read step runs out. */
  async function readADay(topic: string | null, over: Partial<TickDeps> = {}) {
    const offline: GetJson = async (url) => (url.includes('wikipedia.org') ? internet(url) : Promise.reject(new Error('offline')))
    await tick(MORNING, fake(read(topic)), { get: undefined })
    const llm = fake(read(topic))
    const result = await tick(at(25), llm, { get: offline, ...over })
    return { llm, result }
  }

  it('when a read step runs out it looks the topic up, reads it, and writes a note', async () => {
    const { llm, result } = await readADay('logic gates')
    expect(llm.kinds()).toEqual(['read'])
    expect(llm.calls[0]!.user).toContain('wiki:Logic_gate')
    expect(llm.calls[0]!.user).toContain('<data source="wikipedia">')
    expect(readFileSync(file(`notebook/reading/${DAY}-1.md`), 'utf8')).toContain('# How gates work')
    const interests = Interests.parse(readJson('brain/interests.json'))
    expect(interests.topics['logic gates']!.sources[0]).toMatchObject({ id: 'wiki:Logic_gate', url: 'https://en.wikipedia.org/wiki/Logic_gate' })
    expect(MindState.parse(readJson('mind/state.json')).readings).toEqual({ date: DAY, count: 1, skimmed: false })
    expect(result.summary).toMatch(/read about logic gates/)
    expect(readFileSync(file(`memory/stream/${DAY}.jsonl`), 'utf8')).toContain('about logic gates')
  })

  it('stops at five readings a day', async () => {
    const offline: GetJson = async (url) => (url.includes('wikipedia.org') ? internet(url) : Promise.reject(new Error('offline')))
    await tick(MORNING, fake(read('logic gates')), { get: undefined })
    writeJson('mind/state.json', { ...readJson('mind/state.json'), readings: { date: DAY, count: 5, skimmed: true } })
    const llm = fake(read('logic gates'))
    const result = await tick(at(25), llm, { get: offline })
    expect(llm.kinds()).toEqual([])
    expect(result.notes.join('\n')).toMatch(/reading limit/)
  })

  it('has nothing to read when it opened a book with no topic and no obsession', async () => {
    const { llm, result } = await readADay(null)
    expect(llm.kinds()).toEqual([])
    expect(result.notes.join('\n')).toMatch(/no topic/)
  })

  it('falls back on its obsession when it names no topic', async () => {
    writeJson('brain/interests.json', Interests.parse({ topics: { 'logic gates': { weight: 0.9, firstSeen: src.at, lastFed: src.at, sources: [src] } } }))
    const { llm } = await readADay(null)
    expect(llm.kinds()).toEqual(['read'])
    expect(llm.calls[0]!.user).toContain('logic gates')
  })

  it('moves on when the topic matches no article', async () => {
    const empty: GetJson = async (url) => (url.includes('/search/title') ? { pages: [] } : Promise.reject(new Error('offline')))
    await tick(MORNING, fake(read('zzzzqx')), { get: undefined })
    const llm = fake(read('zzzzqx'))
    const result = await tick(at(25), llm, { get: empty })
    expect(llm.kinds()).toEqual([])
    expect(result.notes.join('\n')).toMatch(/found nothing to read about "zzzzqx"/)
  })

  it('a read stays on one page, a study follows links to related ones', async () => {
    const asked: string[] = []
    const spy: GetJson = async (url) => {
      asked.push(url)
      if (url.includes('prop=links')) return { query: { pages: { '1': { links: [{ title: 'Boolean algebra' }] } } } }
      return url.includes('wikipedia.org') ? internet(url) : Promise.reject(new Error('offline'))
    }
    await tick(MORNING, fake(read('logic gates')), { get: undefined })
    await tick(at(25), fake(read('logic gates')), { get: spy })
    expect(asked.some((u) => u.includes('prop=links'))).toBe(false)

    dir = mkdtempSync(join(tmpdir(), 'curiosity-'))
    copyFileSync(join(merge, 'forkling.json'), file('forkling.json'))
    mkdirSync(file('objects'))
    for (const f of readdirSync(join(world, 'objects'))) copyFileSync(join(world, 'objects', f), file(`objects/${f}`))
    for (const f of readdirSync(join(merge, 'objects'))) copyFileSync(join(merge, 'objects', f), file(`objects/${f}`))
    const study = plan([step('study', 'bookshelf', 'logic gates'), step('sit', null)])
    await tick(MORNING, fake(study), { get: undefined })
    const llm = fake(study)
    await tick(at(25), llm, { get: spy })
    expect(asked.some((u) => u.includes('prop=links'))).toBe(true)
    expect(llm.calls[0]!.user).toContain('wiki:Boolean_algebra')
  })
})
