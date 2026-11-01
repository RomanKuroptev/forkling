import { describe, expect, it } from 'vitest'
import type { Belief, Reflection, StreamKind } from '@forkling/schema'
import { checkReflection, type EvidenceEntry } from '../src/claims.ts'

/** What happened today, as the stream has it: what was done, when, and what kind of entry it is. */
const entry = (n: number, kind: StreamKind = 'step', at = `2026-11-03T1${n}:00:00Z`): EvidenceEntry => ({ id: `2026-11-03#${n}`, kind, at })
const ids = [entry(1), entry(2), entry(3)]

const belief: Belief = {
  id: 'b1',
  statement: 'The pond is calm.',
  confidence: 0.5,
  evidence: [],
  formedAt: '2026-11-02T20:00:00Z',
  status: 'active',
  history: [],
}

const reflection = (over: Partial<Reflection> = {}): Reflection => ({
  journal: { title: 'A day', paragraphs: [{ text: 'I cut clay.', refs: ['2026-11-03#1'] }] },
  beliefOps: [],
  ...over,
})

describe('checkReflection', () => {
  it('passes a reflection whose every claim points at something that happened', () => {
    const r = checkReflection(reflection(), ids, [belief])
    expect(r.dropped).toEqual([])
    expect(r.reflection.journal.paragraphs).toHaveLength(1)
    expect(r.retry).toBe(false)
  })

  it('drops a paragraph that cites nothing, and one that cites an entry that does not exist', () => {
    const r = checkReflection(
      reflection({
        journal: {
          title: 'A day',
          paragraphs: [
            { text: 'I cut clay.', refs: ['2026-11-03#1'] },
            { text: 'I flew to the moon.', refs: [] },
            { text: 'I met a fox.', refs: ['2026-11-03#99'] },
          ],
        },
      }),
      ids,
      [belief],
    )
    expect(r.reflection.journal.paragraphs.map((p) => p.text)).toEqual(['I cut clay.'])
    expect(r.dropped).toHaveLength(2)
  })

  it('asks for another try when most paragraphs were made up', () => {
    const r = checkReflection(
      reflection({ journal: { title: 'A day', paragraphs: [{ text: 'a', refs: [] }, { text: 'b', refs: ['2026-11-03#99'] }, { text: 'c', refs: ['2026-11-03#1'] }] } }),
      ids,
      [belief],
    )
    expect(r.retry).toBe(true)
  })

  it('does not ask to retry when there was nothing to claim', () => {
    expect(checkReflection(reflection({ journal: { title: 'Quiet', paragraphs: [] } }), ids, []).retry).toBe(false)
  })

  it('removes evidence ids that are not in the stream, but keeps the belief if some evidence is real', () => {
    const r = checkReflection(
      reflection({ beliefOps: [{ op: 'new', beliefId: null, statement: 'Clay is calming.', confidence: 0.6, evidence: ['2026-11-03#2', '2026-11-03#77'], why: 'x' }] }),
      ids,
      [],
    )
    expect(r.reflection.beliefOps[0]!.evidence).toEqual(['2026-11-03#2'])
  })

  it('rejects a new or revised belief with no real evidence', () => {
    const r = checkReflection(
      reflection({
        beliefOps: [
          { op: 'new', beliefId: null, statement: 'Fish are friends.', confidence: 0.6, evidence: ['2026-11-03#77'], why: 'x' },
          { op: 'revise', beliefId: 'b1', statement: 'The pond is loud.', confidence: 0.6, evidence: [], why: 'x' },
        ],
      }),
      ids,
      [belief],
    )
    expect(r.reflection.beliefOps).toEqual([])
    expect(r.dropped).toHaveLength(2)
  })

  it('rejects operations on beliefs that do not exist or are already dropped', () => {
    const r = checkReflection(
      reflection({
        beliefOps: [
          { op: 'strengthen', beliefId: 'b9', statement: null, confidence: null, evidence: ['2026-11-03#1'], why: 'x' },
          { op: 'drop', beliefId: 'b2', statement: null, confidence: null, evidence: [], why: 'x' },
        ],
      }),
      ids,
      [belief, { ...belief, id: 'b2', status: 'dropped' }],
    )
    expect(r.reflection.beliefOps).toEqual([])
  })

  it('lets a drop or a weakening stand without new evidence', () => {
    const r = checkReflection(
      reflection({ beliefOps: [{ op: 'drop', beliefId: 'b1', statement: null, confidence: null, evidence: [], why: 'It never held.' }] }),
      ids,
      [belief],
    )
    expect(r.reflection.beliefOps).toHaveLength(1)
  })

  describe("what counts as evidence: the day's facts, not the mind's own words", () => {
    const strengthen = (evidence: string[]): Reflection => reflection({ beliefOps: [{ op: 'strengthen', beliefId: 'b1', statement: null, confidence: 0.7, evidence, why: 'again' }] })

    it('does not let a thought stand as evidence for a new belief', () => {
      const stream = [entry(1), entry(2, 'thought')]
      const r = checkReflection(reflection({ beliefOps: [{ op: 'new', beliefId: null, statement: 'I am clever.', confidence: 0.6, evidence: ['2026-11-03#2'], why: 'I said so' }] }), stream, [])
      expect(r.reflection.beliefOps).toEqual([])
      expect(r.dropped.join(' ')).toMatch(/no evidence/)
    })

    it('does not count a trigger or a turned down plan either: those are about the mind, not the world', () => {
      const stream = [entry(1), entry(2, 'trigger'), entry(3, 'rejected')]
      const r = checkReflection(reflection({ beliefOps: [{ op: 'new', beliefId: null, statement: 'x', confidence: 0.6, evidence: ['2026-11-03#2', '2026-11-03#3'], why: 'x' }] }), stream, [])
      expect(r.reflection.beliefOps).toEqual([])
    })

    it('keeps a belief that has one real entry among thoughts', () => {
      const stream = [entry(1), entry(2, 'thought')]
      const r = checkReflection(reflection({ beliefOps: [{ op: 'new', beliefId: null, statement: 'The rock is warm.', confidence: 0.6, evidence: ['2026-11-03#1', '2026-11-03#2'], why: 'x' }] }), stream, [])
      expect(r.reflection.beliefOps[0]!.evidence).toEqual(['2026-11-03#1'])
    })

    it('strengthens a belief only on something that happened after it last changed', () => {
      const fresh = [entry(1, 'step', '2026-11-03T10:00:00Z')]
      expect(checkReflection(strengthen(['2026-11-03#1']), fresh, [belief]).reflection.beliefOps).toHaveLength(1)
      // The belief was formed the evening before; an entry from before that is not new.
      const old = [entry(1, 'step', '2026-11-02T18:00:00Z')]
      const r = checkReflection(strengthen(['2026-11-03#1']), old, [belief])
      expect(r.reflection.beliefOps).toEqual([])
      expect(r.dropped.join(' ')).toMatch(/strengthen .* no new evidence/)
    })

    it('measures "new" from the last revision when there was one', () => {
      const revised = { ...belief, revisedAt: '2026-11-03T12:00:00Z' }
      const stream = [entry(1, 'step', '2026-11-03T10:00:00Z'), entry(2, 'step', '2026-11-03T13:00:00Z')]
      expect(checkReflection(strengthen(['2026-11-03#1']), stream, [revised]).reflection.beliefOps).toEqual([])
      expect(checkReflection(strengthen(['2026-11-03#2']), stream, [revised]).reflection.beliefOps).toHaveLength(1)
    })

    it('does not let a belief be strengthened by the mind talking about it', () => {
      const stream = [entry(1, 'thought', '2026-11-03T10:00:00Z')]
      expect(checkReflection(strengthen(['2026-11-03#1']), stream, [belief]).reflection.beliefOps).toEqual([])
    })

    it('still lets a belief be weakened or dropped with no evidence at all', () => {
      const r = checkReflection(
        reflection({ beliefOps: [{ op: 'weaken', beliefId: 'b1', statement: null, confidence: 0.3, evidence: [], why: 'x' }, { op: 'drop', beliefId: 'b1', statement: null, confidence: 0, evidence: [], why: 'x' }] }),
        ids,
        [belief],
      )
      expect(r.reflection.beliefOps).toHaveLength(2)
    })

    it('drops a journal paragraph that cites only what the mind said to itself', () => {
      const stream = [entry(1), entry(2, 'thought')]
      const r = checkReflection(
        reflection({ journal: { title: 'A day', paragraphs: [{ text: 'I thought a lot.', refs: ['2026-11-03#2'] }, { text: 'I cut clay and thought about it.', refs: ['2026-11-03#1', '2026-11-03#2'] }] } }),
        stream,
        [],
      )
      expect(r.reflection.journal.paragraphs.map((p) => p.text)).toEqual(['I cut clay and thought about it.'])
      expect(r.dropped.join(' ')).toMatch(/only its own thoughts/)
    })
  })
})
