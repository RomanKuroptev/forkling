import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BudgetLedger, FoundJob, JobResult, MindState, Place, PlaceRequest, formatRequest, parseRequest } from '@forkling/schema'
import { addWakingMs } from '@forkling/sim'
import type { LlmClient, LlmRequest } from '../src/llm.ts'
import { loadSpecies } from '../src/species.ts'
import { runTick } from '../src/tick.ts'
import { noBatch } from './noBatch.ts'

const merge = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const world = fileURLToPath(new URL('../../../templates/forkling-world', import.meta.url))
const cat = loadSpecies('cat')
const NOW = '2026-11-03T09:00:00Z' // 10:00 in Stockholm
const minutesAfter = (min: number) => new Date(Date.parse(NOW) + min * 60_000).toISOString()
const daysBefore = (days: number) => new Date(Date.parse(NOW) - days * 86_400_000).toISOString()
const HOUR = 3_600_000

const step = (verb: string, target: string | null, minutes: number, reason: string) => ({ verb, target, reason, minutes, wantId: null, deep: null, size: null })
const plan = { thought: 'A quiet day.', longGoal: null, dropLongGoal: false, plan: [step('write', 'home', 25, 'A plaque.'), step('rest', null, 30, 'Rest.'), step('write', 'home', 25, 'Another.')], planReason: 'A quiet day.', stayUpLate: null }
const keep = { thought: 'Nothing to change.', longGoal: null, dropLongGoal: false, plan: null, planReason: null, stayUpLate: null }

function fakeLlm() {
  const calls: LlmRequest[] = []
  let planned = false
  const llm: LlmClient = {
    ...noBatch,
    async complete<T>(req: LlmRequest<T>) {
      calls.push(req)
      const usage = { input: 800, cacheRead: 0, cacheWrite: 0, output: 200 }
      const parsed = planned ? keep : plan
      planned = true
      return { parsed: parsed as T, stopReason: 'end_turn', usage }
    },
  }
  return { llm, calls }
}

let dir: string
const file = (rel: string) => join(dir, rel)
const read = (rel: string) => JSON.parse(readFileSync(file(rel), 'utf8'))
const put = (rel: string, value: unknown) => {
  mkdirSync(join(dir, rel, '..'), { recursive: true })
  writeFileSync(file(rel), typeof value === 'string' ? value : JSON.stringify(value))
}
const stateOf = () => MindState.parse(read('mind/state.json'))
const streamText = () => readFileSync(file('memory/stream/2026-11-03.jsonl'), 'utf8')
const placeOf = (id: string) => Place.parse(read(`places/${id}.json`))
const requestOf = (id: string) => parseRequest(readFileSync(file(`requests/${id}.md`), 'utf8'))!
const requestFiles = () => (existsSync(file('requests')) ? readdirSync(file('requests')).filter((f) => f.endsWith('.md')).sort() : [])
const foundJobs = () => (existsSync(file('mind/builds')) ? readdirSync(file('mind/builds')).filter((f) => f.startsWith('found-') && !f.endsWith('.result.json')) : [])
const deps = (llm: LlmClient, now: string) => ({ now: new Date(now), llm, pack: cat.pack, behaviors: cat.behaviors, speciesPersona: cat.persona })

const putRequest = (over: Record<string, unknown> = {}) => {
  const r = PlaceRequest.parse({ id: 'lantern-hall', kind: 'place', name: 'Lantern Hall', purpose: 'Where I keep the lidar finds that hold up.', tags: ['maya lidar'], chunk: [1, 0], related: ['home'], souvenirs: [], written: daysBefore(8), status: 'open', statusAt: null, note: null, body: 'I want a place with one lamp over each find.', ...over })
  put(`requests/${r.id}.md`, formatRequest(r))
}
const builtPlace = (over: Record<string, unknown> = {}) =>
  Place.parse({
    id: 'lantern-hall',
    name: 'Lantern Hall',
    purpose: 'Where I keep the lidar finds that hold up.',
    tags: ['maya lidar'],
    founded: '2026-11-03',
    chunk: [1, 0],
    related: ['home'],
    exterior: { style: 'timber', footprint: [12, 10], floors: 1, palette: 'meadow', sign: 'LANTERN HALL' },
    rooms: [{ id: 'main', name: 'Main room', size: [10, 8, 3], at: [0, 0], floor: 0, parts: [{ part: 'shelf-low', at: [0, 0, 3], rot: 0 }, { part: 'lamp-floor', at: [3, 0, 3], rot: 0 }] }],
    exhibits: [],
    state: { construction: null, lastCareAt: null, neglect: 0, lamps: true },
    history: [{ at: '2026-11-03T09:30:00Z', verb: 'found', summary: 'Asked for by Merge, built by Merge from the kit.' }],
    ...over,
  })
