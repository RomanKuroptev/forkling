import { describe, expect, it } from 'vitest'
import { MAX_ACTIVE_BELIEFS, type Belief, type BeliefOp } from '@forkling/schema'
import { applyBeliefOps, liveBeliefs } from '../src/beliefs.ts'

const NOW = '2026-11-03T21:30:00Z'

const belief = (over: Partial<Belief> = {}): Belief => ({
  id: 'b1',
  statement: 'The pond is where good things happen.',
  confidence: 0.5,
  evidence: ['2026-11-02#3'],
  formedAt: '2026-11-02T20:00:00Z',
  status: 'active',
  history: [],
  ...over,
})

const op = (over: Partial<BeliefOp>): BeliefOp => ({ op: 'new', beliefId: null, statement: null, confidence: null, evidence: [], why: 'because', ...over })

describe('applyBeliefOps', () => {
  it('adds a new belief with the next id, active, at the confidence given', () => {
    const next = applyBeliefOps([belief()], [op({ op: 'new', statement: 'Clay is calming.', confidence: 0.6, evidence: ['2026-11-03#2'] })], NOW)
    const added = next.find((b) => b.id === 'b2')
    expect(added).toMatchObject({ statement: 'Clay is calming.', confidence: 0.6, status: 'active', formedAt: NOW, evidence: ['2026-11-03#2'] })
  })

  it('starts a new belief at middling confidence when none is given', () => {
    const next = applyBeliefOps([], [op({ op: 'new', statement: 'Rain means quiet.' , evidence: ['2026-11-03#1'] })], NOW)
    expect(next[0]!.confidence).toBe(0.5)
    expect(next[0]!.id).toBe('b1')
  })

  it('strengthens with new evidence and records what it was before', () => {
    const next = applyBeliefOps([belief()], [op({ op: 'strengthen', beliefId: 'b1', evidence: ['2026-11-03#5'], why: 'Again it was good there.' })], NOW)
    const b = next[0]!
    expect(b.confidence).toBeGreaterThan(0.5)
    expect(b.evidence).toEqual(['2026-11-02#3', '2026-11-03#5'])
    expect(b.revisedAt).toBe(NOW)
    expect(b.history).toEqual([{ at: NOW, statement: 'The pond is where good things happen.', confidence: 0.5, why: 'Again it was good there.' }])
  })

  it('weakens, and lets go of a belief that falls too low', () => {
    const weak = applyBeliefOps([belief({ confidence: 0.2 })], [op({ op: 'weaken', beliefId: 'b1', why: 'The pond was empty.' })], NOW)
    expect(weak[0]!.confidence).toBeLessThan(0.2)
    expect(weak[0]!.status).toBe('dropped')
    const mild = applyBeliefOps([belief({ confidence: 0.8 })], [op({ op: 'weaken', beliefId: 'b1' })], NOW)
    expect(mild[0]!.status).toBe('active')
  })

  it('revises the wording, keeps the old one in history and marks it revised', () => {
    const next = applyBeliefOps([belief()], [op({ op: 'revise', beliefId: 'b1', statement: 'The pond is good only in the morning.', confidence: 0.55, why: 'Evening was dull.' })], NOW)
    const b = next[0]!
    expect(b.statement).toBe('The pond is good only in the morning.')
    expect(b.status).toBe('revised')
    expect(b.history[0]!.statement).toBe('The pond is where good things happen.')
  })

  it('drops a belief but keeps it in the file', () => {
    const next = applyBeliefOps([belief()], [op({ op: 'drop', beliefId: 'b1', why: 'It was never true.' })], NOW)
    expect(next).toHaveLength(1)
    expect(next[0]!.status).toBe('dropped')
    expect(next[0]!.history).toHaveLength(1)
  })

  it('clamps confidence to 0..1', () => {
    const next = applyBeliefOps([], [op({ op: 'new', statement: 'x', confidence: 7, evidence: ['2026-11-03#1'] })], NOW)
    expect(next[0]!.confidence).toBe(1)
  })

  it('ignores operations on beliefs that do not exist, and new beliefs without words', () => {
    const next = applyBeliefOps([belief()], [op({ op: 'drop', beliefId: 'b9' }), op({ op: 'new', statement: '  ' })], NOW)
    expect(next).toEqual([belief()])
  })

  it('does not bring a dropped belief back by strengthening it', () => {
    const next = applyBeliefOps([belief({ status: 'dropped' })], [op({ op: 'strengthen', beliefId: 'b1' })], NOW)
    expect(next[0]!.status).toBe('dropped')
  })

  it('keeps at most the cap of live beliefs, dropping the least sure', () => {
    const many = Array.from({ length: MAX_ACTIVE_BELIEFS }, (_, i) => belief({ id: `b${i + 1}`, confidence: 0.5 + i / 100 }))
    const next = applyBeliefOps(many, [op({ op: 'new', statement: 'One too many.', confidence: 0.9, evidence: ['2026-11-03#1'] })], NOW)
    expect(liveBeliefs(next)).toHaveLength(MAX_ACTIVE_BELIEFS)
    expect(next.find((b) => b.id === 'b1')!.status).toBe('dropped')
    expect(next.find((b) => b.statement === 'One too many.')!.status).toBe('active')
  })

  it('does not change its input', () => {
    const input = [belief()]
    const copy = structuredClone(input)
    applyBeliefOps(input, [op({ op: 'drop', beliefId: 'b1' })], NOW)
    expect(input).toEqual(copy)
  })
})

describe('liveBeliefs', () => {
  it('leaves out dropped beliefs and keeps revised ones', () => {
    const all = [belief({ id: 'b1' }), belief({ id: 'b2', status: 'revised' }), belief({ id: 'b3', status: 'dropped' })]
    expect(liveBeliefs(all).map((b) => b.id)).toEqual(['b1', 'b2'])
  })
})
