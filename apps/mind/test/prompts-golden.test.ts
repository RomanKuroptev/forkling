import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Forkling, Goals, Interests, MindState } from '@forkling/schema'
import { PRICES } from '@forkling/sim'
import { buildSystem, buildUser, type ThinkKind, type UserInput } from '../src/prompts.ts'
import { DEFAULT_SEED } from '../src/seed.ts'

const templates = fileURLToPath(new URL('../../../templates/merge', import.meta.url))

const forkling = Forkling.parse(JSON.parse(readFileSync(join(templates, 'forkling.json'), 'utf8')))

function input(kind: ThinkKind): UserInput {
  return {
    kind,
    forkling,
    goals: Goals.parse({}),
    mindState: MindState.parse({}),
    places: ['home', 'workshop'],
    triggers: [{ kind: 'newDay', score: 1, detail: 'a new day' }],
    events: [],
    localTime: 'Tuesday 2026-11-03 10:00',
    wakeTime: '07:10',
    bedTime: '23:05',
    hoursLeft: 13,
    allowance: { points: 150, prices: PRICES },
    mood: 'steady, rested',
    justNow: [],
    beliefs: [],
    memory: '',
    interests: Interests.parse({}),
  }
}

/** Pins the exact prompt text, so splitting the builders into modules cannot change a word. */
describe('prompt golden files', () => {
  it('system prompt', async () => {
    const system = buildSystem({ seed: DEFAULT_SEED })
    await expect(system).toMatchFileSnapshot('golden/system.txt')
  })
  for (const kind of ['morning', 'decide', 'weekly'] as const) {
    it(`${kind} user prompt`, async () => {
      await expect(buildUser(input(kind))).toMatchFileSnapshot(`golden/user-${kind}.txt`)
    })
  }
  it('morning user prompt with its past', async () => {
    const withPast = {
      ...input('morning'),
      interests: Interests.parse({ past: [{ topic: 'octopuses', startedAt: '2026-10-20T08:00:00Z', endedAt: '2026-10-25T08:00:00Z', origin: { id: 'hn:1', title: 'Octopus', url: 'https://example.com', at: '2026-10-20T08:00:00Z' } }] }),
      past: {
        readings: [{ date: '2026-11-02', title: 'A CPU in Minecraft', summary: 'Someone built logic gates out of redstone.' }],
        plans: [{ date: '2026-11-02', reason: 'A day for finding out how things work.' }],
        art: [{ date: '2026-11-02', kind: 'writing', title: 'The Sea' }],
      },
    }
    await expect(buildUser(withPast)).toMatchFileSnapshot('golden/user-morning-past.txt')
  })
  it('replan user prompt', async () => {
    const replan = { ...input('decide'), triggers: [{ kind: 'replan' as const, score: 0.45, detail: 'there is no step in progress and nothing planned next' }] }
    await expect(buildUser(replan)).toMatchFileSnapshot('golden/user-replan.txt')
  })
})
