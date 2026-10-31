import { describe, expect, it } from 'vitest'
import type { Belief, Reflection } from '@forkling/schema'
import { checkReflection } from '../src/claims.ts'

const ids = new Set(['2026-11-03#1', '2026-11-03#2', '2026-11-03#3'])

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
})
