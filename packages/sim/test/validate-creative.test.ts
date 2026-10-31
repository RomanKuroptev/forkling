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
const snapper = {
  id: 'snap',
  group: 'mind',
  effect: 'create',
  artifact: 'photo',
  target: { type: 'object' },
  slot: 'idle',
  durationSec: [5, 9],
  satisfies: {},
  reason: 'I want to keep this.',
}
const coder = {
  id: 'code',
  group: 'mind',
  effect: 'create',
  artifact: 'code',
  target: { type: 'object', unlocked: true },
  slot: 'idle',
  durationSec: [5, 9],
  satisfies: {},
  reason: 'I want to make something that runs.',
}
const sitter = { id: 'muse', group: 'body', target: { type: 'none' }, slot: 'sit', durationSec: [5, 9], satisfies: {}, reason: 'Thinking.' }

const base = makerJson as unknown as { bodyPlans: Record<string, string[]>; actions: unknown[] }
const pack = SpeciesPack.parse({
  ...makerJson,
  bodyPlans: Object.fromEntries(Object.entries(base.bodyPlans).map(([plan, groups]) => [plan, [...groups, 'mind']])),
  actions: [...base.actions, writer, snapper, coder, sitter],
})

const desk = WorldObject.parse({ id: 'desk', kind: 'desk', name: 'A desk', position: [10, 0, 10], model: { asset: 'nature/rock_largeA' }, unlocks: ['write', 'code'], reason: 'For ideas.' })

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
const codeStep = () => step('code', { targetId: 'desk', topic: 'a toy' })
const snapStep = () => step('snap', { targetId: 'desk' })
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

describe('validatePlan: the photo limit', () => {
  it('accepts as many photographs as it has frames left', () => {
    expect(reasons([snapStep(), step('muse'), snapStep()], ctx({ photosLeft: 2 }))).toEqual([])
  })

  it('turns down a plan with more photographs than frames, and says how many', () => {
    const r = reasons([snapStep(), step('muse'), snapStep(), step('muse'), snapStep()], ctx({ photosLeft: 2 }))
    expect(r).toHaveLength(1)
    expect(r[0]).toMatch(/3 photographs/)
    expect(r[0]).toMatch(/2 frames/)
  })

  it('does not spend the creative limit on a photograph, nor the photo limit on a poem', () => {
    expect(reasons([snapStep()], ctx({ creativeLeft: 0, photosLeft: 1 }))).toEqual([])
    expect(reasons([writeStep()], ctx({ creativeLeft: 1, photosLeft: 0 }))).toEqual([])
  })

  it('has no limit when none is given', () => {
    expect(reasons([snapStep(), step('muse'), snapStep()], ctx())).toEqual([])
  })
})

describe('validatePlan: the coding limit', () => {
  it('accepts as many coded projects as the week has room for', () => {
    expect(reasons([codeStep(), step('muse')], ctx({ codeLeft: 1 }))).toEqual([])
  })

  it('turns down a plan with more projects than there is room for, and says how many', () => {
    const r = reasons([codeStep(), step('muse'), codeStep()], ctx({ codeLeft: 1 }))
    expect(r).toHaveLength(1)
    expect(r[0]).toMatch(/2 coded projects/)
    expect(r[0]).toMatch(/room for 1/)
  })

  it('turns down any coding when the week is full', () => {
    expect(reasons([codeStep()], ctx({ codeLeft: 0 }))[0]).toMatch(/room for 0/)
  })

  it('does not spend the creative or photo limits on code, nor the code limit on a poem', () => {
    expect(reasons([codeStep()], ctx({ creativeLeft: 0, photosLeft: 0, codeLeft: 1 }))).toEqual([])
    expect(reasons([writeStep()], ctx({ codeLeft: 0 }))).toEqual([])
  })

  it('has no limit when none is given', () => {
    expect(reasons([codeStep(), step('muse'), codeStep()], ctx())).toEqual([])
  })
})
