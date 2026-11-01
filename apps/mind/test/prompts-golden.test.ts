import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Forkling, Goals, Interests, MindState, Skills, WorldObject } from '@forkling/schema'
import { buildSystem, buildUser, type ThinkKind, type UserInput } from '../src/prompts.ts'
import { loadSpecies } from '../src/species.ts'

const templates = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const cat = loadSpecies('cat')

const forkling = Forkling.parse(JSON.parse(readFileSync(join(templates, 'forkling.json'), 'utf8')))
const objects = readdirSync(join(templates, 'objects')).map((f) => WorldObject.parse(JSON.parse(readFileSync(join(templates, 'objects', f), 'utf8'))))

function input(kind: ThinkKind): UserInput {
  return {
    kind,
    forkling,
    goals: Goals.parse({}),
    mindState: MindState.parse({}),
    objects,
    spotKinds: ['perch', 'sunbeam'],
    triggers: [{ kind: 'newDay', score: 1, detail: 'a new day' }],
    events: [],
    localTime: 'Tuesday 2026-11-03 10:00',
    wakeTime: '07:10',
    bedTime: '23:05',
    hoursLeft: 13,
    body: { x: 1, z: -2, needs: { hunger: 70, energy: 55 } },
    nowMs: Date.parse('2026-11-03T09:00:00Z'),
    holding: undefined,
    stored: {},
    skills: Skills.parse({}),
    temperament: null,
    feelings: 'feeling neutral, calm',
    justNow: [],
    beliefs: [],
    memory: '',
    interests: Interests.parse({}),
    designs: 'ready',
  }
}

/** Pins the exact prompt text, so splitting the builders into modules cannot change a word. */
describe('prompt golden files', () => {
  it('system prompt', async () => {
    const system = buildSystem({ pack: cat.pack, name: 'Merge', speciesPersona: cat.persona, persona: 'Merge likes the sunny rock.' })
    await expect(system).toMatchFileSnapshot('golden/system.txt')
  })
  for (const kind of ['morning', 'decide', 'weekly'] as const) {
    it(`${kind} user prompt`, async () => {
      await expect(buildUser(input(kind))).toMatchFileSnapshot(`golden/user-${kind}.txt`)
    })
  }
  it('replan user prompt', async () => {
    const replan = { ...input('decide'), triggers: [{ kind: 'replan' as const, score: 0.45, detail: 'there is no step in progress and nothing planned next' }] }
    await expect(buildUser(replan)).toMatchFileSnapshot('golden/user-replan.txt')
  })
})
