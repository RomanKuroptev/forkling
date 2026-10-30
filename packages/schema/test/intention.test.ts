import { describe, expect, it } from 'vitest'
import { Intention } from '../src/index.ts'

describe('Intention', () => {
  const valid = { type: 'nap', startedAt: 120.5, seed: 42, reason: 'The sun is warm on the rock.' }

  it('parses the CLAUDE.md shape', () => {
    expect(Intention.parse(valid)).toEqual(valid)
    expect(Intention.parse({ ...valid, targetId: 'sunbeam' }).targetId).toBe('sunbeam')
  })

  it('requires a type, an integer seed and a one-sentence reason', () => {
    expect(Intention.safeParse({ ...valid, type: '' }).success).toBe(false)
    expect(Intention.safeParse({ ...valid, seed: 1.5 }).success).toBe(false)
    expect(Intention.safeParse({ ...valid, reason: '' }).success).toBe(false)
    expect(Intention.safeParse({ ...valid, reason: 'x'.repeat(201) }).success).toBe(false)
  })
})