const call = { at: '2026-11-03T10:00:00Z', kind: 'foundbuild', model: 'claude-sonnet-5-5', input: 15_000, cacheRead: 0, cacheWrite: 0, output: 4_000, usd: 0.07 }
const result = (over: Record<string, unknown> = {}) => JobResult.parse({ id: 'found-20261103-0900', kind: 'found', status: 'done', requestId: 'lantern-hall', place: builtPlace(), calls: [call], at: '2026-11-03T09:30:00Z', ...over })

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'fallback-'))
  copyFileSync(join(merge, 'forkling.json'), file('forkling.json'))
  mkdirSync(file('objects'))
  for (const f of readdirSync(join(merge, 'objects'))) copyFileSync(join(merge, 'objects', f), file(`objects/${f}`))
  mkdirSync(file('places'))
  copyFileSync(join(world, 'places/home.json'), file('places/home.json'))
  copyFileSync(join(world, 'places/workshop.json'), file('places/workshop.json'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('the fallback build is asked for when a request has had no answer (spec 10.3)', () => {
  it('writes a found job for an open place request 7 days after it was written, with no model call of its own', async () => {
    putRequest()
    const fake = fakeLlm()
    const out = await runTick(dir, deps(fake.llm, NOW))
    const files = foundJobs()
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/^found-20261103-\d{4}\.json$/)
    expect(FoundJob.parse(read(`mind/builds/${files[0]}`))).toMatchObject({ kind: 'found', requestId: 'lantern-hall' })
    expect(out.written).toContain(`mind/builds/${files[0]}`)
    expect(fake.calls.some((c) => (c.kind as string) === 'foundbuild')).toBe(false)
    expect(streamText()).toMatch(/Nobody answered my request for Lantern Hall/)
  })

  it('does not before the 7 days are up', async () => {
    putRequest({ written: daysBefore(6) })
    await runTick(dir, deps(fakeLlm().llm, NOW))
    expect(foundJobs()).toEqual([])
  })

  it('waits 14 more days while Roman says he is building it, and then asks', async () => {
    putRequest({ status: 'building', statusAt: daysBefore(15), written: daysBefore(20) })
    await runTick(dir, deps(fakeLlm().llm, NOW))
    expect(foundJobs()).toEqual([])
    rmSync(file('mind'), { recursive: true, force: true })
    putRequest({ status: 'building', statusAt: daysBefore(15), written: daysBefore(22) })
    await runTick(dir, deps(fakeLlm().llm, NOW))
    expect(foundJobs()).toHaveLength(1)
  })

  it('never for a request that was answered, declined or withdrawn, or for a gift', async () => {
    putRequest({ id: 'a-built', name: 'A Built', status: 'built', statusAt: daysBefore(3) })
    putRequest({ id: 'a-declined', name: 'A Declined', status: 'declined', statusAt: daysBefore(3), note: 'No.' })
    putRequest({ id: 'a-gift', name: 'A Gift', kind: 'gift', status: 'built', statusAt: daysBefore(3), chunk: [0, 1] })
    putRequest({ id: 'a-withdrawn', name: 'A Withdrawn', status: 'withdrawn', statusAt: daysBefore(3) })
    await runTick(dir, deps(fakeLlm().llm, NOW))
    expect(foundJobs()).toEqual([])
  })

  it('asks for one at a time, oldest first, and the next after the first is done', async () => {
    putRequest({ id: 'older', name: 'Older', written: daysBefore(10), chunk: [1, 0] })
    putRequest({ id: 'newer', name: 'Newer', written: daysBefore(8), chunk: [0, 1] })
    const fake = fakeLlm()
    await runTick(dir, deps(fake.llm, NOW))
    expect(foundJobs()).toHaveLength(1)
    expect(FoundJob.parse(read(`mind/builds/${foundJobs()[0]}`)).requestId).toBe('older')
    await runTick(dir, deps(fake.llm, minutesAfter(10)))
    expect(foundJobs()).toHaveLength(1)
  })

  it('waits while spending is ahead of the month\'s pace (spec 13)', async () => {
    putRequest()
    put('brain/budget.json', { month: '2026-11', capUsd: 10, spentUsd: 5 })
    await runTick(dir, deps(fakeLlm().llm, NOW))
    expect(foundJobs()).toEqual([])
  })

  it('asks only while Merge is awake', async () => {
    putRequest({ written: '2026-10-20T10:00:00Z' })
    await runTick(dir, deps(fakeLlm().llm, '2026-11-03T01:00:00Z')) // 02:00 in Stockholm
    expect(foundJobs()).toEqual([])
  })

  it('tries at most 3 times, a day apart, and then stops', async () => {
    putRequest()
    const fake = fakeLlm()
    const failed = (n: number) => put(`mind/builds/${foundJobs().sort().at(-1)!.replace('.json', '')}.result.json`, JobResult.parse({ id: foundJobs().sort().at(-1)!.replace('.json', ''), kind: 'found', status: 'failed', reason: 'the model refused', requestId: 'lantern-hall', calls: [], at: minutesAfter(n * 1440 + 5) }))
    await runTick(dir, deps(fake.llm, NOW))
    failed(0)
    await runTick(dir, deps(fake.llm, minutesAfter(600)))
    expect(foundJobs()).toHaveLength(1) // 10 hours later: not yet
    await runTick(dir, deps(fake.llm, minutesAfter(1440 + 5)))
    expect(foundJobs()).toHaveLength(2)
    failed(1)
    await runTick(dir, deps(fake.llm, minutesAfter(2 * 1440 + 10)))
    expect(foundJobs()).toHaveLength(3)
    failed(2)
    await runTick(dir, deps(fake.llm, minutesAfter(3 * 1440 + 20)))
    await runTick(dir, deps(fake.llm, minutesAfter(5 * 1440)))
    expect(foundJobs()).toHaveLength(3)
  })
})

describe('what the builders send back is checked again and written by the loop (spec 10.2, 10.3)', () => {
  const settle = async (r: JobResult, at = minutesAfter(70)) => {
    const fake = fakeLlm()
    await runTick(dir, deps(fake.llm, NOW))
    put(`mind/builds/${r.id}.result.json`, r)
    const out = await runTick(dir, deps(fake.llm, at))
    return { fake, out }
  }

  it('writes the place with 6 hours of waking time of construction, makes the request self-built, and says who had the idea and who built it', async () => {
    putRequest()
    const at = minutesAfter(70)
    const { out } = await settle(result(), at)
    const place = placeOf('lantern-hall')
    const f = read('forkling.json')
    expect(place.state.construction).toEqual({ kind: 'found', finishesAt: new Date(addWakingMs(Date.parse(at), 6 * HOUR, { seed: f.seed, timezone: f.timezone })).toISOString() })
    expect(place.history.at(-1)).toMatchObject({ verb: 'found', summary: 'Asked for by Merge, built by Merge from the kit.' })
    expect(place.history).toHaveLength(1)
    expect(requestOf('lantern-hall')).toMatchObject({ status: 'self-built' })
    expect(requestOf('lantern-hall').statusAt).toBe(at)
    expect(out.written).toEqual(expect.arrayContaining(['places/lantern-hall.json', 'requests/lantern-hall.md']))
    expect(stateOf().placesSeen).toContain('lantern-hall')
    expect(stateOf().requestSeen).toMatchObject({ 'lantern-hall': 'self-built' })
  })

  it('books what the builders spent, once, and tells the next decide call', async () => {
    putRequest()
    const { fake } = await settle(result())
    expect(BudgetLedger.parse(read('brain/budget.json')).byKind.foundbuild).toMatchObject({ calls: 1 })
    expect(streamText()).toMatch(/Lantern Hall/)
    expect(fake.calls.filter((c) => c.kind === 'decide').length).toBeGreaterThan(0)
  })

  it('is not taken for a gift or a place Roman built on the next tick, and is written once', async () => {
    putRequest()
    const { fake } = await settle(result())
    await runTick(dir, deps(fake.llm, minutesAfter(100)))
    expect(requestFiles()).toEqual(['lantern-hall.md'])
    expect(placeOf('lantern-hall').history).toHaveLength(1)
    expect(requestOf('lantern-hall').status).toBe('self-built')
  })

  it('drops the place when another one has landed on the chunk meanwhile (which answers the request), writes nothing of its own, and still books the cost', async () => {
    putRequest()
    const taken = JSON.parse(readFileSync(join(world, 'places/home.json'), 'utf8'))
    const fake = fakeLlm()
    await runTick(dir, deps(fake.llm, NOW))
    put('places/rival.json', { ...taken, id: 'rival', name: 'Rival', chunk: [1, 0], offset: [0, 0], tags: ['rival'] })
    put('mind/builds/found-20261103-0900.result.json', result())
    await runTick(dir, deps(fake.llm, minutesAfter(70)))
    expect(existsSync(file('places/lantern-hall.json'))).toBe(false)
    expect(requestOf('lantern-hall').status).toBe('built')
    expect(streamText()).toMatch(/could not be built/i)
    expect(BudgetLedger.parse(read('brain/budget.json')).byKind.foundbuild).toMatchObject({ calls: 1 })
  })

  it('drops the place when Roman answered the request meanwhile', async () => {
    putRequest()
    const fake = fakeLlm()
    await runTick(dir, deps(fake.llm, NOW))
    putRequest({ status: 'declined', statusAt: minutesAfter(30), note: 'Not this time.' })
    put('mind/builds/found-20261103-0900.result.json', result())
    await runTick(dir, deps(fake.llm, minutesAfter(70)))
    expect(existsSync(file('places/lantern-hall.json'))).toBe(false)
    expect(requestOf('lantern-hall').status).toBe('declined')
  })

  it('drops a place that breaks a limit of 5.2 or has more than 2 rooms or 30 parts, even from the worker', async () => {
    putRequest()
    const room = (id: string, x: number) => ({ id, name: id, size: [3, 3, 3], at: [x, 0], floor: 0, parts: [] })
    const three = builtPlace({ rooms: [room('a', -4), room('b', 0), room('c', 4)] })
    await settle(result({ place: three }))
    expect(existsSync(file('places/lantern-hall.json'))).toBe(false)
    expect(requestOf('lantern-hall').status).toBe('open')
  })

  it('takes in a failed job without touching anything, and books its cost', async () => {
    putRequest()
    const { out } = await settle(JobResult.parse({ id: 'found-20261103-0900', kind: 'found', status: 'failed', reason: 'the model refused', requestId: 'lantern-hall', calls: [call], at: '2026-11-03T09:30:00Z' }))
    expect(existsSync(file('places/lantern-hall.json'))).toBe(false)
    expect(out.written).not.toContain('places/lantern-hall.json')
    expect(requestOf('lantern-hall').status).toBe('open')
    expect(streamText()).toMatch(/could not make a plain version of Lantern Hall/)
    expect(BudgetLedger.parse(read('brain/budget.json')).byKind.foundbuild).toMatchObject({ calls: 1 })
  })

  it('lets a request that was self-built open the way for the next found: it no longer counts as open', async () => {
    putRequest()
    await settle(result())
    expect(requestOf('lantern-hall').status).toBe('self-built')
    expect(stateOf().jobs?.pending ?? []).toEqual([])
  })
})
