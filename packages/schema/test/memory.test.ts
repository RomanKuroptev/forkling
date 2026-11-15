import { describe, expect, it } from 'vitest'
import { Belief, MemorySlots, MindState, Reflection, StreamEntry, TimelineEntry } from '../src/index.ts'

const belief = {
  id: 'b1',
  statement: 'The pond is where good things happen.',
  confidence: 0.6,
  evidence: ['2026-11-03#4'],
  formedAt: '2026-11-03T21:00:00Z',
}

describe('StreamEntry', () => {
  it('parses an entry with a day-and-number id', () => {
    expect(StreamEntry.safeParse({ id: '2026-11-03#4', at: '2026-11-03T10:00:00Z', kind: 'step', text: 'Started cutting clay.' }).success).toBe(true)
  })

  it('rejects ids that are not a day and a number', () => {
    expect(StreamEntry.safeParse({ id: 'step-4', at: '2026-11-03T10:00:00Z', kind: 'step', text: 'x' }).success).toBe(false)
  })

  it('rejects a kind the stream does not know', () => {
    expect(StreamEntry.safeParse({ id: '2026-11-03#4', at: '2026-11-03T10:00:00Z', kind: 'dream', text: 'x' }).success).toBe(false)
  })
})

describe('TimelineEntry', () => {
  it('keeps the reason and the beliefs a step acted on', () => {
    const entry = { at: '2026-11-03T10:00:00Z', verb: 'sit', reason: 'The pond felt right.', beliefRefs: ['b1'] }
    expect(TimelineEntry.parse(entry)).toEqual(entry)
  })
})

describe('Belief', () => {
  it('starts active with an empty history', () => {
    const parsed = Belief.parse(belief)
    expect(parsed.status).toBe('active')
    expect(parsed.history).toEqual([])
  })

  it('keeps confidence between 0 and 1', () => {
    expect(Belief.safeParse({ ...belief, confidence: 1.2 }).success).toBe(false)
    expect(Belief.safeParse({ ...belief, confidence: -0.1 }).success).toBe(false)
  })

  it('needs evidence ids shaped like stream ids', () => {
    expect(Belief.safeParse({ ...belief, evidence: ['somewhere'] }).success).toBe(false)
  })
})

describe('Reflection and MemorySlots', () => {
  it('parses a reflection with paragraphs and belief operations', () => {
    const reflection = {
      journal: { title: 'A quiet day', paragraphs: [{ text: 'I sat by the pond.', refs: ['2026-11-03#4'] }] },
      beliefOps: [{ op: 'new', beliefId: null, statement: 'The pond is calm.', confidence: 0.5, evidence: ['2026-11-03#4'], why: 'I felt calm there.' }],
    }
    expect(Reflection.parse(reflection)).toEqual(reflection)
  })

  it('parses memory slots', () => {
    expect(MemorySlots.parse({ slots: [{ title: 'Running jokes', text: 'The tall rock is my enemy.' }] }).slots).toHaveLength(1)
  })
})

describe('MindState memory fields (spec 9.4)', () => {
  it('defaults to no sleep rewrite waiting and none sent yet', () => {
    const state = MindState.parse({})
    expect(state.sleepRewrite).toBeNull()
    expect(state.lastRewriteDate).toBeUndefined()
  })
  it('holds a batch that is waiting, and one that is cancelled and waits for a normal call', () => {
    const waiting = { id: 'batch-1', date: '2026-11-12', submittedAt: '2026-11-12T22:30:00Z', polledAt: '2026-11-12T22:35:00Z' }
    expect(MindState.parse({ sleepRewrite: waiting }).sleepRewrite).toEqual(waiting)
    expect(MindState.parse({ sleepRewrite: { ...waiting, id: null, triedAt: '2026-11-13T07:05:00Z' } }).sleepRewrite?.id).toBeNull()
  })
  it('still reads a state file from before: the pet-era batch fields are ignored, not an error', () => {
    const old = MindState.parse({ memoryBatch: { id: 'x', date: '2026-11-03' }, lastReflectDate: '2026-11-03', lastMemoryDate: '2026-11-03' })
    expect(old).not.toHaveProperty('memoryBatch')
    expect(old).not.toHaveProperty('lastReflectDate')
  })
})
