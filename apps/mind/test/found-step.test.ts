import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Interests, MindState, PlaceRequest, Souvenir, Wish, formatRequest, parseRequest } from '@forkling/schema'
import type { LlmClient, LlmRequest } from '../src/llm.ts'
import { drawConstraint } from '../src/prompts/constraints.ts'
import { loadSpecies } from '../src/species.ts'
import { runTick } from '../src/tick.ts'
import { noBatch } from './noBatch.ts'

const merge = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const world = fileURLToPath(new URL('../../../templates/forkling-world', import.meta.url))
const cat = loadSpecies('cat')
const NOW = '2026-11-03T09:00:00Z' // 10:00 in Stockholm
const minutesAfter = (min: number) => new Date(Date.parse(NOW) + min * 60_000).toISOString()

const step = (verb: string, target: string | null, minutes: number, reason: string, over: Record<string, unknown> = {}) => ({ verb, target, reason, minutes, wantId: null, deep: null, size: null, ...over })
const planFor = (first: ReturnType<typeof step>) => ({
  thought: 'The lidar finds deserve a place of their own.',
  longGoal: null,
  dropLongGoal: false,
  plan: [first, step('write', 'home', 25, 'A plaque.'), step('rest', null, 30, 'Rest.')],
  planReason: 'A day of asking.',
  stayUpLate: null,
})
const foundStep = (over: Record<string, unknown> = {}) => step('found', 'Lantern Hall', 30, 'The lidar finds keep pulling at me and no place holds them.', over)
const keep = { thought: 'Nothing to change.', longGoal: null, dropLongGoal: false, plan: null, planReason: null, stayUpLate: null }

const goodAnswer = (over: Record<string, unknown> = {}) => ({
  purpose: 'Where I keep the lidar finds that hold up under their own weight.',
  tags: ['digital elevation model'],
  related: ['home'],
  souvenirs: ['s1', 's2'],
  body: 'I keep coming back to the finds that survive being doubted. I want a place with one lamp over each of them.',
  wishes: [{ name: 'Lamp rail', description: 'A rail of small lamps along a wall.', forPlace: null }],
  constraintRefusal: null,
  ...over,
})

