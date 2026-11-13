import { describe, expect, it } from 'vitest'
import { createPrng, drawPrng, hashString } from '../src/prng.ts'

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

describe('hashString and drawPrng (a draw that can be repeated)', () => {
  it('hashString is stable, and different keys give different numbers', () => {
    expect(hashString('tinker:a-lamp')).toBe(hashString('tinker:a-lamp'))
    expect(hashString('tinker:a-lamp')).not.toBe(hashString('tinker:a-lamb'))
    expect(hashString('')).toBe(0x811c9dc5)
    expect(hashString('a')).toBe(0xe40c292c)
  })

  it('drawPrng gives the same numbers for the same seed and key, and others for another key or seed', () => {
    const take = (seed: number, key: string) => {
      const rng = drawPrng(seed, key)
      return Array.from({ length: 5 }, () => rng.int(1000))
    }
    expect(take(7, 'k')).toEqual(take(7, 'k'))
    expect(take(7, 'k')).not.toEqual(take(7, 'j'))
    expect(take(7, 'k')).not.toEqual(take(8, 'k'))
  })
})
