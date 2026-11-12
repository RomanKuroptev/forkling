import { describe, expect, it } from 'vitest'
import { NowJson } from '../src/index.ts'

describe('NowJson (what the server gives the site at GET /now.json)', () => {
  const now = {
    updatedAt: '2026-11-12T11:00:00Z',
    asleep: false,
    step: { verb: 'wander', target: 'tide pools', reason: 'I keep coming back to them.', until: '2026-11-12T11:30:00Z' },
    thought: 'The tide pools again.',
    mood: 'steady, rested',
  }

  it('parses the step, the last thought line and the mood in words', () => {
    expect(NowJson.parse(now)).toEqual(now)
  })

  it('allows no step and no thought (asleep, or a quiet moment)', () => {
    expect(NowJson.safeParse({ ...now, asleep: true, step: null, thought: null }).success).toBe(true)
  })

  it('keeps a thought line to 140 characters', () => {
    expect(NowJson.safeParse({ ...now, thought: 'x'.repeat(141) }).success).toBe(false)
  })
})
