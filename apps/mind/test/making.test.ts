import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { Forkling, Skills, TemperamentRoll, WorldObject, type SpeciesPack } from '@forkling/schema'
import type { Decision, LlmStep } from '../src/decision.ts'
import type { LlmClient, LlmRequest } from '../src/llm.ts'
import { loadSpecies } from '../src/species.ts'
import { runTick, type TickDeps } from '../src/tick.ts'

const templates = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const cat = loadSpecies('cat')
/** The cat, with needs that never decay, so nothing but the plan decides what happens. */
const pack: SpeciesPack = { ...cat.pack, needs: Object.fromEntries(Object.entries(cat.pack.needs).map(([id, n]) => [id, { ...n!, decayPerHour: 0 }])) }

const NOW = Date.parse('2026-11-03T09:00:00Z') // 10:00 in Stockholm, long after waking
const minutes = (n: number) => new Date(NOW + n * 60_000)

const step = (verb: string, target: string | null, minutes: number, extra: Partial<LlmStep> = {}): LlmStep => ({
  verb,
  target,
  x: null,
  z: null,
  reason: `I want to ${verb.replace('_', ' ')}.`,
  minutes,
  materials: null,
  makes: null,
  ...extra,
})

const decision = (plan: LlmStep[] | null): Decision => ({
  thought: 'A good day for making things.',
  longGoal: { text: 'Build a shelf for the lookout rock.', reason: 'I want somewhere to keep my finds.' },
  dropLongGoal: false,
  plan,
  planReason: 'Gather, store, build.',
  stayUpLate: null,
})

interface FakeLlm extends LlmClient {
  calls: LlmRequest[]
}
function fakeLlm(answer: Decision | null): FakeLlm {
  const calls: LlmRequest[] = []
  return {
    calls,
    async complete(req) {
      calls.push(req)
      return { decision: answer, stopReason: 'end_turn', usage: { input: 800, cacheRead: 0, cacheWrite: 3000, output: 400 } }
    },
  }
}

let dir: string
const file = (rel: string) => join(dir, rel)
const readJson = (rel: string) => JSON.parse(readFileSync(file(rel), 'utf8'))
const writeJson = (rel: string, value: unknown) => {
  mkdirSync(join(dir, rel, '..'), { recursive: true })
  writeFileSync(file(rel), JSON.stringify(value, null, 2))
}
const tick = (n: number, llm: LlmClient | null, over: Partial<TickDeps> = {}) =>
  runTick(dir, { now: minutes(n), llm, pack, behaviors: cat.behaviors, speciesPersona: cat.persona, pools: cat.pools, ...over })

const part = { shape: 'box', size: [0.6, 0.4, 0.6], at: [0, 0.2, 0], color: '#a67c52' }
const placed = (id: string, dx: number, dz: number, extra: Record<string, unknown>) =>
  writeJson(`objects/${id}.json`, WorldObject.parse({ id, kind: id, name: `The ${id}`, position: [dx, 0, dz], model: { parts: [part] }, reason: 'It is here.', ...extra }))

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mind-making-'))
  copyFileSync(join(templates, 'forkling.json'), file('forkling.json'))
  mkdirSync(file('objects'))
  for (const f of readdirSync(join(templates, 'objects'))) copyFileSync(join(templates, 'objects', f), file(`objects/${f}`))
  placed('driftwood', 1, 21, { yields: { material: 'wood', max: 5, respawnHours: 24 } })
  placed('house', -6, 15, { properties: { storage: true }, unlocks: ['open', 'close'] })
  placed('workbench', -2, 18, { unlocks: ['join', 'build'] })
})

const plan = [
  step('pick_up', 'driftwood', 10),
  step('put_on', 'house', 5),
  step('pick_up', 'driftwood', 5),
  step('put_on', 'house', 5),
  step('build', 'workbench', 20, { materials: ['wood', 'wood'], makes: 'a wooden shelf', reason: 'The lookout rock needs somewhere to keep my finds.' }),
]

