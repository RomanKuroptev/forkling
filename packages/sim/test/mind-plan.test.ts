import { describe, expect, it } from 'vitest'
import { clampMinutes, MIND_VERBS, VERB_MINUTES, validateMindPlan, type MindPlanContext, type MindStep } from '../src/mind-plan.ts'

const HOUR = 3_600_000
/** 10:00 in a world whose bed time is 23:00, so the last step may start at 22:15. */
const START = Date.UTC(2026, 10, 3, 10, 0, 0)
const BED = Date.UTC(2026, 10, 3, 23, 0, 0)

const ctx = (over: Partial<MindPlanContext> = {}): MindPlanContext => ({
  startMs: START,
  bedMs: BED,
  mood: { mood: 0, energy: 0.5 },
  pointsInHand: 150,
  places: new Set(['home', 'workshop']),
  revisitable: new Set(['workshop']),
  expandable: new Set(),
  canFound: false,
  notes: new Set(['n1']),
  wants: [{ id: 'w1' }, { id: 'w2' }, { id: 'w3' }],
  recent: [],
  used: { repliesToday: 0, sketchesToday: 0, foundThisWeek: 0 },
  lastExpandedPlace: null,
  ...over,
})

const rest = (over: Partial<MindStep> = {}): MindStep => ({ verb: 'rest', target: null, reason: 'I need a break.', minutes: 30, wantId: 'w1', ...over })
const wander = (over: Partial<MindStep> = {}): MindStep => ({ verb: 'wander', target: 'lighthouses', reason: 'I want to know what a keeper does.', minutes: 30, wantId: 'w1', ...over })
const tend = (over: Partial<MindStep> = {}): MindStep => ({ verb: 'tend', target: 'home', reason: 'The pile has grown.', minutes: 30, ...over })
const write = (over: Partial<MindStep> = {}): MindStep => ({ verb: 'write', target: 'home', reason: 'A plaque for the lamp.', minutes: 30, wantId: 'w2', ...over })

const plan = (n = 3, make: () => MindStep = rest) => Array.from({ length: n }, make)
// Three steps that never repeat a verb three times in a row.
const basic = [wander(), write(), rest()]

const reasons = (steps: MindStep[], c: MindPlanContext = ctx()) => {
  const r = validateMindPlan(steps, c)
  return r.ok ? [] : r.reasons
}

describe('the nine verbs', () => {
  it('are wander, tend, revisit, expand, found, tinker, write, reply and rest', () => {
    expect([...MIND_VERBS]).toEqual(['wander', 'tend', 'revisit', 'expand', 'found', 'tinker', 'write', 'reply', 'rest'])
  })

  it('have the durations in spec 2.4, and code clamps what the model chooses', () => {
    expect(VERB_MINUTES.wander).toEqual([20, 40])
    expect(VERB_MINUTES.tend).toEqual([20, 60])
    expect(VERB_MINUTES.revisit).toEqual([15, 30])
    expect(VERB_MINUTES.tinker).toEqual([60, 120])
    expect(VERB_MINUTES.write).toEqual([20, 45])
    expect(VERB_MINUTES.reply).toEqual([10, 10])
    expect(VERB_MINUTES.rest).toEqual([30, 90])
    expect(clampMinutes('wander', 5)).toBe(20)
    expect(clampMinutes('wander', 500)).toBe(40)
    expect(clampMinutes('rest', 45.4)).toBe(45)
    expect(clampMinutes('reply', 60)).toBe(10)
    expect(clampMinutes('write', Number.NaN)).toBe(20)
  })
})

