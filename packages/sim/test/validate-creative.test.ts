import { describe, expect, it } from 'vitest'
import { PlanStep, SpeciesPack, WorldObject } from '@forkling/schema'
import makerJson from './fixtures/maker.species.json'
import { validatePlan, type PlanContext } from '../src/validate.ts'

const writer = {
  id: 'write',
  group: 'mind',
  effect: 'create',
  artifact: 'writing',
  target: { type: 'object', unlocked: true },
  slot: 'idle',
  durationSec: [5, 9],
  satisfies: {},
  reason: 'Words want to be put somewhere.',
}
const sitter = { id: 'muse', group: 'body', target: { type: 'none' }, slot: 'sit', durationSec: [5, 9], satisfies: {}, reason: 'Thinking.' }

const base = makerJson as unknown as { bodyPlans: Record<string, string[]>; actions: unknown[] }
const pack = SpeciesPack.parse({
  ...makerJson,
  bodyPlans: Object.fromEntries(Object.entries(base.bodyPlans).map(([plan, groups]) => [plan, [...groups, 'mind']])),
  actions: [...base.actions, writer, sitter],
})

const desk = WorldObject.parse({ id: 'desk', kind: 'desk', name: 'A desk', position: [10, 0, 10], model: { asset: 'nature/rock_largeA' }, unlocks: ['write'], reason: 'For ideas.' })

const ctx = (extra: Partial<PlanContext> = {}): PlanContext => ({
  pack,
  spotKinds: new Set(),
  objects: [desk],
  startMs: Date.parse('2026-11-03T12:00:00Z'),
  asleepAt: () => false,
  hourAt: () => 12,
  recent: [],
  ...extra,
})

const step = (verb: string, extra: Record<string, unknown> = {}) => PlanStep.parse({ verb, reason: 'I want to.', minutes: 10, ...extra })
const writeStep = () => step('write', { targetId: 'desk', topic: 'the sea' })
const reasons = (steps: PlanStep[], c = ctx()) => {
  const r = validatePlan(steps, c)
  return r.ok ? [] : r.reasons
}

describe('validatePlan: the creative limit', () => {
  it('accepts as many creative steps as it has room for', () => {
    expect(reasons([writeStep(), step('muse'), writeStep()], ctx({ creativeLeft: 2 }))).toEqual([])
  })

  it('turns down a plan that would make more than the day has room for, and says how many', () => {
    const r = reasons([writeStep(), step('muse'), writeStep(), step('muse'), writeStep()], ctx({ creativeLeft: 2 }))
    expect(r).toHaveLength(1)
    expect(r[0]).toMatch(/3 things/)
    expect(r[0]).toMatch(/room for 2/)
  })

  it('turns down any creative step once the day is full', () => {
    expect(reasons([writeStep()], ctx({ creativeLeft: 0 }))[0]).toMatch(/room for 0/)
  })

  it('does not count steps that make nothing', () => {
    expect(reasons([step('muse'), step('muse')], ctx({ creativeLeft: 0 }))).toEqual([])
  })

  it('has no limit when none is given', () => {
    expect(reasons([writeStep(), step('muse'), writeStep(), step('muse'), writeStep()], ctx())).toEqual([])
  })
})
