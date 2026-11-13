import { describe, expect, it } from 'vitest'
import { CONSTRAINTS, drawConstraint } from '../src/prompts/constraints.ts'

describe('the constraint list (spec 12.4, item 4)', () => {
  it('has about 60 rules, each different, each short enough to store with a work', () => {
    expect(CONSTRAINTS.length).toBeGreaterThanOrEqual(55)
    expect(CONSTRAINTS.length).toBeLessThanOrEqual(70)
    expect(new Set(CONSTRAINTS.map((c) => c.toLowerCase())).size).toBe(CONSTRAINTS.length)
    for (const c of CONSTRAINTS) {
      expect(c.length, c).toBeGreaterThan(8)
      expect(c.length, c).toBeLessThanOrEqual(120)
      expect(c, c).toMatch(/^[A-Z]/)
      expect(c, c).toMatch(/\.$/)
    }
  })

  it('has rules of form, not subject: none names a topic, a verb of the mind or a place', () => {
    // CLAUDE.md: no goal, hobby, interest, topic or activity lists. A constraint says how, never what about.
    const banned = /\b(wander|tend|revisit|expand|found|tinker|reply|diary|souvenir[s]?\b.*\babout|cat|cats|ocean|sea|music|space|robot|lighthouse|maya|history|science|politic|religio|war|food)\b/i
    for (const c of CONSTRAINTS) expect(c, c).not.toMatch(banned)
  })

  it('includes the examples of the spec', () => {
    const all = CONSTRAINTS.join('\n').toLowerCase()
    for (const ex of ['use only two colours', 'it must change when no one is looking', 'make the smallest version that still works', 'use something from the pile', 'build it around something missing']) expect(all).toContain(ex)
  })
})

describe('drawConstraint (seeded, never Math.random)', () => {
  it('is the same for the same seed and key, and always one of the rules', () => {
    expect(drawConstraint(7, 'tinker:a-lamp')).toBe(drawConstraint(7, 'tinker:a-lamp'))
    expect(CONSTRAINTS).toContain(drawConstraint(7, 'tinker:a-lamp'))
  })

  it('differs between keys and between seeds, and reaches most of the list', () => {
    const seen = new Set(Array.from({ length: 600 }, (_, i) => drawConstraint(7, `tinker:${i}`)))
    expect(seen.size).toBeGreaterThan(CONSTRAINTS.length * 0.8)
    expect(drawConstraint(8, 'k')).not.toBe(drawConstraint(9, 'k'))
  })

  it('does not lean on one rule: no rule is drawn more than 4 times as often as an even share', () => {
    const counts = new Map<string, number>()
    const n = 6000
    for (let i = 0; i < n; i++) {
      const c = drawConstraint(3, `k${i}`)
      counts.set(c, (counts.get(c) ?? 0) + 1)
    }
    for (const count of counts.values()) expect(count).toBeLessThan((n / CONSTRAINTS.length) * 4)
  })
})
