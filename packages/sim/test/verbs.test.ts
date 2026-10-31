import { describe, expect, it } from 'vitest'
import { PlanStep, SpeciesPack, WorldObject } from '@forkling/schema'
import makerJson from './fixtures/maker.species.json'
import { runHeadless, runPlan } from '../src/headless.ts'
import { initialNeeds } from '../src/needs.ts'
import { scoreActions } from '../src/utility.ts'
import { starterWorld, worldWithObjects } from '../src/starter.ts'

const pack = SpeciesPack.parse(makerJson)
const spawn = starterWorld().spawn
const T0 = Date.parse('2026-10-30T12:00:00Z')

const obj = (extra: Record<string, unknown> = {}) =>
  WorldObject.parse({
    id: 'thing',
    kind: 'thing',
    name: 'A thing',
    position: [spawn.x + 6, 0, spawn.z - 2],
    model: { parts: [{ shape: 'box', size: [0.3, 0.3, 0.3], at: [0, 0.15, 0], color: '#a67c52' }] },
    reason: 'Because.',
    ...extra,
  })

const at = (dx: number, dz: number) => [spawn.x + dx, 0, spawn.z + dz]
const driftwood = obj({ id: 'driftwood', position: at(6, -2), yields: { material: 'wood', max: 5, respawnHours: 24 } })
const house = obj({ id: 'house', position: at(-6, -3), properties: { storage: true }, unlocks: ['open'] })
const workbench = obj({ id: 'workbench', position: at(-3, -6), unlocks: ['build'] })

const step = (verb: string, extra: Record<string, unknown> = {}) => PlanStep.parse({ verb, reason: 'I want to.', minutes: 4, ...extra })

describe('what the utility AI will choose by itself', () => {
  const ctx = (spotKinds: string[], focusAction?: string) => ({
    visitorDistance: null,
    timeOfDay: 12,
    spotKinds: new Set(spotKinds),
    ...(focusAction ? { focusAction } : {}),
  })
  const ids = (spotKinds: string[], focusAction?: string) => scoreActions(initialNeeds(pack), pack, ctx(spotKinds, focusAction)).map((s) => s.action.id)

  it('never picks a verb that changes the world, because only the mind plans those', () => {
    const chosen = ids(['for:build', 'for:pick_up', 'for:cut', 'for:eat'])
    expect(chosen).not.toContain('build')
    expect(chosen).not.toContain('pick_up')
    expect(chosen).not.toContain('eat')
  })

  it('does consider one that is the current focus', () => {
    expect(ids(['for:build'], 'build')).toContain('build')
  })

  it('needs something for an object verb to go to', () => {
    expect(ids([])).not.toContain('go_to')
    expect(ids(['for:go_to'])).toContain('go_to')
  })
})

describe('focus in the body', () => {
  const world = worldWithObjects([driftwood, house, workbench])
  const run = (seconds: number, focus: { action: string; targetId?: string; until: number }, extra = {}) =>
    runHeadless({ pack, world, startHour: 12, seed: 5, seconds, focus, ...extra })

  it('takes a planned step as the thing to do, over and over, while it lasts', () => {
    const r = run(300, { action: 'go_to', targetId: 'house', until: 300 })
    const mine = r.targets.filter((t) => t === 'go_to:house')
    expect(mine.length).toBeGreaterThanOrEqual(4)
    expect(r.targets.slice(1).every((t) => t === 'go_to:house')).toBe(true)
  })

  it('goes to the object, not just near it', () => {
    const r = run(120, { action: 'go_to', targetId: 'workbench', until: 120 })
    const last = r.positions[r.positions.length - 1]!
    expect(Math.hypot(last.x - (spawn.x - 3), last.z - (spawn.z - 6))).toBeLessThan(5)
  })
})