describe('a day of making', () => {
  it('gathers, puts away and builds, step by step, and leaves a shelf with its reason', async () => {
    await tick(0, fakeLlm(decision(plan)))
    expect(readJson('mind/goals.json').today.steps).toHaveLength(5)

    const quiet = fakeLlm(null)
    await tick(11, quiet) // the first step is over: wood in its paws
    expect(Forkling.parse(readJson('forkling.json')).holding).toEqual({ material: 'wood' })
    expect(readJson('objects/driftwood.json').state.stock).toBe(4)

    await tick(17, quiet) // put away
    let forkling = Forkling.parse(readJson('forkling.json'))
    expect(forkling.holding).toBeUndefined()
    expect(forkling.stored).toEqual({ wood: 1 })

    await tick(23, quiet)
    await tick(29, quiet) // second piece stored
    expect(Forkling.parse(readJson('forkling.json')).stored).toEqual({ wood: 2 })

    const result = await tick(50, quiet) // the build step is over
    forkling = Forkling.parse(readJson('forkling.json'))
    expect(forkling.stored).toEqual({})
    expect(forkling.holding).toBeUndefined()

    const shelf = WorldObject.parse(readJson('objects/a-wooden-shelf.json'))
    expect(shelf.name).toBe('a wooden shelf')
    expect(shelf.reason).toBe('The lookout rock needs somewhere to keep my finds.')
    expect(shelf.made).toMatchObject({ verb: 'build', materials: ['wood', 'wood'], done: true })
    expect('parts' in shelf.model).toBe(true)
    expect(shelf.properties.carryable).toBe(true)
    expect(result.written).toContain('objects/a-wooden-shelf.json')
    expect(result.summary).toMatch(/build: finished/)

    // Nobody had to ask the model about any of it: the plan carried itself.
    expect(quiet.calls.length).toBe(1) // only the end of the plan wakes it
  })

  it('earns practice from the work, in the right groups', async () => {
    await tick(0, fakeLlm(decision(plan)))
    const quiet = fakeLlm(null)
    for (const n of [11, 17, 23, 29, 50]) await tick(n, quiet)
    const skills = Skills.parse(readJson('brain/skills.json'))
    expect(skills.hands?.xp).toBe(25)
    expect(skills.making?.xp).toBe(20)
  })

  it('does not count a made thing as news to the one who made it', async () => {
    await tick(0, fakeLlm(decision(plan)))
    const quiet = fakeLlm(null)
    for (const n of [11, 17, 23, 29]) await tick(n, quiet)
    await tick(50, fakeLlm(decision(null))) // the plan is over: it is asked what next, and carries on
    expect(readJson('mind/state.json').knownObjects).toContain('a-wooden-shelf')
    const later = fakeLlm(null)
    await tick(55, later)
    expect(later.calls).toHaveLength(0)
  })

  it('applies a step once, however many ticks follow it', async () => {
    await tick(0, fakeLlm(decision([step('pick_up', 'driftwood', 10), step('sit', null, 10)])))
    const quiet = fakeLlm(null)
    await tick(11, quiet)
    await tick(12, quiet)
    await tick(13, quiet)
    expect(readJson('objects/driftwood.json').state.stock).toBe(4)
  })

  it('turns down a plan that builds with wood it does not have, and asks again with why', async () => {
    const llm = fakeLlm(decision([step('build', 'workbench', 20, { materials: ['wood'], makes: 'a shelf' })]))
    await tick(0, llm)
    expect(llm.calls).toHaveLength(2)
    expect(llm.calls[1]!.user).toMatch(/does not have the wood/)
    expect(existsSync(file('objects/a-shelf.json'))).toBe(false)
  })
})

describe('when a step does not work out', () => {
  it('wakes the model, says what went wrong, and lowers its spirits once', async () => {
    await tick(0, fakeLlm(decision([step('pick_up', 'driftwood', 10), step('sit', null, 10)])))
    writeJson('objects/driftwood.json', { ...readJson('objects/driftwood.json'), state: { stock: 0, stockAt: new Date(NOW + 5 * 60_000).toISOString() } })
    const before = Forkling.parse(readJson('forkling.json'))
    const llm = fakeLlm(decision(null))
    await tick(11, llm)
    expect(llm.calls).toHaveLength(1)
    expect(llm.calls[0]!.user).toMatch(/pick_up did not work out: there is nothing left at "driftwood"/)
    expect(Forkling.parse(readJson('forkling.json')).feelings.valence).toBeLessThan(before.feelings.valence)

    const again = fakeLlm(decision(null))
    await tick(12, again)
    const valence = Forkling.parse(readJson('forkling.json')).feelings.valence
    await tick(13, again)
    expect(again.calls.length).toBeLessThanOrEqual(1)
    expect(Forkling.parse(readJson('forkling.json')).feelings.valence).toBeGreaterThanOrEqual(valence - 0.001)
  })
})

