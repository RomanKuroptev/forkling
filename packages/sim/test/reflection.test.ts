import { describe, expect, it } from 'vitest'
import { Forkling, Goals, MindState, ReflectionAnswer, StreamEntry } from '@forkling/schema'
import { MAX_INSIGHTS, MAX_QUESTIONS, checkInsights, wantEditsFrom } from '../src/reflection.ts'
import { scoreSurprise, type SurpriseInput } from '../src/surprise.ts'

const stream = [
  { id: '2026-11-12#1', kind: 'made' as const, at: '2026-11-12T10:00:00Z' },
  { id: '2026-11-12#2', kind: 'thought' as const, at: '2026-11-12T10:01:00Z' },
  { id: '2026-11-12#3', kind: 'rejected' as const, at: '2026-11-12T10:02:00Z' },
  { id: '2026-11-12#4', kind: 'reflection' as const, at: '2026-11-12T10:03:00Z' },
  { id: '2026-11-12#5', kind: 'event' as const, at: '2026-11-12T10:04:00Z' },
]

describe('checkInsights (spec 9.3: each cites the stream items it rests on)', () => {
  it('keeps an insight that cites things that happened', () => {
    const r = checkInsights([{ text: 'I keep going back to the fog.', cites: ['2026-11-12#1', '2026-11-12#5'] }], stream)
    expect(r.kept).toEqual([{ text: 'I keep going back to the fog.', cites: ['2026-11-12#1', '2026-11-12#5'] }])
    expect(r.dropped).toEqual([])
  })
  it('drops an insight that cites nothing', () => {
    const r = checkInsights([{ text: 'A feeling.', cites: [] }], stream)
    expect(r.kept).toEqual([])
    expect(r.dropped[0]).toMatch(/cites nothing/)
  })
  it('drops an insight that cites something that is not in the stream it was shown', () => {
    const r = checkInsights([{ text: 'Made up.', cites: ['2026-11-12#1', '2026-11-12#99'] }], stream)
    expect(r.kept).toEqual([])
    expect(r.dropped[0]).toMatch(/did not happen/)
  })
  it('drops an insight that rests only on its own thoughts, rejected plans, triggers or earlier reflections', () => {
    for (const cites of [['2026-11-12#2'], ['2026-11-12#3'], ['2026-11-12#4'], ['2026-11-12#2', '2026-11-12#4']]) {
      expect(checkInsights([{ text: 'Only me.', cites }], stream).kept, cites.join()).toEqual([])
    }
  })
  it('lets an insight build on an earlier one when something that happened stands beside it', () => {
    expect(checkInsights([{ text: 'Again.', cites: ['2026-11-12#4', '2026-11-12#1'] }], stream).kept).toHaveLength(1)
  })
  it('cuts the text to 200 characters, drops a blank one, and takes at most 5', () => {
    expect(MAX_INSIGHTS).toBe(5)
    const long = checkInsights([{ text: 'x'.repeat(300), cites: ['2026-11-12#1'] }], stream)
    expect(long.kept[0]!.text).toHaveLength(200)
    expect(checkInsights([{ text: '   ', cites: ['2026-11-12#1'] }], stream).kept).toEqual([])
    const six = Array.from({ length: 6 }, (_, i) => ({ text: `insight ${i}`, cites: ['2026-11-12#1'] }))
    const r = checkInsights(six, stream)
    expect(r.kept).toHaveLength(5)
    expect(r.dropped).toHaveLength(1)
  })
  it('keeps at most 6 cites, each once', () => {
    const r = checkInsights([{ text: 'Many.', cites: ['2026-11-12#1', '2026-11-12#1', '2026-11-12#5'] }], stream)
    expect(r.kept[0]!.cites).toEqual(['2026-11-12#1', '2026-11-12#5'])
  })
  it('takes at most 3 questions in the answer shape', () => expect(MAX_QUESTIONS).toBe(3))
})

describe('wantEditsFrom (the flat answer shape becomes edits)', () => {
  const raw = (over: object) => ({ op: 'add', kind: null, text: null, why: null, id: null, ids: null, ...over }) as never
  it('turns each op into an edit', () => {
    const r = wantEditsFrom([
      raw({ op: 'add', kind: 'project', text: 'Map the fog', why: 'It returns.' }),
      raw({ op: 'drop', id: 'w2' }),
      raw({ op: 'reorder', ids: ['w3', 'w1'] }),
    ])
    expect(r.edits).toEqual([
      { op: 'add', kind: 'project', text: 'Map the fog', why: 'It returns.' },
      { op: 'drop', id: 'w2' },
      { op: 'reorder', ids: ['w3', 'w1'] },
    ])
    expect(r.rejected).toEqual([])
  })
  it('turns down an edit with a missing part', () => {
    const r = wantEditsFrom([raw({ op: 'add', kind: 'project', text: null, why: 'x' }), raw({ op: 'add', kind: null, text: 'x', why: 'y' }), raw({ op: 'drop', id: null }), raw({ op: 'reorder', ids: null })])
    expect(r.edits).toEqual([])
    expect(r.rejected).toHaveLength(4)
  })
})

