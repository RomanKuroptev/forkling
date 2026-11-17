import { describe, expect, it } from 'vitest'
import { Interests } from '@forkling/schema'
import { interestFamilies } from '../src/interest-family.ts'
import fixture from './fixtures/interests-merge.json'

const topic = (weight: number, trail: string | null = null) => ({
  weight,
  firstSeen: '2026-11-10T08:00:00Z',
  lastFed: '2026-11-16T08:00:00Z',
  sources: [],
  history: trail ? [{ at: '2026-11-16T08:00:00Z', change: 4, event: 'page', trail }] : [],
})
const make = (topics: Record<string, ReturnType<typeof topic>>) => Interests.parse({ version: 2, topics })

describe('interestFamilies', () => {
  const real = Interests.parse(fixture)
  const families = interestFamilies(real)
  const familyOf = (t: string) => families.find((f) => f.members.includes(t))!

  it('puts topics fed by the same trip in one family', () => {
    expect(familyOf('lidar')).toBe(familyOf('digital elevation model'))
    expect(familyOf('lidar')).toBe(familyOf('forest canopy'))
    expect(familyOf('lidar').members.length).toBeGreaterThan(3)
  })
  it('keeps unrelated topics out', () => {
    expect(familyOf('hyper-realistic sand in webgl')).not.toBe(familyOf('lidar'))
    expect(familyOf('absurd rigorous joke papers').members).toEqual(['absurd rigorous joke papers'])
  })
  it('covers every topic once, heaviest family first, weights capped at 100', () => {
    expect(families.flatMap((f) => f.members).sort()).toEqual(Object.keys(real.topics).sort())
    for (let i = 1; i < families.length; i++) expect(families[i - 1]!.weight).toBeGreaterThanOrEqual(families[i]!.weight)
    for (const f of families) expect(f.weight).toBeLessThanOrEqual(100)
  })
  it('links by name and sums weights; the name is the heaviest member, first by name on a tie', () => {
    const f = interestFamilies(make({ 'digital elevation model': topic(10), 'digital elevation models': topic(10), 'a b': topic(5) }))
    expect(f[0]).toEqual({ name: 'digital elevation model', weight: 20, members: ['digital elevation model', 'digital elevation models'] })
    expect(f[1]!.members).toEqual(['a b'])
  })
  it('links by a shared trail id and not by different ones', () => {
    const f = interestFamilies(make({ cats: topic(8, 't1'), bridges: topic(9, 't1'), moss: topic(7, 't2') }))
    expect(f.map((x) => x.members)).toEqual([['bridges', 'cats'], ['moss']])
  })
  it('is deterministic and leaves its input alone', () => {
    const before = JSON.stringify(real)
    expect(interestFamilies(real)).toEqual(families)
    expect(JSON.stringify(real)).toBe(before)
  })
})