describe('validateMindPlan', () => {
  it('accepts a plan of 3 to 8 steps and hands back the steps with their minutes clamped', () => {
    const r = validateMindPlan([wander({ minutes: 5 }), write({ minutes: 300 }), rest()], ctx())
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.steps.map((s) => s.minutes)).toEqual([20, 45, 30])
  })

  it('rejects fewer than 3 steps and more than 8', () => {
    expect(reasons([wander(), write()])).toEqual([expect.stringContaining('3 to 8 steps')])
    const nine = Array.from({ length: 9 }, (_, i) => (i % 2 ? write() : wander()))
    expect(reasons(nine)).toEqual([expect.stringContaining('3 to 8 steps')])
    expect(reasons(Array.from({ length: 8 }, (_, i) => (i % 2 ? write() : wander())))).toEqual([])
  })

  it('rejects a verb that is not one of the nine', () => {
    expect(reasons([wander(), { ...write(), verb: 'fish' as never }, rest()])).toEqual([expect.stringContaining('"fish"')])
  })

  it('rejects the same verb 3 times in a row, counting steps from before the plan', () => {
    expect(reasons([rest(), rest(), rest()])).toEqual([expect.stringContaining('rest')])
    expect(reasons([rest(), rest(), write(), rest()])).toEqual([])
    expect(reasons(basic, ctx({ recent: [{ verb: 'wander' }, { verb: 'wander' }] }))).toEqual([expect.stringContaining('wander')])
    expect(reasons(basic, ctx({ recent: [{ verb: 'wander' }, { verb: 'rest' }] }))).toEqual([])
  })

  it('rejects a missing reason, and one over 140 characters', () => {
    expect(reasons([wander(), write({ reason: '  ' }), rest()])).toEqual([expect.stringContaining('step 2: it has no reason')])
    expect(reasons([wander(), write({ reason: 'x'.repeat(141) }), rest()])).toEqual([expect.stringContaining('step 2: the reason is over 140 characters')])
    expect(reasons([wander(), write({ reason: 'x'.repeat(140) }), rest()])).toEqual([])
  })

  it('rejects a reason that points at no want, once there are 3 wants', () => {
    expect(reasons([wander({ wantId: null }), write(), rest()])).toEqual([expect.stringContaining('step 1: it serves no want')])
    expect(reasons([wander({ wantId: 'w99' }), write(), rest()])).toEqual([expect.stringContaining('"w99"')])
  })

  it('lets tend, revisit and expand point at the place they care for instead of a want', () => {
    expect(reasons([wander(), tend({ wantId: null }), rest()])).toEqual([])
    expect(reasons([wander(), { ...tend({ wantId: null }), verb: 'revisit', target: 'workshop' }, rest()])).toEqual([])
  })

  it('does not ask for a want while there are fewer than 3 (the cold start), so the first days are free', () => {
    const young = ctx({ wants: [{ id: 'w1' }] })
    expect(reasons([wander({ wantId: null }), write({ wantId: null }), rest({ wantId: null })], young)).toEqual([])
    expect(reasons([wander({ wantId: null }), write({ wantId: null }), rest({ wantId: null })], ctx({ wants: [] }))).toEqual([])
    // A made-up want is still wrong, and so is a step that sets none when 3 exist.
    expect(reasons([wander({ wantId: 'w99' }), write({ wantId: 'w1' }), rest()], young)).toEqual([expect.stringContaining('"w99"')])
  })

  it('rejects a step that starts in the 45 minutes before bed', () => {
    const late = ctx({ startMs: BED - 100 * 60_000 })
    // 30 minutes each: the third starts 60 minutes in, which is 40 minutes before bed.
    expect(reasons(basic, late)).toEqual([expect.stringContaining('step 3: it would start 40 minutes before bed')])
    expect(reasons(basic, ctx({ startMs: BED - 120 * 60_000 }))).toEqual([])
  })

  it('holds the plan to 4 steps and no expand, found or tinker when energy is under -0.5', () => {
    const tired = ctx({ mood: { mood: 0, energy: -0.6 }, canFound: true, expandable: new Set(['home']), pointsInHand: 450 })
    expect(reasons([wander(), write(), rest(), wander(), write()], tired)).toEqual([expect.stringContaining('at most 4 steps')])
    expect(reasons([wander(), write(), rest(), wander()], tired)).toEqual([])
    const build = (verb: MindStep['verb'], target: string) => reasons([wander(), { ...write(), verb, target } as MindStep, rest()], tired)
    expect(build('expand', 'home')).toEqual([expect.stringContaining('too tired')])
    expect(build('found', 'The Lamp Room')).toEqual([expect.stringContaining('too tired')])
    expect(build('tinker', 'a loop that never ends')).toEqual([expect.stringContaining('too tired')])
  })
})

