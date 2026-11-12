import { describe, expect, it } from 'vitest'
import { MindState, StreamEntry, ThoughtAnswer } from '../src/index.ts'

describe('ThoughtAnswer', () => {
  const ok = { thought: 'The tide pools again.', scores: [{ id: '2026-11-12#3', importance: 7 }], surprise: 2, action: 'continue', reason: null }

  it('parses a thought with scores, a surprise and an action', () => {
    expect(ThoughtAnswer.parse(ok)).toEqual(ok)
  })

  it('keeps importance to 1 to 10, surprise to 0 to 10 and the action to the three words', () => {
    expect(ThoughtAnswer.safeParse({ ...ok, scores: [{ id: '2026-11-12#3', importance: 11 }] }).success).toBe(false)
    expect(ThoughtAnswer.safeParse({ ...ok, scores: [{ id: '2026-11-12#3', importance: 0 }] }).success).toBe(false)
    expect(ThoughtAnswer.safeParse({ ...ok, surprise: 11 }).success).toBe(false)
    expect(ThoughtAnswer.safeParse({ ...ok, action: 'rest' }).success).toBe(false)
    expect(ThoughtAnswer.safeParse({ ...ok, action: 'replan', reason: 'it no longer fits' }).success).toBe(true)
  })
})

describe('MindState.thought', () => {
  it('is absent in an older file and fills its defaults when there', () => {
    expect(MindState.parse({}).thought).toBeUndefined()
    expect(MindState.parse({ thought: {} }).thought).toEqual({ failures: 0, recent: [] })
  })
})

describe('StreamEntry scores', () => {
  it('may carry the importance a thought tick gave to earlier entries, and a surprise score', () => {
    const entry = { id: '2026-11-12#4', at: '2026-11-12T11:00:00Z', kind: 'thought', text: 'Hm.', scored: [{ id: '2026-11-12#3', importance: 7 }], surprise: 2 }
    expect(StreamEntry.parse(entry).scored).toHaveLength(1)
  })
})
