import { describe, expect, it } from 'vitest'
import { createPrng } from '../src/prng.ts'

describe('createPrng', () => {
  it('is deterministic for the same seed', () => {
    const a = createPrng(42)
    const b = createPrng(42)
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next())
  })

  it('differs between seeds', () => {
    expect(createPrng(1).next()).not.toBe(createPrng(2).next())
  })

  it('stays in [0, 1)', () => {
    const r = createPrng(123)
    for (let i = 0; i < 10_000; i++) {
      const v = r.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('range() maps into [min, max)', () => {
    const r = createPrng(9)
    for (let i = 0; i < 1000; i++) {
      const v = r.range(-5, 5)
      expect(v).toBeGreaterThanOrEqual(-5)
      expect(v).toBeLessThan(5)
    }
  })
})
