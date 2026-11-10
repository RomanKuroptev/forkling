import { describe, expect, it } from 'vitest'
import { PlanStep, SpeciesPack, WorldObject } from '@forkling/schema'
import makerJson from './fixtures/maker.species.json'
import { runHeadless } from '../src/headless.ts'
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
  const ids = (spotKinds: string[], focusAction?: string) => scoreActions(pack, ctx(spotKinds, focusAction)).map((s) => s.action.id)

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
