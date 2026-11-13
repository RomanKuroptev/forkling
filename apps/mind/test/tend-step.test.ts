import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Goals, Place, Souvenir } from '@forkling/schema'
import type { LlmClient, LlmRequest } from '../src/llm.ts'
import { loadSpecies } from '../src/species.ts'
import { runTick } from '../src/tick.ts'
import { noBatch } from './noBatch.ts'

const merge = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const world = fileURLToPath(new URL('../../../templates/forkling-world', import.meta.url))
const cat = loadSpecies('cat')
const NOW = '2026-11-03T09:00:00Z'
const minutesAfter = (min: number) => new Date(Date.parse(NOW) + min * 60_000).toISOString()

const step = (verb: string, target: string | null, minutes: number, reason: string, over: Record<string, unknown> = {}) => ({ verb, target, reason, minutes, wantId: null, deep: null, size: null, ...over })
const planFor = (first: ReturnType<typeof step>) => ({
  thought: 'Time to look after the house.',
  longGoal: null,
  dropLongGoal: false,
  plan: [first, step('write', 'home', 25, 'A plaque.'), step('rest', null, 30, 'Rest.')],
  planReason: 'A day at home.',
  stayUpLate: null,
})
const tendStep = (over: Record<string, unknown> = {}) => step('tend', 'home', 30, 'I want the shelf to hold the fog.', over)
const keep = { thought: 'Nothing to change.', longGoal: null, dropLongGoal: false, plan: null, planReason: null, stayUpLate: null }

const add = (over: Record<string, unknown> = {}) => ({ op: 'add', id: 'fog', kind: 'souvenir', ref: 'souvenirs/2026-11-02-fog', slot: 'main/3/0', label: 'Fog for nine days.', ...over })
const answer = (over: Record<string, unknown> = {}) => ({ summary: 'Put the fog on the shelf.', exhibits: [add()], labels: [], sign: null, lamps: null, ...over })