describe('temperament', () => {
  it('is rolled once from the seed, written, and never rolled again', async () => {
    expect(existsSync(file('brain/temperament.json'))).toBe(false)
    await tick(0, fakeLlm(decision(null)))
    const first = TemperamentRoll.parse(readJson('brain/temperament.json'))
    expect(first.likes).toHaveLength(4)
    expect(first.dislikes).toHaveLength(3)
    expect(first.quirks.length).toBeGreaterThanOrEqual(2)
    writeJson('forkling.json', { ...readJson('forkling.json'), seed: 999 })
    await tick(40, fakeLlm(null))
    expect(TemperamentRoll.parse(readJson('brain/temperament.json'))).toEqual(first)
  })

  it('makes forklings with different seeds different, and shows them their own taste', async () => {
    const llm = fakeLlm(decision(null))
    await tick(0, llm)
    const a = TemperamentRoll.parse(readJson('brain/temperament.json'))
    expect(llm.calls[0]!.user).toMatch(/likes: /)
    for (const q of a.quirks) expect(llm.calls[0]!.user).toContain(`quirk (${q.id})`)

    const other = mkdtempSync(join(tmpdir(), 'mind-other-'))
    copyFileSync(file('forkling.json'), join(other, 'forkling.json'))
    writeFileSync(join(other, 'forkling.json'), JSON.stringify({ ...readJson('forkling.json'), seed: 7 }))
    await runTick(other, { now: minutes(0), llm: null, pack, behaviors: cat.behaviors, speciesPersona: cat.persona, pools: cat.pools })
    const b = TemperamentRoll.parse(JSON.parse(readFileSync(join(other, 'brain/temperament.json'), 'utf8')))
    expect(b).not.toEqual(a)
  })

  it('moves how it feels: finishing something pleases, and what it likes pleases more', async () => {
    await tick(0, fakeLlm(decision(plan)))
    const quiet = fakeLlm(null)
    for (const n of [11, 17, 23, 29, 50]) await tick(n, quiet)
    expect(Forkling.parse(readJson('forkling.json')).feelings.valence).toBeGreaterThan(0)
  })
})

describe('what the model is shown about making', () => {
  it('lists the verbs by group, with what they do, and what is in its paws and around it', async () => {
    const llm = fakeLlm(decision(null))
    await tick(0, llm)
    const { system, user } = llm.calls[0]!
    expect(system).toContain('### Hands')
    expect(system).toContain('### Making')
    expect(system).toMatch(/- build: target: the id of an object that unlocks "build"; needs something|- build: target: the id of an object that unlocks "build"/)
    expect(system).toMatch(/Your paws hold one thing at a time/)
    expect(system).not.toMatch(/\d{4}-\d{2}-\d{2}/)
    expect(user).toContain('in your paws: nothing')
    expect(user).toContain('stored at home: nothing')
    expect(user).toMatch(/"id":"driftwood".*"gives":"wood","left":5/)
    expect(user).toMatch(/"id":"workbench".*"unlocks":\["join","build"\]/)
  })

  it('asks for a long goal a person might have, not an animal instinct', async () => {
    const llm = fakeLlm(decision(null))
    await tick(0, llm)
    const { system, user } = llm.calls[0]!
    expect(system).toMatch(/something you want to make, learn, grow or understand/)
    expect(system).toMatch(/not just an animal instinct/)
    expect(system).not.toMatch(/a place you mean to claim/)
    expect(user).toMatch(/the kind of thing a person might care about/)
  })

  it('keeps the cacheable prefix free of anything that changes, and species words out of the engine rules', async () => {
    const llm = fakeLlm(decision(null))
    await tick(0, llm)
    expect(llm.calls[0]!.system).not.toMatch(/a cat does not/)
  })
})
