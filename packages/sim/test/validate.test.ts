import { describe, expect, it } from 'vitest'
import { SpeciesPack, WorldObject, type PlanStep } from '@forkling/schema'
import catJson from '../../../species/cat/species.json'
import { validatePlan, type PlanContext } from '../src/validate.ts'

const pack = SpeciesPack.parse(catJson)
const at = (iso: string) => Date.parse(iso)

const sunnyRock = WorldObject.parse({
  id: 'sunny-rock',
  kind: 'rock',
  name: 'The sunny rock',
  position: [5, 0, 22],
  model: { asset: 'nature/rock_largeA' },
  affordances: ['perch'],
  reason: 'Warm.',
})

const ctx: PlanContext = {
  pack,
  spotKinds: new Set(['sunbeam', 'perch', 'food']),
  objects: [sunnyRock],
  hourAt: (ms) => (new Date(ms).getUTCHours() + 1) % 24,
  // 10:00 Stockholm on a Tuesday: awake, daytime.
  startMs: at('2026-11-03T09:00:00Z'),
  asleepAt: (ms) => ms < at('2026-11-03T06:00:00Z') || ms >= at('2026-11-03T22:00:00Z'),
  recent: [],
}

const step = (over: Partial<PlanStep> = {}): PlanStep => ({ verb: 'explore', reason: 'Unseen ground.', minutes: 20, ...over })
const reasons = (steps: PlanStep[], c: PlanContext = ctx) => {
  const r = validatePlan(steps, c)
  return r.ok ? [] : r.reasons
}

describe('validatePlan', () => {
  it('accepts a plan that uses the pack verbs and real targets', () => {
    const plan = [step({ verb: 'watch', targetId: 'sunny-rock' }), step({ verb: 'go_to', targetId: 'sunny-rock', minutes: 10 }), step({ verb: 'nap', targetId: 'sunbeam', minutes: 40 })]
    expect(validatePlan(plan, ctx)).toEqual({ ok: true })
  })

  it('rejects a verb the species does not have', () => {
    expect(reasons([step({ verb: 'fish' })])).toEqual([expect.stringContaining('"fish"')])
  })

  it('rejects a target that is not in the world', () => {
    expect(reasons([step({ verb: 'watch', targetId: 'moon' })])).toEqual([expect.stringContaining('"moon"')])
  })

  it('rejects a target on a verb that goes nowhere in particular', () => {
    expect(reasons([step({ verb: 'sit', targetId: 'sunny-rock' })])).toEqual([expect.stringContaining('sit')])
  })

  it('rejects a position on a verb that does not wander', () => {
    expect(reasons([step({ verb: 'eat', position: [3, 4] })])).toEqual([expect.stringContaining('eat')])
    expect(reasons([step({ verb: 'explore', position: [3, 4] })])).toEqual([])
  })

  it('rejects an object that cannot be used that way', () => {
    expect(reasons([step({ verb: 'eat', targetId: 'sunny-rock' })])).toEqual([expect.stringContaining('sunny-rock')])
  })

  it('rejects a visitor target when the verb is not about visitors', () => {
    expect(reasons([step({ verb: 'watch', targetId: 'visitor' })])).toEqual([expect.stringContaining('visitor')])
  })

  it('rejects a step that cannot happen at the time it would run', () => {
    // 20 minutes of exploring, then a nap that starts after bedtime would be 'night' only.
    const lateCtx = { ...ctx, startMs: at('2026-11-03T21:50:00Z') }
    expect(reasons([step({ minutes: 20 }), step({ verb: 'nap', targetId: 'sunbeam' })], lateCtx)).toEqual([expect.stringContaining('step 2')])
  })

  it('rejects a verb only possible with a visitor around', () => {
    expect(reasons([step({ verb: 'follow', targetId: 'visitor' })])).toEqual([expect.stringContaining('follow')])
  })

  it('rejects repeating the same verb too often in a row', () => {
    const same = [step(), step(), step()]
    expect(reasons(same)).toEqual([expect.stringContaining('explore')])
    expect(reasons([step(), step(), step({ verb: 'pounce' })])).toEqual([])
  })

  it('counts earlier steps from before the plan', () => {
    const recent = [{ verb: 'explore' }, { verb: 'explore' }]
    expect(reasons([step()], { ...ctx, recent })).toEqual([expect.stringContaining('explore')])
  })

  it('rejects the same target too often in a row', () => {
    const p = (verb: string) => step({ verb, targetId: 'sunny-rock' })
    expect(reasons([p('watch'), p('watch'), p('watch'), p('watch')])).not.toEqual([])
  })

  it('rejects an empty plan, too many steps, and a plan that runs past the day', () => {
    expect(reasons([])).not.toEqual([])
    expect(reasons(Array.from({ length: 13 }, (_, i) => step({ verb: i % 2 ? 'pounce' : 'explore' })))).not.toEqual([])
    const long = ['explore', 'pounce', 'explore', 'pounce', 'explore'].map((verb) => step({ verb, minutes: 240 }))
    expect(reasons(long)).toContainEqual(expect.stringContaining('day'))
  })

  it('reports every problem, not only the first', () => {
    expect(reasons([step({ verb: 'fish' }), step({ verb: 'watch', targetId: 'moon' })])).toHaveLength(2)
  })
})