describe('how the body carries itself', () => {
  const world = worldWithObjects([house])

  it('walks upright to a task and carries when its paws are full', () => {
    const upright = SpeciesPack.parse({
      ...makerJson,
      actions: makerJson.actions.map((a) => (a.id === 'go_to' ? { ...a, body: 'upright' } : a)),
    })
    const empty = runHeadless({ pack: upright, world, startHour: 12, seed: 5, seconds: 90, focus: { action: 'go_to', targetId: 'house', until: 90 } })
    const full = runHeadless({ pack: upright, world, startHour: 12, seed: 5, seconds: 90, holding: true, focus: { action: 'go_to', targetId: 'house', until: 90 } })
    expect(empty.slots.has('walkUpright')).toBe(true)
    expect(empty.slots.has('carry')).toBe(false)
    expect(full.slots.has('carry')).toBe(true)
  })

  it('still runs on all fours when a verb says to', () => {
    const run = SpeciesPack.parse({
      ...makerJson,
      bodyPlans: { quadruped: ['body'], upright: ['body', 'hands', 'making', 'growing'] },
      actions: makerJson.actions.map((a) => (a.id === 'go_to' ? { ...a, body: 'quadruped', gait: 'run' } : a)),
    })
    const r = runHeadless({ pack: run, world, startHour: 12, seed: 5, seconds: 60, holding: true, focus: { action: 'go_to', targetId: 'house', until: 60 } })
    expect(r.slots.has('run')).toBe(true)
  })
})

describe('runPlan: a day of making, end to end', () => {
  const plan = [
    step('pick_up', { targetId: 'driftwood' }),
    step('put_on', { targetId: 'house' }),
    step('pick_up', { targetId: 'driftwood' }),
    step('put_on', { targetId: 'house' }),
    step('build', { targetId: 'workbench', materials: ['wood', 'wood'], makes: 'a wooden shelf' }),
  ]
  const play = (seed: number, steps = plan) =>
    runPlan({ pack, seed, startMs: T0, steps, objects: [driftwood, house, workbench] })

  it('gathers, stores and builds, leaving a made thing with the step reason', () => {
    const r = play(5)
    expect(r.steps.map((s) => s.ok)).toEqual([true, true, true, true, true])
    const shelf = r.objects.find((o) => o.id === 'a-wooden-shelf')!
    expect(shelf.reason).toBe('I want to.')
    expect(shelf.made?.done).toBe(true)
    expect(r.stored).toEqual({})
    expect(r.holding).toBeUndefined()
    expect(r.objects.find((o) => o.id === 'driftwood')!.state.stock).toBe(3)
  })

  it('has the body at the right place for each step', () => {
    const r = play(5)
    const at = (i: number) => r.steps[i]!.position
    expect(Math.hypot(at(0).x - (spawn.x + 6), at(0).z - (spawn.z - 2))).toBeLessThan(5)
    expect(Math.hypot(at(1).x - (spawn.x - 6), at(1).z - (spawn.z - 3))).toBeLessThan(5)
    expect(Math.hypot(at(4).x - (spawn.x - 3), at(4).z - (spawn.z - 6))).toBeLessThan(5)
  })

  it('earns practice from the work', () => {
    const r = play(5)
    expect(r.skills.hands!.xp).toBe(16)
    expect(r.skills.making!.xp).toBe(4)
  })

  it('stops at the first step that cannot happen, and says why', () => {
    const r = play(5, [step('pick_up', { targetId: 'driftwood' }), step('pick_up', { targetId: 'driftwood' })])
    expect(r.steps.map((s) => s.ok)).toEqual([true, false])
    expect(r.steps[1]!.reason).toMatch(/paws are full/)
    expect(r.steps).toHaveLength(2)
  })

  it('is deterministic for a seed, and differs between seeds', () => {
    expect(play(5).objects).toEqual(play(5).objects)
    const a = play(5).objects.find((o) => o.id === 'a-wooden-shelf')!
    const b = play(6).objects.find((o) => o.id === 'a-wooden-shelf')!
    expect(a.model).not.toEqual(b.model)
  })
})
