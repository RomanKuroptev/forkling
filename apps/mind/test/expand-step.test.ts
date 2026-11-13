import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BudgetLedger, ExpandJob, Interests, JobResult, MindState, Place, Souvenir, Wish } from '@forkling/schema'
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
const HOUR = 3_600_000

const step = (verb: string, target: string | null, minutes: number, reason: string, over: Record<string, unknown> = {}) => ({ verb, target, reason, minutes, wantId: null, deep: null, size: null, ...over })
const planFor = (first: ReturnType<typeof step>) => ({
  thought: 'The signals deserve more room.',
  longGoal: null,
  dropLongGoal: false,
  plan: [first, step('write', 'home', 25, 'A plaque.'), step('rest', null, 30, 'Rest.')],
  planReason: 'A building day.',
  stayUpLate: null,
})
const expandStep = (over: Record<string, unknown> = {}) => step('expand', 'house-of-lights', 30, 'The signals keep coming and the hall is full.', over)
const keep = { thought: 'Nothing to change.', longGoal: null, dropLongGoal: false, plan: null, planReason: null, stayUpLate: null }

function fakeLlm(plan: unknown, repeat = false) {
  const calls: LlmRequest[] = []
  let planned = false
  const llm: LlmClient = {
    ...noBatch,
    async complete<T>(req: LlmRequest<T>) {
      calls.push(req)
      const usage = { input: 800, cacheRead: 0, cacheWrite: 0, output: 200 }
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
const placeOf = (id: string) => Place.parse(read(`places/${id}.json`))
const stateOf = () => MindState.parse(read('mind/state.json'))
const streamText = () => readFileSync(file('memory/stream/2026-11-03.jsonl'), 'utf8')
const jobFiles = () => (existsSync(file('mind/builds')) ? readdirSync(file('mind/builds')).filter((f) => !f.endsWith('.result.json')) : [])
const deps = (llm: LlmClient, now: string) => ({ now: new Date(now), llm, pack: cat.pack, behaviors: cat.behaviors, speciesPersona: cat.persona })
async function landOn(fake: ReturnType<typeof fakeLlm>) {
  await runTick(dir, deps(fake.llm, NOW))
  return runTick(dir, deps(fake.llm, minutesAfter(31)))
}

const home = JSON.parse(readFileSync(join(world, 'places/home.json'), 'utf8'))
const lights = (over: Record<string, unknown> = {}) => ({
  ...home,
  id: 'house-of-lights',
  name: 'House of Lights',
  tags: ['signals'],
  chunk: [1, 0],
  offset: [0, 0],
  founded: '2026-11-01',
  exterior: { ...home.exterior, footprint: [20, 14], sign: 'HOUSE OF LIGHTS' },
  history: [{ at: '2026-11-01T10:00:00Z', verb: 'found', summary: 'Built it for the signals.' }],
  ...over,
})
const kept = (n: number, topic = 'signals') =>
  put(`souvenirs/2026-11-02-s${n}.json`, Souvenir.parse({ kind: 'quote', id: `s${n}`, why: 'it stuck', content: `signal words ${n}`, topics: [topic], source: { url: 'https://en.wikipedia.org/wiki/Signal', title: `S${n}`, fetchedAt: '2026-11-02T10:00:00Z' } }))
const interests = (weight: number) => put('brain/interests.json', Interests.parse({ version: 2, topics: { signals: { weight, firstSeen: '2026-11-01T10:00:00Z', lastFed: '2026-11-02T10:00:00Z', sources: [] } } }))

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'expand-step-'))
  copyFileSync(join(merge, 'forkling.json'), file('forkling.json'))
  mkdirSync(file('objects'))
  for (const f of readdirSync(join(merge, 'objects'))) copyFileSync(join(merge, 'objects', f), file(`objects/${f}`))
  mkdirSync(file('places'))
  copyFileSync(join(world, 'places/home.json'), file('places/home.json'))
  copyFileSync(join(world, 'places/workshop.json'), file('places/workshop.json'))
  put('places/house-of-lights.json', lights())
  interests(70) // fades to about 64 by the morning, still over 50
  for (const n of [1, 2, 3]) kept(n)
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('the plan offers an expand only where spec 2.5 allows it', () => {
  it('lists the places that have earned an expand, with the tag, so Merge knows where to look', async () => {
    const fake = fakeLlm(planFor(expandStep()))
    await runTick(dir, deps(fake.llm, NOW))
    expect(fake.calls[0]!.user).toMatch(/<growable>[\s\S]*house-of-lights \(signals\)[\s\S]*<\/growable>/)
  })

  it('takes an expand of such a place', async () => {
    await runTick(dir, deps(fakeLlm(planFor(expandStep())).llm, NOW))
    expect(read('mind/goals.json').today.steps[0]).toMatchObject({ verb: 'expand', targetId: 'house-of-lights' })
  })

  it('turns down an expand of a place whose tag is under weight 50 or has fewer than 3 souvenirs', async () => {
    interests(40)
    await runTick(dir, deps(fakeLlm(planFor(expandStep()), true).llm, NOW))
    expect(stateOf().rejections.at(-1)!.reasons.join(' ')).toMatch(/not ready to grow/)
  })

  it('turns down an expand of the same place twice in a row', async () => {
    put('mind/state.json', MindState.parse({ lastExpandedPlace: 'house-of-lights' }))
    await runTick(dir, deps(fakeLlm(planFor(expandStep()), true).llm, NOW))
    expect(stateOf().rejections.at(-1)!.reasons.join(' ')).toMatch(/twice in a row/)
  })

  it('turns down an expand of a place under construction', async () => {
    put('places/house-of-lights.json', lights({ state: { construction: { kind: 'expand', finishesAt: '2026-11-04T10:00:00Z' }, lastCareAt: null, neglect: 0, lamps: true } }))
    await runTick(dir, deps(fakeLlm(planFor(expandStep()), true).llm, NOW))
    expect(stateOf().rejections.at(-1)!.reasons.join(' ')).toMatch(/not ready to grow/)
  })

  it('does not list a place that has not earned one', async () => {
    interests(40)
    const fake = fakeLlm(planFor(step('rest', null, 30, 'Rest.')))
    await runTick(dir, deps(fake.llm, NOW))
    expect(fake.calls[0]!.user).not.toContain('<growable>')
  })
})

describe('an expand step asks the builders (spec 2.4, 10.2)', () => {
  it('writes a job when the step lands, makes no model call itself, and remembers which place so it is not the next one', async () => {
    const fake = fakeLlm(planFor(expandStep()))
    const result = await landOn(fake)
    const files = jobFiles()
    expect(files).toHaveLength(1)
    const job = ExpandJob.parse(read(`mind/builds/${files[0]}`))
    expect(job).toMatchObject({ kind: 'expand', placeId: 'house-of-lights', reason: 'The signals keep coming and the hall is full.' })
    expect(files[0]).toMatch(/^expand-20261103-\d{4}\.json$/)
    expect(result.written).toContain(`mind/builds/${files[0]}`)
    expect(fake.calls.some((c) => c.kind === ('expand' as never))).toBe(false)
    expect(stateOf().lastExpandedPlace).toBe('house-of-lights')
    expect(streamText()).toMatch(/Asked the builders to expand House of Lights/)
    expect(placeOf('house-of-lights').rooms).toHaveLength(1)
  })

  it('rests, with a note, when an expand is already being built, and asks for no second one', async () => {
    put('mind/builds/expand-20261102-1000.json', { id: 'expand-20261102-1000', kind: 'expand', requestedAt: '2026-11-02T10:00:00Z', placeId: 'workshop', reason: 'x' })
    await landOn(fakeLlm(planFor(expandStep())))
    expect(jobFiles()).toEqual(['expand-20261102-1000.json'])
    expect(streamText()).toMatch(/already being built/)
    expect(stateOf().lastExpandedPlace ?? null).toBeNull()
  })

  it('rests when the place stops being ready between the plan and the step (the conditions are checked again)', async () => {
    const fake = fakeLlm(planFor(expandStep()))
    await runTick(dir, deps(fake.llm, NOW))
    rmSync(file('souvenirs'), { recursive: true })
    await runTick(dir, deps(fake.llm, minutesAfter(31)))
    expect(jobFiles()).toEqual([])
    expect(streamText()).toMatch(/expand of House of Lights could not start/i)
  })

  it('waits when spending is ahead of the month\'s pace (spec 13), and says so', async () => {
    put('brain/budget.json', { month: '2026-11', capUsd: 10, spentUsd: 5 })
    await landOn(fakeLlm(planFor(expandStep())))
    expect(jobFiles()).toEqual([])
    expect(streamText()).toMatch(/pace/)
  })

  it('does not ask the builders for a found yet (that is slice 6)', async () => {
    await landOn(fakeLlm(planFor(step('found', 'A New Place', 30, 'I want one.'))))
    expect(jobFiles()).toEqual([])
  })
})

describe('what comes back from the builders (spec 10.2: the loop checks it again and writes the place)', () => {
  const room = { kind: 'room', room: { id: 'reading-room', name: 'Reading room', size: [4, 4, 3], at: [7, 0], floor: 0, parts: [{ part: 'shelf-tall', at: [0, 0, 1], rot: 0 }] } }
  const call = { at: '2026-11-03T10:00:00Z', kind: 'expand', model: 'claude-sonnet-5-5', input: 20_000, cacheRead: 0, cacheWrite: 0, output: 6_000, usd: 0.1 }
  const result = (over: Record<string, unknown> = {}) =>
    JobResult.parse({
      id: 'expand-20261103-1000',
      kind: 'expand',
      status: 'done',
      placeId: 'house-of-lights',
      patch: { verb: 'expand', change: room, summary: 'A reading room for the signals.' },
      wishes: [{ name: 'Spiral staircase', description: 'A staircase that turns.', forPlace: 'house-of-lights' }],
      constraint: { text: 'Use only two colours.', refused: false, reason: null },
      collision: null,
      calls: [call],
      at: '2026-11-03T10:05:00Z',
      ...over,
    })
  const settle = async (r: JobResult, at = minutesAfter(70)) => {
    const fake = fakeLlm(planFor(step('write', 'home', 25, 'A plaque.')))
    await runTick(dir, deps(fake.llm, NOW))
    put(`mind/builds/${r.id}.result.json`, r)
    const out = await runTick(dir, deps(fake.llm, at))
    return { fake, out }
  }

  it('writes the place with the new room, and 3 hours of waking time of construction from now', async () => {
    const at = minutesAfter(70)
    const { out } = await settle(result(), at)
    const place = placeOf('house-of-lights')
    expect(place.rooms.map((r) => r.id)).toEqual(['main', 'reading-room'])
    expect(place.history.at(-1)).toMatchObject({ verb: 'expand', summary: 'A reading room for the signals.' })
    const f = read('forkling.json')
    expect(place.state.construction).toEqual({ kind: 'expand', finishesAt: new Date(addWakingMs(Date.parse(at), 3 * HOUR, { seed: f.seed, timezone: f.timezone })).toISOString() })
    expect(out.written).toContain('places/house-of-lights.json')
  })

  it('counts the construction in waking time only: begun in the evening, it ends the next morning', async () => {
    const evening = '2026-11-03T20:30:00Z' // 21:30 in Stockholm, bed is about 23:00
    const { out } = await settle(result(), evening)
    const finishes = Date.parse(placeOf('house-of-lights').state.construction!.finishesAt)
    expect(finishes - Date.parse(evening)).toBeGreaterThan(3 * HOUR + 4 * HOUR)
    expect(out.written).toContain('places/house-of-lights.json')
  })

  it('writes the wishes, and wishing a part that is open again adds to its count', async () => {
    const wish = Wish.parse({ id: 'spiral-staircase', name: 'Spiral staircase', description: 'A staircase that turns.', forPlace: null, count: 1, written: '2026-11-02T10:00:00Z', status: 'open', statusAt: null, note: null })
    put('wishes/spiral-staircase.json', wish)
    await settle(result())
    expect(Wish.parse(read('wishes/spiral-staircase.json'))).toMatchObject({ count: 2, written: '2026-11-02T10:00:00Z' })
    expect(readdirSync(file('wishes'))).toEqual(['spiral-staircase.json'])
  })

  it('writes a new wish as an open wish of count 1', async () => {
    const { out } = await settle(result())
    expect(Wish.parse(read('wishes/spiral-staircase.json'))).toMatchObject({ count: 1, status: 'open', forPlace: 'house-of-lights' })
    expect(out.written).toContain('wishes/spiral-staircase.json')
  })

  it('books what the worker spent, once, and tells the next decide call', async () => {
    await settle(result())
    expect(BudgetLedger.parse(read('brain/budget.json')).byKind.expand).toMatchObject({ calls: 1 })
    expect(streamText()).toMatch(/House of Lights/)
    expect(streamText()).toMatch(/reading room for the signals/i)
  })

  it('does it once: the next tick does not build the room again or count the wish twice', async () => {
    const r = result()
    const { fake } = await settle(r)
    const before = placeOf('house-of-lights')
    await runTick(dir, deps(fake.llm, minutesAfter(100)))
    expect(placeOf('house-of-lights').history).toHaveLength(before.history.length)
    expect(Wish.parse(read('wishes/spiral-staircase.json')).count).toBe(1)
    expect(BudgetLedger.parse(read('brain/budget.json')).byKind.expand).toMatchObject({ calls: 1 })
  })

  it('says so when Merge refused the constraint it was offered, with its reason', async () => {
    await settle(result({ constraint: { text: 'Use only two colours.', refused: true, reason: 'The hall needs a third.' } }))
    expect(streamText()).toMatch(/refused the constraint[^U]*Use only two colours.[^]*The hall needs a third./)
  })

  it('drops a change that no longer fits the place (it changed while the builders worked), and changes nothing', async () => {
    const outside = result({ patch: { verb: 'expand', change: { ...room, room: { ...room.room, at: [40, 0] } }, summary: 'Too far.' } })
    const { out } = await settle(outside)
    expect(placeOf('house-of-lights').rooms).toHaveLength(1)
    expect(placeOf('house-of-lights').state.construction).toBeNull()
    expect(out.written).not.toContain('places/house-of-lights.json')
    expect(streamText()).toMatch(/could not be built/i)
    expect(BudgetLedger.parse(read('brain/budget.json')).byKind.expand).toMatchObject({ calls: 1 })
  })

  it('drops a change when the conditions of 2.5 no longer hold, with the reason', async () => {
    rmSync(file('souvenirs'), { recursive: true })
    await settle(result())
    expect(placeOf('house-of-lights').rooms).toHaveLength(1)
    expect(streamText()).toMatch(/3 souvenirs/)
  })

  it('drops a change when the place is already under construction', async () => {
    put('places/house-of-lights.json', lights({ state: { construction: { kind: 'expand', finishesAt: '2026-11-04T10:00:00Z' }, lastCareAt: null, neglect: 0, lamps: true } }))
    await settle(result())
    expect(placeOf('house-of-lights').rooms).toHaveLength(1)
    expect(streamText()).toMatch(/construction/)
  })

  it('takes in a failed job without touching the place, and books its cost', async () => {
    put('mind/builds/expand-20261103-1000.json', ExpandJob.parse({ id: 'expand-20261103-1000', kind: 'expand', requestedAt: '2026-11-03T09:40:00Z', placeId: 'house-of-lights', reason: 'The hall is full.' }))
    const { out } = await settle(JobResult.parse({ id: 'expand-20261103-1000', kind: 'expand', status: 'failed', reason: 'the model refused', calls: [call], at: '2026-11-03T10:05:00Z' }))
    expect(placeOf('house-of-lights').rooms).toHaveLength(1)
    expect(out.written).not.toContain('places/house-of-lights.json')
    expect(streamText()).toMatch(/could not expand House of Lights/)
    expect(BudgetLedger.parse(read('brain/budget.json')).byKind.expand).toMatchObject({ calls: 1 })
  })

  it('an expand that was a path adds the path and starts the construction too', async () => {
    const path = result({ patch: { verb: 'expand', change: { kind: 'path', to: 'workshop' }, summary: 'A path to the Workshop.' }, wishes: [] })
    await settle(path)
    const place = placeOf('house-of-lights')
    expect(place.paths.map((p) => p.to)).toEqual(['workshop'])
    expect(place.state.construction).toMatchObject({ kind: 'expand' })
  })
})

describe('a construction ends when its time is up (spec 4.5)', () => {
  const building = (finishesAt: string) => lights({ state: { construction: { kind: 'expand', finishesAt }, lastCareAt: '2026-11-02T10:00:00Z', neglect: 0, lamps: true } })

  it('clears it from the place file, says so, and changes nothing else', async () => {
    put('places/house-of-lights.json', building('2026-11-03T08:00:00Z'))
    const before = placeOf('house-of-lights')
    const out = await runTick(dir, deps(fakeLlm(planFor(step('write', 'home', 25, 'A plaque.'))).llm, NOW))
    const after = placeOf('house-of-lights')
    expect(after.state.construction).toBeNull()
    expect({ ...after, state: { ...after.state, construction: before.state.construction } }).toEqual(before)
    expect(out.written).toContain('places/house-of-lights.json')
    expect(streamText()).toMatch(/House of Lights is finished/)
  })

  it('leaves a construction that is still going on, and writes nothing for it', async () => {
    put('places/house-of-lights.json', building('2026-11-03T12:00:00Z'))
    const out = await runTick(dir, deps(fakeLlm(planFor(step('write', 'home', 25, 'A plaque.'))).llm, NOW))
    expect(placeOf('house-of-lights').state.construction).toMatchObject({ kind: 'expand', finishesAt: '2026-11-03T12:00:00Z' })
    expect(out.written).not.toContain('places/house-of-lights.json')
  })

  it('does it once: the next tick has nothing to clear', async () => {
    put('places/house-of-lights.json', building('2026-11-03T08:00:00Z'))
    const fake = fakeLlm(planFor(step('write', 'home', 25, 'A plaque.')))
    await runTick(dir, deps(fake.llm, NOW))
    const out = await runTick(dir, deps(fake.llm, minutesAfter(20)))
    expect(out.written).not.toContain('places/house-of-lights.json')
    expect(streamText().match(/House of Lights is finished/g)).toHaveLength(1)
  })

  it('lets the place grow again at once: the plan of the same tick may expand it', async () => {
    put('places/house-of-lights.json', building('2026-11-03T08:00:00Z'))
    await runTick(dir, deps(fakeLlm(planFor(expandStep()), true).llm, NOW))
    expect(read('mind/goals.json').today.steps[0]).toMatchObject({ verb: 'expand', targetId: 'house-of-lights' })
  })

  it('clears it before it takes in a result, so a result that comes the moment a build ends is not turned away', async () => {
    put('places/house-of-lights.json', building('2026-11-03T09:30:00Z'))
    const fake = fakeLlm(planFor(step('write', 'home', 25, 'A plaque.')))
    await runTick(dir, deps(fake.llm, NOW))
    put(
      'mind/builds/expand-20261103-1000.result.json',
      JobResult.parse({
        id: 'expand-20261103-1000',
        kind: 'expand',
        status: 'done',
        placeId: 'house-of-lights',
        patch: { verb: 'expand', change: { kind: 'path', to: 'workshop' }, summary: 'A path to the Workshop.' },
        calls: [],
        at: '2026-11-03T10:05:00Z',
      }),
    )
    await runTick(dir, deps(fake.llm, minutesAfter(40)))
    expect(placeOf('house-of-lights').paths.map((p) => p.to)).toEqual(['workshop'])
    expect(placeOf('house-of-lights').state.construction).toMatchObject({ kind: 'expand' })
  })
})