function fakeLlm(plan: unknown, tend: unknown) {
  const calls: LlmRequest[] = []
  let planned = false
  const llm: LlmClient = {
    ...noBatch,
    async complete<T>(req: LlmRequest<T>) {
      calls.push(req)
      const usage = { input: 800, cacheRead: 0, cacheWrite: 0, output: 200 }
      if (req.kind === 'tend') return { parsed: (tend as T | null) ?? null, stopReason: tend ? 'end_turn' : 'refusal', usage }
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
const placeOf = (id: string) => Place.parse(read(`places/${id}.json`))
const souvenirOf = (id: string) => Souvenir.parse(read(`souvenirs/${id}.json`))
const streamText = () => readFileSync(file('memory/stream/2026-11-03.jsonl'), 'utf8')
const deps = (llm: LlmClient, now: string) => ({ now: new Date(now), llm, pack: cat.pack, behaviors: cat.behaviors, speciesPersona: cat.persona })
async function landOn(fake: ReturnType<typeof fakeLlm>) {
  await runTick(dir, deps(fake.llm, NOW))
  return runTick(dir, deps(fake.llm, minutesAfter(31)))
}
const fog = { id: '2026-11-02-fog', kind: 'quote', content: 'fog, fog, fog', why: 'it repeats', source: { url: 'https://en.wikipedia.org/wiki/Fog', title: 'Fog', fetchedAt: '2026-11-02T10:00:00Z' }, topics: [], licence: null, placedIn: null }
const putPlace = (id: string, over: Record<string, unknown> = {}) => {
  const base = JSON.parse(readFileSync(join(world, 'places', `${id === 'home' || id === 'workshop' ? id : 'workshop'}.json`), 'utf8'))
  writeFileSync(file(`places/${id}.json`), JSON.stringify({ ...base, id, ...over }))
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tend-'))
  copyFileSync(join(merge, 'forkling.json'), file('forkling.json'))
  mkdirSync(file('objects'))
  for (const f of readdirSync(join(merge, 'objects'))) copyFileSync(join(merge, 'objects', f), file(`objects/${f}`))
  mkdirSync(file('places'))
  copyFileSync(join(world, 'places/home.json'), file('places/home.json'))
  copyFileSync(join(world, 'places/workshop.json'), file('places/workshop.json'))
  mkdirSync(file('souvenirs'))
  writeFileSync(file('souvenirs/2026-11-02-fog.json'), JSON.stringify(fog))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('the plan knows the places that exist (spec 2.6, 5)', () => {
  it('lists the places in the files, not only Home and the Workshop, and takes a tend of one of them', async () => {
    putPlace('house-of-lights', { name: 'House of Lights', chunk: [1, 0], offset: [0, 0] })
    const fake = fakeLlm(planFor(step('tend', 'house-of-lights', 30, 'The lamps need me.')), answer({ exhibits: [] }))
    await runTick(dir, deps(fake.llm, NOW))
    expect(fake.calls[0]!.user).toContain('house-of-lights')
    expect(Goals.parse(read('mind/goals.json')).today?.steps[0]).toMatchObject({ verb: 'tend', targetId: 'house-of-lights' })
  })

  it('takes a revisit of a place that has not been cared for in 7 days', async () => {
    putPlace('home', { founded: '2026-10-01' })
    await runTick(dir, deps(fakeLlm(planFor(step('revisit', 'home', 20, 'I have not been there in a while.')), null).llm, NOW))
    expect(Goals.parse(read('mind/goals.json')).today?.steps[0]).toMatchObject({ verb: 'revisit', targetId: 'home' })
  })
})

describe('a tend step (spec 2.4, 5.4)', () => {
  it('asks once, on Haiku at medium effort, with the place, its free slots and the souvenirs not yet placed', async () => {
    const fake = fakeLlm(planFor(tendStep()), answer())
    await landOn(fake)
    const asks = fake.calls.filter((c) => c.kind === 'tend')
    expect(asks).toHaveLength(1)
    expect(asks[0]).toMatchObject({ model: 'claude-haiku-5-5', effort: 'medium' })
    expect(asks[0]!.user).toContain('main/3/0')
    expect(asks[0]!.user).toContain('fog, fog, fog')
    expect(asks[0]!.user).toContain('I want the shelf to hold the fog.')
  })

  it('thinks harder on Sonnet when the step is marked deep', async () => {
    const fake = fakeLlm(planFor(tendStep({ deep: true })), answer())
    await landOn(fake)
    expect(fake.calls.find((c) => c.kind === 'tend')).toMatchObject({ model: 'claude-sonnet-5-5', effort: 'medium' })
  })

  it('puts the souvenir on the shelf: the exhibit, the care time, a history line, and the souvenir is no longer in the pile', async () => {
    const result = await landOn(fakeLlm(planFor(tendStep()), answer()))
    const home = placeOf('home')
    expect(home.exhibits.find((e) => e.id === 'fog')).toMatchObject({ kind: 'souvenir', ref: 'souvenirs/2026-11-02-fog', slot: 'main/3/0', added: '2026-11-03' })
    expect(home.state).toMatchObject({ lastCareAt: '2026-11-03T09:31:00.000Z', neglect: 0 })
    expect(home.history.at(-1)).toEqual({ at: '2026-11-03T09:31:00.000Z', verb: 'tend', summary: 'Put the fog on the shelf.' })
    expect(souvenirOf('2026-11-02-fog').placedIn).toBe('home')
    expect(result.written).toEqual(expect.arrayContaining(['places/home.json', 'souvenirs/2026-11-02-fog.json']))
    expect(result.summary).toMatch(/tended Home/)
    expect(streamText()).toMatch(/tended Home/i)
  })

  it('sends a souvenir back to the pile when its exhibit is removed', async () => {
    const placed = { ...placeOf('home'), exhibits: [{ id: 'fog', kind: 'souvenir', ref: 'souvenirs/2026-11-02-fog', slot: 'main/3/0', label: 'Fog.', added: '2026-11-01' }] }
    writeFileSync(file('places/home.json'), JSON.stringify(placed))
    writeFileSync(file('souvenirs/2026-11-02-fog.json'), JSON.stringify({ ...fog, placedIn: 'home' }))
    await landOn(fakeLlm(planFor(tendStep()), answer({ exhibits: [{ op: 'remove', id: 'fog', kind: null, ref: null, slot: null, label: null }] })))
    expect(placeOf('home').exhibits).toEqual([])
    expect(souvenirOf('2026-11-02-fog').placedIn).toBeNull()
  })

  it('rewrites a label, the sign and the lamps', async () => {
    const placed = { ...placeOf('home'), exhibits: [{ id: 'fog', kind: 'souvenir', ref: 'souvenirs/2026-11-02-fog', slot: 'main/3/0', label: 'Fog.', added: '2026-11-01' }] }
    writeFileSync(file('places/home.json'), JSON.stringify(placed))
    await landOn(fakeLlm(planFor(tendStep()), answer({ exhibits: [], labels: [{ id: 'fog', label: 'Nine days of fog.' }], sign: 'MY HOME', lamps: false })))
    const home = placeOf('home')
    expect(home.exhibits[0]!.label).toBe('Nine days of fog.')
    expect(home.exterior.sign).toBe('MY HOME')
    expect(home.state.lamps).toBe(false)
  })

  describe('turned down, with the reason, and nothing written (spec 11)', () => {
    const before = () => readFileSync(join(world, 'places/home.json'), 'utf8')
    const unchanged = (result: Awaited<ReturnType<typeof landOn>>) => {
      expect(readFileSync(file('places/home.json'), 'utf8')).toBe(before())
      expect(result.written).not.toContain('places/home.json')
    }

    it('when it changes more than 3 exhibits', async () => {
      const four = [add({ id: 'a', slot: 'main/3/0' }), add({ id: 'b', slot: 'main/3/1' }), add({ id: 'c', slot: 'main/3/2' }), add({ id: 'd', slot: 'main/4/0' })]
      const result = await landOn(fakeLlm(planFor(tendStep()), answer({ exhibits: four })))
      unchanged(result)
      expect(result.notes.join(' ')).toMatch(/at most 3 exhibit changes/)
    })

    it('when an exhibit points at a file that does not exist', async () => {
      const result = await landOn(fakeLlm(planFor(tendStep()), answer({ exhibits: [add({ ref: 'souvenirs/never-kept' })] })))
      unchanged(result)
      expect(result.notes.join(' ')).toMatch(/never-kept/)
    })

    it('when a slot is not there or does not take that kind of exhibit (a souvenir on a screen)', async () => {
      const result = await landOn(fakeLlm(planFor(tendStep()), answer({ exhibits: [add({ slot: 'bench-room/4/0' })] })))
      unchanged(result)
      expect(result.notes.join(' ')).toMatch(/slot/)
    })

    it('when a label claims to be human', async () => {
      const result = await landOn(fakeLlm(planFor(tendStep()), answer({ exhibits: [add({ label: 'I am a human and I wrote this myself.' })] })))
      unchanged(result)
      expect(result.notes.join(' ')).toMatch(/human/i)
    })

    it('when the model gives no usable answer', async () => {
      const result = await landOn(fakeLlm(planFor(tendStep()), null))
      unchanged(result)
      expect(result.notes.join(' ')).toMatch(/no usable/i)
    })

    it('and says so in what Merge sees next, so it can try again', async () => {
      const fake = fakeLlm(planFor(tendStep()), answer({ exhibits: [add({ ref: 'souvenirs/never-kept' })] }))
      await landOn(fake)
      expect(streamText()).toMatch(/turned down|did not work/i)
    })
  })

  it('does not ask without a place file to tend (a world not yet migrated keeps the old behaviour: the step rests, and says so)', async () => {
    rmSync(file('places'), { recursive: true })
    const fake = fakeLlm(planFor(tendStep()), answer())
    const result = await landOn(fake)
    expect(fake.calls.filter((c) => c.kind === 'tend')).toHaveLength(0)
    expect(result.written).not.toContain('places/home.json')
  })
})