describe('targets and conditions', () => {
  it('needs a place for tend, and a place that exists', () => {
    expect(reasons([wander(), tend({ target: 'attic' }), rest()])).toEqual([expect.stringContaining('"attic"')])
    expect(reasons([wander(), tend({ target: null }), rest()])).toEqual([expect.stringContaining('step 2: tend needs a place')])
  })

  it('lets revisit take only a place that has gone 7 days without care', () => {
    const revisit = (target: string): MindStep => ({ ...tend({ wantId: null }), verb: 'revisit', target, minutes: 20 })
    expect(reasons([wander(), revisit('home'), rest()])).toEqual([expect.stringContaining('has not gone 7 days')])
    expect(reasons([wander(), revisit('workshop'), rest()])).toEqual([])
  })

  it('lets expand take only a place whose interest has grown, and never the same place twice in a row', () => {
    const expand = (target: string): MindStep => ({ ...tend({ wantId: null }), verb: 'expand', target, minutes: 20 })
    const c = ctx({ expandable: new Set(['workshop']), pointsInHand: 200 })
    expect(reasons([wander(), expand('home'), rest()], c)).toEqual([expect.stringContaining('not ready to grow')])
    expect(reasons([wander(), expand('workshop'), rest()], c)).toEqual([])
    expect(reasons([wander(), expand('workshop'), rest()], { ...c, lastExpandedPlace: 'workshop' })).toEqual([expect.stringContaining('twice in a row')])
  })

  it('lets found go only when an interest has earned it, and once a week', () => {
    const found: MindStep = { verb: 'found', target: 'The Lamp Room', reason: 'The lights keep pointing at each other.', minutes: 30, wantId: 'w1' }
    expect(reasons([wander(), found, rest()])).toEqual([expect.stringContaining('no interest has earned a new place')])
    expect(reasons([wander(), found, rest()], ctx({ canFound: true }))).toEqual([])
    expect(reasons([wander(), found, rest()], ctx({ canFound: true, used: { repliesToday: 0, sketchesToday: 0, foundThisWeek: 1 } }))).toEqual([expect.stringContaining('1 a week')])
    expect(reasons([wander(), { ...found, target: 'ab' }, rest()], ctx({ canFound: true }))).toEqual([expect.stringContaining('3 to 40 characters')])
  })

  it('needs a topic for wander, an idea for tinker and something for write', () => {
    expect(reasons([wander({ target: null }), write(), rest()])).toEqual([expect.stringContaining('step 1: wander needs a topic')])
    expect(reasons([wander(), write({ target: null }), rest()])).toEqual([expect.stringContaining('step 2: write needs a place or a subject')])
    expect(reasons([wander(), { ...write(), verb: 'tinker', target: null, size: 'sketch' }, rest()])).toEqual([expect.stringContaining('step 2: tinker needs an idea')])
  })

  it('lets reply answer only a note that is waiting, with at most 5 replies a day', () => {
    const reply = (target: string): MindStep => ({ verb: 'reply', target, reason: 'They asked a fair question.', minutes: 10, wantId: 'w1' })
    expect(reasons([wander(), reply('n1'), rest()])).toEqual([])
    expect(reasons([wander(), reply('n9'), rest()])).toEqual([expect.stringContaining('"n9"')])
    expect(reasons([wander(), reply('n1'), rest()], ctx({ used: { repliesToday: 5, sketchesToday: 0, foundThisWeek: 0 } }))).toEqual([expect.stringContaining('5 replies a day')])
    expect(reasons([reply('n1'), wander(), reply('n1'), write(), reply('n1')], ctx({ used: { repliesToday: 3, sketchesToday: 0, foundThisWeek: 0 } }))).toEqual([expect.stringContaining('5 replies a day')])
  })

  it('lets rest take no target, and a sketch at most 3 a day', () => {
    expect(reasons([wander(), write(), rest({ target: 'home' })])).toEqual([expect.stringContaining('step 3: rest takes no target')])
    const sketch = (): MindStep => ({ verb: 'tinker', target: 'a loop', reason: 'Small and quick.', minutes: 60, wantId: 'w1', size: 'sketch' })
    expect(reasons([wander(), sketch(), rest()])).toEqual([])
    expect(reasons([sketch(), wander(), sketch()], ctx({ used: { repliesToday: 0, sketchesToday: 2, foundThisWeek: 0 } }))).toEqual([expect.stringContaining('3 sketches a day')])
  })
})

describe('the allowance', () => {
  it('rejects a plan that costs more than the points in hand, and says how much', () => {
    const work: MindStep = { verb: 'tinker', target: 'a clock that is always early', reason: 'I want to make one properly.', minutes: 90, wantId: 'w1', size: 'full' }
    expect(reasons([wander(), work, rest()], ctx({ pointsInHand: 150 }))).toEqual([expect.stringMatching(/costs 243 points.*150 in hand/)])
    expect(reasons([wander(), work, rest()], ctx({ pointsInHand: 300 }))).toEqual([])
  })

  it('counts deep steps at 30 each', () => {
    const deepTends = [tend({ deep: true }), wander(), tend({ deep: true }), write(), tend({ deep: true }), rest()]
    expect(reasons(deepTends, ctx({ pointsInHand: 94 }))).toEqual([])
    expect(reasons(deepTends, ctx({ pointsInHand: 93 }))).toEqual([expect.stringContaining('costs 94 points')])
  })
})

describe('every problem is reported, not only the first', () => {
  it('lists each reason with its step, for the next decide call to read', () => {
    const r = reasons([wander({ target: null }), write({ reason: '' }), rest({ target: 'home' })])
    expect(r).toHaveLength(3)
    expect(r[0]).toMatch(/^step 1/)
    expect(r[1]).toMatch(/^step 2/)
    expect(r[2]).toMatch(/^step 3/)
  })
})

describe('timing sanity', () => {
  it('uses the hour constant correctly', () => {
    expect(BED - START).toBe(13 * HOUR)
  })
})
