import { describe, expect, it } from 'vitest'
import { Intention } from '../src/index.ts'

describe('Intention', () => {
  const valid = { type: 'nap', startedAt: '2026-10-30T12:00:00.000Z', seed: 42, reason: 'The sun is warm on the rock.' }

  it('parses the CLAUDE.md shape, with startedAt as an ISO timestamp', () => {
    expect(Intention.parse(valid)).toEqual(valid)
    expect(Intention.parse({ ...valid, targetId: 'sunbeam' }).targetId).toBe('sunbeam')
  })

  it('accepts timestamps with an offset', () => {
    expect(Intention.safeParse({ ...valid, startedAt: '2026-10-30T13:00:00+01:00' }).success).toBe(true)
  })

  it('requires a type, an ISO timestamp, an integer seed and a one-sentence reason', () => {
    expect(Intention.safeParse({ ...valid, type: '' }).success).toBe(false)
    expect(Intention.safeParse({ ...valid, startedAt: 120.5 }).success).toBe(false)
    expect(Intention.safeParse({ ...valid, startedAt: 'yesterday' }).success).toBe(false)
    expect(Intention.safeParse({ ...valid, seed: 1.5 }).success).toBe(false)
    expect(Intention.safeParse({ ...valid, reason: '' }).success).toBe(false)
    expect(Intention.safeParse({ ...valid, reason: 'x'.repeat(201) }).success).toBe(false)
  })
})
