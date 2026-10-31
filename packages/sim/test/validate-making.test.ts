import { describe, expect, it } from 'vitest'
import { PlanStep, SpeciesPack, WorldObject } from '@forkling/schema'
import makerJson from './fixtures/maker.species.json'
import { validatePlan, type PlanContext } from '../src/validate.ts'

const pack = SpeciesPack.parse(makerJson)
const T0 = '2026-10-30T12:00:00Z'

const obj = (extra: Record<string, unknown> = {}) =>
  WorldObject.parse({
    id: 'thing',
    kind: 'thing',
    name: 'A thing',
    position: [10, 0, 10],
    model: { asset: 'nature/rock_largeA' },
    reason: 'Because.',
    ...extra,
  })

const objects = [
  obj({ id: 'driftwood', yields: { material: 'wood', max: 3, respawnHours: 24 } }),
  obj({ id: 'pebbles', yields: { material: 'stone', max: 6, respawnHours: 24 } }),
  obj({ id: 'house', properties: { storage: true }, unlocks: ['open', 'close'] }),
  obj({ id: 'workbench', unlocks: ['build'] }),
  obj({ id: 'plot', unlocks: ['plant'] }),
  obj({ id: 'bed' }),
]

const ctx = (extra: Partial<PlanContext> = {}): PlanContext => ({
  pack,
  spotKinds: new Set(),
  objects,
  startMs: Date.parse(T0),
  asleepAt: () => false,
  hourAt: () => 12,
  recent: [],
  ...extra,
})

const step = (verb: string, extra: Record<string, unknown> = {}) => PlanStep.parse({ verb, reason: 'I want to.', minutes: 10, ...extra })
const reasons = (steps: PlanStep[], c = ctx()) => {
  const r = validatePlan(steps, c)
  return r.ok ? [] : r.reasons
}

describe('validatePlan: plans that change the world', () => {
  it('accepts gathering, putting away and building, because each step leaves what the next needs', () => {
    const plan = [
      step('pick_up', { targetId: 'driftwood' }),
      step('put_on', { targetId: 'house' }),
      step('pick_up', { targetId: 'driftwood' }),
      step('put_on', { targetId: 'house' }),
      step('build', { targetId: 'workbench', materials: ['wood', 'wood'], makes: 'a shelf' }),
    ]
    expect(reasons(plan)).toEqual([])
  })

  it('rejects building with materials it does not have, saying which', () => {
    const r = reasons([step('build', { targetId: 'workbench', materials: ['wood'], makes: 'a shelf' })])
    expect(r).toHaveLength(1)
    expect(r[0]).toMatch(/step 1 \("build"\).*wood/)
  })

  it('counts what it already holds and has stored when the plan starts', () => {
    const plan = [step('build', { targetId: 'workbench', materials: ['wood', 'stone'], makes: 'a hut' })]
    expect(reasons(plan, ctx({ holding: { material: 'stone' }, stored: { wood: 1 } }))).toEqual([])
  })

  it('rejects picking something up with full paws', () => {
    const r = reasons([step('pick_up', { targetId: 'driftwood' }), step('pick_up', { targetId: 'pebbles' })])
    expect(r.join(' ')).toMatch(/step 2.*paws are full/)
  })

  it('rejects carrying with empty paws', () => {
    expect(reasons([step('carry', { targetId: 'house' })]).join(' ')).toMatch(/paws are empty/)
  })

  it('rejects an object that cannot be used for the verb, and suggests one that can', () => {
    const r = reasons([step('build', { targetId: 'bed', materials: ['wood'], makes: 'x' })], ctx({ stored: { wood: 1 } }))
    expect(r.join(' ')).toMatch(/"bed".*build/)
    expect(r.join(' ')).toMatch(/workbench/)
  })

  it('rejects a step that needs a target and has none', () => {
    expect(reasons([step('pick_up')]).join(' ')).toMatch(/needs a target/)
  })

  it('rejects harvesting before anything has grown', () => {
    const plan = [
      step('plant', { targetId: 'plot', materials: ['produce'], makes: 'a bean' }),
      step('water', { targetId: 'a-bean' }),
      step('harvest', { targetId: 'a-bean' }),
    ]
    expect(reasons(plan, ctx({ stored: { produce: 1 } })).join(' ')).toMatch(/step 3.*not ripe/)
  })

  it('lets a plan continue what an earlier step started, by its name', () => {
    const plan = [
      step('build', { targetId: 'workbench', materials: ['stone', 'stone', 'stone', 'stone'], makes: 'a pebble cairn' }),
      step('build', { targetId: 'a-pebble-cairn' }),
    ]
    expect(reasons(plan, ctx({ stored: { stone: 4 } }))).toEqual([])
  })

  it('rejects continuing something that is already finished', () => {
    const plan = [
      step('build', { targetId: 'workbench', materials: ['stone'], makes: 'a pebble' }),
      step('build', { targetId: 'a-pebble' }),
    ]
    expect(reasons(plan, ctx({ stored: { stone: 1 } })).join(' ')).toMatch(/step 2/)
  })

  it('reports every step that cannot happen, not just the first', () => {
    const r = reasons([step('carry', { targetId: 'house' }), step('build', { targetId: 'bed', materials: ['wood'], makes: 'x' })])
    expect(r.length).toBeGreaterThanOrEqual(2)
  })

  it('treats a step that cannot happen as having done nothing, so later steps are judged on what is really there', () => {
    const r = reasons([step('build', { targetId: 'workbench', materials: ['wood'], makes: 'a shelf' }), step('build', { targetId: 'a-shelf' })])
    expect(r[0]).toMatch(/step 1/)
    expect(r.join(' ')).toMatch(/step 2.*no object "a-shelf"/)
  })
})

describe('validatePlan: fixation and unfinished work', () => {
  it('still turns down the same verb three times in a row', () => {
    const plan = [step('go_to', { targetId: 'house' }), step('go_to', { targetId: 'bed' }), step('go_to', { targetId: 'plot' })]
    expect(reasons(plan).join(' ')).toMatch(/"go_to" would be done more than 2 times/)
  })

  it('lets a third build session through when it carries on the same unfinished thing', () => {
    const unfinished = obj({
      id: 'a-pebble-cairn',
      made: { verb: 'build', materials: ['stone', 'stone', 'stone', 'stone'], skill: 0, sessions: 1, needed: 2, done: false, at: T0 },
    })
    const recent = [{ verb: 'build', targetId: 'workbench' }, { verb: 'build', targetId: 'workbench' }]
    expect(reasons([step('build', { targetId: 'a-pebble-cairn' })], ctx({ objects: [...objects, unfinished], recent }))).toEqual([])
  })
})

describe('validatePlan: the old rules still hold', () => {
  it('rejects a verb the pack does not have', () => {
    expect(reasons([step('fly')]).join(' ')).toMatch(/not something a maker can do/)
  })

  it('rejects a step with a position where it takes an object', () => {
    expect(reasons([step('go_to', { position: [1, 2] })]).join(' ')).toMatch(/takes no position/)
  })
})