describe('the reflection answer shape', () => {
  it('parses an answer with nothing to say', () => {
    expect(ReflectionAnswer.safeParse({ questions: [], insights: [], beliefOps: [], wants: [], planNoLongerFits: null, page: null }).success).toBe(true)
  })
  it('has no field Merge could use to name its own importance or its own trigger', () => {
    expect(Object.keys(ReflectionAnswer.shape).sort()).toEqual(['beliefOps', 'insights', 'page', 'planNoLongerFits', 'questions', 'wants'])
  })
})

describe('a stream entry that cites (spec 9.3)', () => {
  it('holds up to 6 cites and a fixed importance', () => {
    const e = { id: '2026-11-12#6', at: '2026-11-12T10:05:00Z', kind: 'reflection', text: 'Fog again.', importance: 5, cites: ['2026-11-12#1'] }
    expect(StreamEntry.safeParse(e).success).toBe(true)
    expect(StreamEntry.safeParse({ ...e, cites: Array(7).fill('2026-11-12#1') }).success).toBe(false)
    expect(StreamEntry.safeParse({ ...e, cites: ['nonsense'] }).success).toBe(false)
  })
})

describe('the reflected trigger (spec 2.3)', () => {
  const forkling = Forkling.parse({ name: 'Merge', species: 'cat', seed: 5, needs: { hunger: 70, energy: 80, curiosity: 60 }, position: [0, 0, 0], mood: 'content', intention: { type: 'lounge', startedAt: '2026-11-03T09:50:00Z', seed: 1, reason: 'Resting.' }, lastTickAt: '2026-11-03T09:50:00Z', timezone: 'Europe/Stockholm' })
  const planned = Goals.parse({
    today: { date: '2026-11-03', steps: [{ verb: 'rest', reason: 'Rest.', minutes: 30 }], reason: 'A day.' },
    now: { index: 0, startedAt: '2026-11-03T09:40:00Z', until: '2026-11-03T10:10:00Z' },
  })
  const calm: SurpriseInput = { forkling, goals: planned, mindState: MindState.parse({ lastPlanDate: '2026-11-03' }), nowMs: Date.parse('2026-11-03T10:00:00Z'), asleep: false }
  const withPending = (reason: string): SurpriseInput => ({ ...calm, mindState: MindState.parse({ lastPlanDate: '2026-11-03', reflect: { sum: 0, lastAt: null, date: '', today: 0, pending: { reason } } }) })

  it('is quiet with nothing pending', () => expect(scoreSurprise(calm)).toEqual([]))
  it('fires while a reflection that changed the wants or the plan is waiting, with its reason', () => {
    const t = scoreSurprise(withPending('the plan no longer fits: the fog is thicker than I thought'))
    expect(t.map((x) => x.kind)).toEqual(['reflected'])
    expect(t[0]!.detail).toContain('the fog is thicker')
  })
  it('never wakes the mind while asleep', () => {
    expect(scoreSurprise({ ...withPending('x'), asleep: true })).toEqual([])
  })
})

describe('the note trigger (spec 2.3: a note found, once every 30 minutes)', () => {
  const forkling = Forkling.parse({ name: 'Merge', species: 'cat', seed: 5, needs: { hunger: 70, energy: 80, curiosity: 60 }, position: [0, 0, 0], mood: 'content', intention: { type: 'lounge', startedAt: '2026-11-03T09:50:00Z', seed: 1, reason: 'Resting.' }, lastTickAt: '2026-11-03T09:50:00Z', timezone: 'Europe/Stockholm' })
  const planned = Goals.parse({
    today: { date: '2026-11-03', steps: [{ verb: 'rest', reason: 'Rest.', minutes: 30 }], reason: 'A day.' },
    now: { index: 0, startedAt: '2026-11-03T09:40:00Z', until: '2026-11-03T10:10:00Z' },
  })
  const NOW = Date.parse('2026-11-03T10:00:00Z')
  const input = (mind: Record<string, unknown>, over: Partial<SurpriseInput> = {}): SurpriseInput => ({ forkling, goals: planned, mindState: MindState.parse({ lastPlanDate: '2026-11-03', ...mind }), nowMs: NOW, asleep: false, ...over })

  it('is quiet with no note waiting', () => expect(scoreSurprise(input({}))).toEqual([]))

  it('fires for notes that were found and not yet seen by a decide call, saying how many and nothing a visitor wrote', () => {
    const t = scoreSurprise(input({ notesWaiting: ['n-2026-11-03-aaaaaa', 'n-2026-11-03-bbbbbb'] }))
    expect(t.map((x) => x.kind)).toEqual(['note'])
    expect(t[0]!.detail).toBe('2 new notes were found')
    expect(scoreSurprise(input({ notesWaiting: ['n-1'] }))[0]!.detail).toBe('a new note was found')
  })

  it('waits 30 minutes after the last time it fired', () => {
    const at = (min: number) => new Date(NOW - min * 60_000).toISOString()
    expect(scoreSurprise(input({ notesWaiting: ['n-1'], lastNoteTriggerAt: at(29) }))).toEqual([])
    expect(scoreSurprise(input({ notesWaiting: ['n-1'], lastNoteTriggerAt: at(30) })).map((x) => x.kind)).toEqual(['note'])
  })

  it('never wakes the mind while asleep', () => {
    expect(scoreSurprise(input({ notesWaiting: ['n-1'] }, { asleep: true }))).toEqual([])
  })
})