function fakeLlm(plan: unknown, found: unknown = goodAnswer(), repeat = false) {
  const calls: LlmRequest[] = []
  let planned = false
  const llm: LlmClient = {
    ...noBatch,
    async complete<T>(req: LlmRequest<T>) {
      calls.push(req)
      const usage = { input: 800, cacheRead: 0, cacheWrite: 0, output: 300 }
      if (req.kind === ('found' as never)) return { parsed: (found as T | null) ?? null, stopReason: found ? 'end_turn' : 'refusal', usage }
      const parsed = planned && !repeat ? keep : plan
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
const requestFiles = () => (existsSync(file('requests')) ? readdirSync(file('requests')).filter((f) => f.endsWith('.md')) : [])
const requestOf = (id: string) => parseRequest(readFileSync(file(`requests/${id}.md`), 'utf8'))!
const deps = (llm: LlmClient, now: string) => ({ now: new Date(now), llm, pack: cat.pack, behaviors: cat.behaviors, speciesPersona: cat.persona })
async function landOn(fake: ReturnType<typeof fakeLlm>) {
  await runTick(dir, deps(fake.llm, NOW))
  return runTick(dir, deps(fake.llm, minutesAfter(31)))
}
const openRequest = (id: string, chunk: [number, number], status = 'open') =>
  put(`requests/${id}.md`, formatRequest(PlaceRequest.parse({ id, kind: 'place', name: id.replace(/-/g, ' '), purpose: 'x', tags: ['other'], chunk, related: [], souvenirs: [], written: '2026-11-02T10:00:00Z', status, statusAt: status === 'open' ? null : '2026-11-02T12:00:00Z', note: status === 'declined' ? 'not now' : null, body: 'A request.' })))
const days = (...topics: [string, number][][]) => topics.map((t, i) => ({ date: `2026-11-0${i + 1}`, topics: Object.fromEntries(t) }))

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'found-step-'))
  copyFileSync(join(merge, 'forkling.json'), file('forkling.json'))
  mkdirSync(file('objects'))
  for (const f of readdirSync(join(merge, 'objects'))) copyFileSync(join(merge, 'objects', f), file(`objects/${f}`))
  mkdirSync(file('places'))
  copyFileSync(join(world, 'places/home.json'), file('places/home.json'))
  copyFileSync(join(world, 'places/workshop.json'), file('places/workshop.json'))
  // 'maya lidar' held at 40 or more on the two mornings before, and fades to about 74 by this one.
  put('brain/interests.json', Interests.parse({ version: 2, topics: { 'maya lidar': { weight: 80, firstSeen: '2026-10-30T10:00:00Z', lastFed: '2026-11-02T10:00:00Z', sources: [] }, 'digital elevation model': { weight: 30, firstSeen: '2026-11-01T10:00:00Z', lastFed: '2026-11-02T10:00:00Z', sources: [] } } }))
  put('mind/state.json', MindState.parse({ wakeTop: days([['maya lidar', 80]], [['maya lidar', 78]]) }))
  for (const n of [1, 2]) put(`souvenirs/2026-11-02-s${n}.json`, Souvenir.parse({ kind: 'quote', id: `s${n}`, why: 'it stuck', content: `lidar words ${n}`, topics: ['maya lidar'], source: { url: 'https://en.wikipedia.org/wiki/Lidar', title: `S${n}`, fetchedAt: '2026-11-02T10:00:00Z' } }))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('the plan offers a found only when spec 2.5 allows it (Roman, 14 November: 40 on 3 mornings in a row)', () => {
  it('tells Merge which interest has earned a place, so it knows what to ask for', async () => {
    const fake = fakeLlm(planFor(foundStep()))
    await runTick(dir, deps(fake.llm, NOW))
    expect(fake.calls[0]!.user).toMatch(/<foundable>[\s\S]*maya lidar[\s\S]*<\/foundable>/)
  })

  it('takes a found when an interest has held on 3 mornings and no place carries it', async () => {
    await runTick(dir, deps(fakeLlm(planFor(foundStep())).llm, NOW))
    expect(read('mind/goals.json').today.steps[0]).toMatchObject({ verb: 'found', targetId: 'Lantern Hall' })
  })

  it('turns it down when the interest was missing on one of the mornings', async () => {
    put('mind/state.json', MindState.parse({ wakeTop: days([['maya lidar', 80]], []) }))
    await runTick(dir, deps(fakeLlm(planFor(foundStep()), goodAnswer(), true).llm, NOW))
    expect(stateOf().rejections.at(-1)!.reasons.join(' ')).toMatch(/no interest has earned a new place/)
  })

  it('turns it down when a place already carries the interest as a tag, and does not list it', async () => {
    put('places/home.json', { ...read('places/home.json'), tags: ['maya lidar'] })
    const fake = fakeLlm(planFor(foundStep()), goodAnswer(), true)
    await runTick(dir, deps(fake.llm, NOW))
    expect(stateOf().rejections.at(-1)!.reasons.join(' ')).toMatch(/no interest has earned a new place/)
    expect(fake.calls[0]!.user).not.toContain('<foundable>')
  })

  it('turns it down with 2 place requests open, and a built one does not count', async () => {
    openRequest('first-one', [1, 0])
    openRequest('second-one', [0, 1], 'building')
    await runTick(dir, deps(fakeLlm(planFor(foundStep()), goodAnswer(), true).llm, NOW))
    expect(stateOf().rejections.at(-1)!.reasons.join(' ')).toMatch(/two requests are already open|no interest has earned/)
    rmSync(file('mind/state.json'))
    put('mind/state.json', MindState.parse({ wakeTop: days([['maya lidar', 80]], [['maya lidar', 78]]) }))
    rmSync(file('requests'), { recursive: true })
    openRequest('first-one', [1, 0], 'built')
    openRequest('second-one', [0, 1], 'declined')
    await runTick(dir, deps(fakeLlm(planFor(foundStep())).llm, NOW))
    expect(read('mind/goals.json').today.steps[0]).toMatchObject({ verb: 'found' })
  })

  it('turns it down when one was written in the last 7 days (1 a week)', async () => {
    put('mind/state.json', MindState.parse({ wakeTop: days([['maya lidar', 80]], [['maya lidar', 78]]), founds: ['2026-11-01T10:00:00Z'] }))
    await runTick(dir, deps(fakeLlm(planFor(foundStep()), goodAnswer(), true).llm, NOW))
    expect(stateOf().rejections.at(-1)!.reasons.join(' ')).toMatch(/1 a week/)
  })

  it('lists the requests that are open, so Merge does not ask twice', async () => {
    openRequest('first-one', [1, 0])
    const fake = fakeLlm(planFor(step('rest', null, 30, 'Rest.')))
    await runTick(dir, deps(fake.llm, NOW))
    expect(fake.calls[0]!.user).toMatch(/<requests>[\s\S]*first one[\s\S]*open[\s\S]*<\/requests>/)
  })
})

describe('a found step writes a request (spec 2.4, 10.3)', () => {
  it('makes one Haiku call, and writes requests/<id>.md: open, in its own words, with the interest first among the tags', async () => {
    const fake = fakeLlm(planFor(foundStep()))
    const out = await landOn(fake)
    const calls = fake.calls.filter((c) => c.kind === ('found' as never))
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ model: 'claude-haiku-5-5', effort: 'medium' })
    expect(requestFiles()).toEqual(['lantern-hall.md'])
    const r = requestOf('lantern-hall')
    expect(r).toMatchObject({ kind: 'place', name: 'Lantern Hall', status: 'open', statusAt: null, note: null, related: ['home'], souvenirs: ['s1', 's2'] })
    expect(r.tags).toEqual(['maya lidar', 'digital elevation model'])
    expect(r.body).toMatch(/one lamp over each/)
    expect(out.written).toContain('requests/lantern-hall.md')
  })

  it('stakes a chunk the rule of 4.2 allows: empty, next to a place, and not one another request has staked', async () => {
    openRequest('staked-one', [1, 0])
    await landOn(fakeLlm(planFor(foundStep())))
    const [x, z] = requestOf('lantern-hall').chunk
    const taken = new Set(['0,0', '1,0'])
    expect(taken.has(`${x},${z}`)).toBe(false)
    expect([[0, 1], [0, -1], [-1, 0], [2, 0], [1, 1], [1, -1]].map((c) => c.join(','))).toContain(`${x},${z}`)
  })

  it('records the found for the week, writes the wishes, and says so in the stream', async () => {
    await landOn(fakeLlm(planFor(foundStep())))
    expect(stateOf().founds).toHaveLength(1)
    expect(Wish.parse(read('wishes/lamp-rail.json'))).toMatchObject({ count: 1, status: 'open' })
    expect(streamText()).toMatch(/Asked Roman for a place: Lantern Hall/)
  })

  it('offers the constraint drawn for this step, and says so in the stream when Merge refuses it', async () => {
    const fake = fakeLlm(planFor(foundStep()), goodAnswer({ constraintRefusal: 'It would make the request unreadable.' }))
    await landOn(fake)
    const seed = read('forkling.json').seed
    const prompt = fake.calls.find((c) => c.kind === ('found' as never))!.user
    expect(prompt).toContain(drawConstraint(seed, 'found:2026-11-03:0'))
    expect(streamText()).toMatch(/refused the constraint[^U]*[^]*It would make the request unreadable\./)
  })

  it('is made by Sonnet when the step is marked deep (spec 9.8)', async () => {
    const fake = fakeLlm(planFor(foundStep({ deep: true })))
    await landOn(fake)
    expect(fake.calls.find((c) => c.kind === ('found' as never))).toMatchObject({ model: 'claude-sonnet-5-5' })
  })

  it('shows the souvenirs on the interest to the call as data, and not the places it has as instructions', async () => {
    const fake = fakeLlm(planFor(foundStep()))
    await landOn(fake)
    const prompt = fake.calls.find((c) => c.kind === ('found' as never))!.user
    expect(prompt).toMatch(/<data source="souvenirs">[\s\S]*lidar words 1[\s\S]*<\/data>/)
    expect(prompt).toContain('home | Home')
  })

  it('writes nothing, and does not count it, when the answer breaks a rule (a body over 200 words, words that claim to be human, a web address)', async () => {
    for (const bad of [{ body: Array(201).fill('word').join(' ') }, { body: 'I am a human and I want a house.' }, { body: 'Look at https://example.org now.' }]) {
      rmSync(file('requests'), { recursive: true, force: true })
      put('mind/state.json', MindState.parse({ wakeTop: days([['maya lidar', 80]], [['maya lidar', 78]]) }))
      rmSync(file('memory'), { recursive: true, force: true })
      await landOn(fakeLlm(planFor(foundStep()), goodAnswer(bad)))
      expect(requestFiles()).toEqual([])
      expect(stateOf().founds ?? []).toEqual([])
    }
  })

  it('writes nothing when the model refuses, and says so', async () => {
    await landOn(fakeLlm(planFor(foundStep()), null))
    expect(requestFiles()).toEqual([])
    expect(stateOf().founds ?? []).toEqual([])
  })

  it('rests, with a note, when two requests got open between the plan and the step (the conditions are checked again)', async () => {
    const fake = fakeLlm(planFor(foundStep()))
    await runTick(dir, deps(fake.llm, NOW))
    openRequest('first-one', [1, 0])
    openRequest('second-one', [0, 1])
    await runTick(dir, deps(fake.llm, minutesAfter(31)))
    expect(requestFiles()).toEqual(['first-one.md', 'second-one.md'])
    expect(streamText()).toMatch(/found of Lantern Hall could not start/i)
    expect(fake.calls.some((c) => c.kind === ('found' as never))).toBe(false)
  })

  it('does not write the request twice: the same step landing again changes nothing', async () => {
    const fake = fakeLlm(planFor(foundStep()))
    await landOn(fake)
    await runTick(dir, deps(fake.llm, minutesAfter(35)))
    expect(requestFiles()).toEqual(['lantern-hall.md'])
    expect(stateOf().founds).toHaveLength(1)
  })

  it('takes the next free id when a request or a place already has the name', async () => {
    openRequest('lantern-hall', [0, 1], 'declined')
    await landOn(fakeLlm(planFor(foundStep())))
    expect(requestFiles().sort()).toEqual(['lantern-hall-2.md', 'lantern-hall.md'])
  })
})
