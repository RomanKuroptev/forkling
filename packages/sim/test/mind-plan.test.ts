import { describe, expect, it } from 'vitest'
import { BUILD_HOLD_MINUTES, BUILD_START_POINTS, clampMinutes, MIND_VERBS, VERB_MINUTES, validateMindPlan, type MindPlanContext, type MindStep } from '../src/mind-plan.ts'

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
  used: { repliesToday: 0, foundThisWeek: 0 },
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

describe('the ten verbs', () => {
  it('are wander, tend, revisit, expand, found, tinker, write, reply, rest and build', () => {
    expect([...MIND_VERBS]).toEqual(['wander', 'tend', 'revisit', 'expand', 'found', 'tinker', 'write', 'reply', 'rest', 'build'])
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

  it('lets a step name no want, even with 3 wants, but still rejects a want that does not exist', () => {
    expect(reasons([wander({ wantId: null }), write({ wantId: null }), rest({ wantId: null })])).toEqual([])
    expect(reasons([wander({ wantId: 'w99' }), write(), rest()])).toEqual([expect.stringContaining('"w99"')])
  })

  it('accepts "long" as a reference to the long goal when there is one, and not when there is none', () => {
    expect(reasons([wander({ wantId: 'long' }), write(), rest()], ctx({ longGoal: true }))).toEqual([])
    expect(reasons([wander({ wantId: 'long' }), write(), rest()], ctx({ longGoal: false }))).toEqual([expect.stringContaining('"long"')])
    expect(reasons([wander({ wantId: 'long' }), write(), rest()])).toEqual([expect.stringContaining('"long"')])
  })

  it('lets tend, revisit and expand point at the place they care for instead of a want', () => {
    expect(reasons([wander(), tend({ wantId: null }), rest()])).toEqual([])
    expect(reasons([wander(), { ...tend({ wantId: null }), verb: 'revisit', target: 'workshop' }, rest()])).toEqual([])
  })

  it('never asks for a want, with few wants or none', () => {
    const young = ctx({ wants: [{ id: 'w1' }] })
    expect(reasons([wander({ wantId: null }), write({ wantId: null }), rest({ wantId: null })], young)).toEqual([])
    expect(reasons([wander({ wantId: null }), write({ wantId: null }), rest({ wantId: null })], ctx({ wants: [] }))).toEqual([])
    expect(reasons([wander({ wantId: 'w99' }), write({ wantId: 'w1' }), rest()], young)).toEqual([expect.stringContaining('"w99"')])
  })

  it('prices a plan with the prices in force when the context carries them (the weekly reset)', () => {
    const sketches = [wander(), { ...write(), verb: 'tinker', size: 'sketch', target: 'a lamp' } as MindStep, { ...write(), verb: 'tinker', size: 'sketch', target: 'a door' } as MindStep]
    // At 30 points each two sketches plus a trip cost 63; at 23 they cost 49.
    expect(reasons(sketches, ctx({ pointsInHand: 60 }))).toEqual([expect.stringContaining('costs 63 points')])
    expect(reasons(sketches, ctx({ pointsInHand: 60, prices: { fullWork: 150, expand: 50, expandEarned: 20, trip: 3, tend: 2, sketch: 23, found: 80, revisit: 1, caption: 1, page: 10, reply: 0, rest: 0 } }))).toEqual([])
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

  it('lets expand take only a place that may be expanded, and never the same place twice in a row', () => {
    const expand = (target: string): MindStep => ({ ...tend({ wantId: null }), verb: 'expand', target, minutes: 20 })
    const c = ctx({ expandable: new Set(['workshop']), pointsInHand: 200 })
    expect(reasons([wander(), expand('home'), rest()], c)).toEqual([expect.stringContaining('cannot be expanded')])
    expect(reasons([wander(), expand('workshop'), rest()], c)).toEqual([])
    expect(reasons([wander(), expand('workshop'), rest()], { ...c, lastExpandedPlace: 'workshop' })).toEqual([expect.stringContaining('twice in a row')])
  })

  it('lets found go when the rails hold (nothing founded is still being built, room in the world), and once a week', () => {
    const found: MindStep = { verb: 'found', target: 'The Lamp Room', reason: 'The lights keep pointing at each other.', minutes: 30, wantId: 'w1' }
    expect(reasons([wander(), found, rest()])).toEqual([expect.stringContaining('still being built')])
    expect(reasons([wander(), found, rest()], ctx({ canFound: true }))).toEqual([])
    expect(reasons([wander(), found, rest()], ctx({ canFound: true, used: { repliesToday: 0, foundThisWeek: 1 } }))).toEqual([expect.stringContaining('1 a week')])
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
    expect(reasons([wander(), reply('n1'), rest()], ctx({ used: { repliesToday: 5, foundThisWeek: 0 } }))).toEqual([expect.stringContaining('5 replies a day')])
    expect(reasons([reply('n1'), wander(), reply('n1'), write(), reply('n1')], ctx({ used: { repliesToday: 3, foundThisWeek: 0 } }))).toEqual([expect.stringContaining('5 replies a day')])
  })

  it('lets rest take no target, and prices a sketch instead of capping it (a wallet, not a schedule)', () => {
    expect(reasons([wander(), rest({ target: 'home' }), write()])).toEqual([expect.stringContaining('rest takes no target')])
    const sketch = (): MindStep => ({ verb: 'tinker', target: 'a loop', reason: 'Small and quick.', minutes: 60, wantId: 'w1', size: 'sketch' })
    expect(reasons([wander(), sketch(), rest()])).toEqual([])
    // Four sketches in one plan are allowed when the points are there, and refused when they are not: only the price limits them.
    const four = [sketch(), wander(), sketch(), write(), sketch(), rest(), sketch()]
    expect(reasons(four, ctx({ pointsInHand: 400 }))).toEqual([])
    expect(reasons(four, ctx({ pointsInHand: 100 }))).toEqual([expect.stringContaining('costs 133 points and you have 100 in hand')])
  })
})

describe('the allowance', () => {
  it('rejects a plan that costs more than the points in hand, and says how much', () => {
    const work: MindStep = { verb: 'tinker', target: 'a clock that is always early', reason: 'I want to make one properly.', minutes: 90, wantId: 'w1', size: 'full' }
    expect(reasons([wander(), work, rest()], ctx({ pointsInHand: 100 }))).toEqual([expect.stringMatching(/costs 153 points.*100 in hand/)])
    expect(reasons([wander(), work, rest()], ctx({ pointsInHand: 300 }))).toEqual([])
  })

  it('counts deep steps at 30 each', () => {
    const deepTends = [tend({ deep: true }), wander(), tend({ deep: true }), write(), tend({ deep: true }), rest()]
    expect(reasons(deepTends, ctx({ pointsInHand: 103 }))).toEqual([])
    expect(reasons(deepTends, ctx({ pointsInHand: 102 }))).toEqual([expect.stringContaining('costs 103 points')])
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

describe('the variety switches (spec 12.3), when Roman has turned them on', () => {
  const NOW = START
  const DAY = 86_400_000
  const lidarPage = (title: string, daysAgo: number, target: string | null = null) => ({
    at: new Date(NOW - daysAgo * DAY).toISOString(),
    title,
    target,
    text: `${title}. ${'I keep thinking about lidar and laser and canopy and elevation and ground, and what the laser does next. '.repeat(4)}`,
  })
  const pages = [lidarPage('What the laser found', 5), lidarPage('Height without the sky', 4), lidarPage('A height grid forgets', 2, 'Digital elevation model')]
  const topicOn = { sameTopicWrites: { limit: 3, days: 7, pages } }
  const lidarWrite = (over: Partial<MindStep> = {}) => write({ target: 'Airborne lidar', reason: 'What the laser keeps and drops', ...over })

  it('does nothing while a switch is off or missing', () => {
    expect(reasons([wander(), lidarWrite(), rest()], ctx())).toEqual([])
    expect(reasons([wander(), lidarWrite(), rest()], ctx({ variety: {} }))).toEqual([])
  })

  it('refuses a write that is a fourth on the same subject in 7 days, in words Merge can read', () => {
    const r = reasons([wander(), lidarWrite(), rest()], ctx({ variety: topicOn }))
    expect(r).toHaveLength(1)
    expect(r[0]).toMatch(/step 2: you have written about this 3 times in the last 7 days/)
    expect(r[0]).toMatch(/What the laser found/)
  })

  it('lets a write on another subject through, and lets the third one through', () => {
    expect(reasons([wander(), write({ target: 'Moss on old walls', reason: 'something soft' }), rest()], ctx({ variety: topicOn }))).toEqual([])
    expect(reasons([wander(), lidarWrite(), rest()], ctx({ variety: { sameTopicWrites: { limit: 3, days: 7, pages: pages.slice(0, 2) } } }))).toEqual([])
  })

  it('counts a write earlier in the same plan', () => {
    const two = pages.slice(0, 2)
    const steps = [lidarWrite({ target: 'Airborne lidar' }), wander(), lidarWrite({ target: 'Airborne lidar', reason: 'The laser again' }), rest()]
    const r = reasons(steps, ctx({ variety: { sameTopicWrites: { limit: 3, days: 7, pages: two } } }))
    expect(r.join('\n')).toMatch(/step 3: you have written about this 3 times/)
    expect(r.join('\n')).not.toMatch(/step 1:/)
  })

  it('refuses a third tinker in a row on the same work, and a different work resets it', () => {
    const tinker = (target: string): MindStep => ({ verb: 'tinker', target, reason: 'Sand again.', minutes: 60, wantId: 'w1', size: 'sketch' })
    const on = { sameWorkTinker: { limit: 2, recent: ['Grain under a low sun', 'Grain under a low sun, again'] } }
    expect(reasons([wander(), tinker('Grain under a low sun 3'), rest()], ctx({ variety: on })).join('\n')).toMatch(/step 2: you have made the same work 2 times in a row/)
    expect(reasons([wander(), tinker('A paper boat on a pond'), rest()], ctx({ variety: on }))).toEqual([])
    const mixed = { sameWorkTinker: { limit: 2, recent: ['Grain under a low sun', 'A paper boat on a pond'] } }
    expect(reasons([wander(), tinker('Grain under a low sun'), rest()], ctx({ variety: mixed }))).toEqual([])
  })

  it('counts tinkers earlier in the same plan', () => {
    const tinker = (target: string): MindStep => ({ verb: 'tinker', target, reason: 'Sand again.', minutes: 60, wantId: 'w1', size: 'sketch' })
    const on = { sameWorkTinker: { limit: 2, recent: ['Ripples breathing as one'] } }
    const r = reasons([tinker('Ripples breathing as one'), wander(), tinker('Ripples breathing as one, again'), rest()], ctx({ variety: on }))
    expect(r.join('\n')).toMatch(/step 3: you have made the same work 2 times in a row/)
  })
})

describe("one trip a day from a starting point (Roman's rule, not a switch)", () => {
  const door = 'https://en.wikipedia.org/wiki/Moon'
  const points = (takenToday = false) => ({ isPoint: (target: string) => target === door || target === 'https://esolangs.org/wiki/Befunge', takenToday })
  const fromPoint = wander({ target: door })
  const fromTopic = wander({ target: 'logic gates' })

  it('does nothing when no starting points are known (a replan with none offered)', () => {
    expect(reasons([fromTopic, write(), rest()], ctx())).toEqual([])
  })

  it('asks for a wander that starts from one of the starting points when none has yet today, and names the step', () => {
    const r = reasons([fromTopic, write(), rest()], ctx({ points: points() }))
    expect(r).toHaveLength(1)
    expect(r[0]).toMatch(/step 1: .*starting points/)
  })

  it('accepts the plan once any wander starts from one, in any position', () => {
    expect(reasons([fromTopic, write(), fromPoint], ctx({ points: points() }))).toEqual([])
    expect(reasons([fromPoint, write(), rest()], ctx({ points: points() }))).toEqual([])
  })

  it('asks for one when the plan has no wander at all', () => {
    const r = reasons([write(), rest(), write({ target: 'workshop' })], ctx({ points: points() }))
    expect(r.join('\n')).toMatch(/no wander.*starting points/)
  })

  it('is satisfied by a trip already taken today', () => {
    expect(reasons([fromTopic, write(), rest()], ctx({ points: points(true) }))).toEqual([])
    expect(reasons([write(), rest(), write({ target: 'workshop' })], ctx({ points: points(true) }))).toEqual([])
  })

  it('does not ask late in the day, when fewer than 3 hours are left', () => {
    const late = ctx({ points: points(), startMs: BED - 2 * HOUR })
    expect(reasons([write(), rest(), write({ target: 'workshop' })], late).join('\n')).not.toMatch(/starting points/)
  })
})

describe('a found note is answered the same day (spec 16), as a rule of the plan check', () => {
  const reply = (target: string): MindStep => ({ verb: 'reply', target, reason: 'It deserves an answer.', minutes: 10, wantId: 'w1' })
  const waiting = (...ids: string[]) => ctx({ notes: new Set(['n1', 'n2']), overdueNotes: new Set(ids) })

  it('does nothing when no note is overdue, or the check has no list', () => {
    expect(reasons([wander(), write(), rest()], waiting())).toEqual([])
    expect(reasons([wander(), write(), rest()], ctx())).toEqual([])
  })

  it('asks for a reply step to a note that has waited 3 hours, and names it', () => {
    const r = reasons([wander(), write(), rest()], waiting('n1'))
    expect(r).toEqual([expect.stringContaining('"n1" has waited')])
    expect(r[0]).toMatch(/reply, decline it with a reason, or keep it/)
  })

  it('is satisfied by a reply step to it, wherever it stands in the plan', () => {
    expect(reasons([wander(), write(), reply('n1')], waiting('n1'))).toEqual([])
    expect(reasons([reply('n1'), wander(), write()], waiting('n1'))).toEqual([])
  })

  it('names every note still unanswered', () => {
    const r = reasons([wander(), reply('n1'), rest()], waiting('n1', 'n2'))
    expect(r).toEqual([expect.stringContaining('"n2" has waited')])
  })

  it('does not ask in the last hour before bed, when a reply could not be fitted in, and the note waits for the morning', () => {
    expect(reasons([wander(), write(), rest()], ctx({ notes: new Set(['n1']), overdueNotes: new Set(['n1']), startMs: BED - 50 * 60_000 })).join(' ')).not.toMatch(/has waited/)
  })
})

describe('the price of an expand (spec v4 2.2)', () => {
  const expand: MindStep = { ...tend({ wantId: null }), verb: 'expand', target: 'workshop', minutes: 20 }
  const base = ctx({ expandable: new Set(['workshop']), pointsInHand: 55 })
  it('costs 50 unearned and 20 earned, and a plan short of points is refused with the points reason only', () => {
    // A wander costs 3.
    expect(reasons([wander(), expand, rest()], base)).toEqual([])
    expect(reasons([wander(), expand, rest()], { ...base, pointsInHand: 40 })).toEqual([expect.stringContaining('costs 53 points')])
    expect(reasons([wander(), expand, rest()], { ...base, pointsInHand: 40, expandEarned: new Set(['workshop']) })).toEqual([])
    expect(reasons([wander(), expand, rest()], { ...base, pointsInHand: 10, expandEarned: new Set(['workshop']) })).toEqual([expect.stringContaining('costs 23 points')])
  })
})

describe('build (spec-v4 3.2): a new project, or one that is building', () => {
  const projects = { building: [{ id: 'tide-clock', name: 'Tide clock' }], ended: [{ id: 'sand-clock', name: 'Sand clock' }] }
  const c = (over: Partial<MindPlanContext> = {}) => ctx({ pointsInHand: 400, projects, ...over })
  const build = (target: string | null, over: Partial<MindStep> = {}): MindStep => ({ verb: 'build', target, reason: 'I want the pool to fill with the hours.', minutes: 30, ...over })

  it('takes the id or the name of a project that is building, and a new name', () => {
    expect(reasons([wander(), build('tide-clock'), rest()], c())).toEqual([])
    expect(reasons([wander(), build('Tide clock'), rest()], c())).toEqual([])
    expect(reasons([wander(), build('A machine for clouds'), rest()], c())).toEqual([])
  })

  it('has no minute range: the plan holds while it runs, up to the 90-minute stop', () => {
    expect(VERB_MINUTES).not.toHaveProperty('build')
    expect(BUILD_HOLD_MINUTES).toBe(90)
    expect(clampMinutes('build', 10)).toBe(90)
    const r = validateMindPlan([wander(), build('tide-clock'), rest()], c())
    expect(r.ok && r.steps[1]!.minutes).toBe(90)
  })

  it('needs a target, and a new name of 3 to 40 characters', () => {
    expect(reasons([wander(), build(null), rest()], c())).toEqual([expect.stringContaining('build needs')])
    expect(reasons([wander(), build('ab'), rest()], c())).toEqual([expect.stringContaining('3 to 40')])
    expect(reasons([wander(), build('x'.repeat(41)), rest()], c())).toEqual([expect.stringContaining('3 to 40')])
  })

  it('refuses a project that is done or abandoned', () => {
    expect(reasons([wander(), build('sand-clock'), rest()], c())).toEqual([expect.stringContaining('no longer building')])
  })

  it('refuses a new project while 3 are building, counting the ones the plan starts', () => {
    const three = { building: [1, 2, 3].map((n) => ({ id: `p-${n}`, name: `Project ${n}` })), ended: [] }
    expect(reasons([wander(), build('a fourth one'), rest()], c({ projects: three }))).toEqual([expect.stringContaining('3 projects')])
    expect(reasons([wander(), build('p-2'), rest()], c({ projects: three }))).toEqual([])
    const two = { building: three.building.slice(0, 2), ended: [] }
    expect(reasons([build('one more'), wander(), build('and another'), rest()], c({ projects: two }))).toEqual([expect.stringContaining('3 projects')])
  })

  it('needs 300 points in hand', () => {
    expect(BUILD_START_POINTS).toBe(300)
    expect(reasons([wander(), build('tide-clock'), rest()], c({ pointsInHand: 299 }))).toEqual([expect.stringContaining('300 points')])
  })

  it('is a build verb: not when tired, and held while spending is ahead of the pace', () => {
    expect(reasons([wander(), build('tide-clock'), rest()], c({ mood: { mood: 0, energy: -0.6 } }))).toEqual([expect.stringContaining('too tired')])
    expect(reasons([wander(), build('tide-clock'), rest()], c({ paceAhead: true }))).toEqual([expect.stringContaining('pace')])
  })

  it('costs nothing up front: a session is metered as it runs', () => {
    expect(reasons([build('tide-clock'), wander(), rest()], c({ pointsInHand: 300 }))).toEqual([])
  })

  it('has no limit on build steps in a plan or a day', () => {
    expect(reasons([build('tide-clock'), wander(), build('tide-clock'), rest()], c())).toEqual([])
  })
})

describe('a write is a caption or a page in the price (spec v4 5.1)', () => {
  it('costs 1 for a caption (the target is a place or a work) and 10 for a page, and refuses on points only', () => {
    const caption = write({ target: 'home' })
    const page = write({ target: 'joke languages' })
    const c = ctx({ captionTargets: new Set(['home']), pointsInHand: 14 })
    // wander 3 + the write + rest 0
    expect(reasons([wander(), caption, rest()], c)).toEqual([])
    expect(reasons([wander(), page, rest()], c)).toEqual([])
    expect(reasons([wander(), page, rest()], { ...c, pointsInHand: 12 })).toEqual([expect.stringContaining('costs 13 points')])
    expect(reasons([wander(), caption, rest()], { ...c, pointsInHand: 3 })).toEqual([expect.stringContaining('costs 4 points')])
  })
})
