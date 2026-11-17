import { describe, expect, it } from 'vitest'
import type { Visitors } from '@forkling/schema'
import { MAX_VISITORS, foldName, hiddenVisitor, recordVisitor } from '../src/visitors.ts'

const T = (d: number) => new Date(Date.parse('2026-11-01T10:00:00Z') + d * 86_400_000).toISOString()
const empty: Visitors = { visitors: {} }

describe('foldName', () => {
  it('lowercases, trims, collapses inner spaces and cuts to 40', () => {
    expect(foldName('Roman')).toBe('roman')
    expect(foldName(' roman ')).toBe('roman')
    expect(foldName('Anna   Maria  K')).toBe('anna maria k')
    expect(foldName('x'.repeat(60))).toHaveLength(40)
  })
  it('is null for no name', () => {
    expect(foldName('')).toBeNull()
    expect(foldName('   ')).toBeNull()
  })
})

describe('recordVisitor', () => {
  it('two notes with "Roman" and " roman " are one entry', () => {
    let v = recordVisitor(empty, { name: 'Roman', at: T(0) })
    v = recordVisitor(v, { name: ' roman ', at: T(1) })
    expect(Object.keys(v.visitors)).toEqual(['roman'])
    expect(v.visitors.roman).toMatchObject({ name: 'Roman', firstSeen: T(0), lastSeen: T(1), notes: 2, about: '', made: [] })
  })
  it('a note with no name is not remembered', () => {
    expect(recordVisitor(empty, { name: '  ', at: T(0) })).toEqual(empty)
  })
  it('the 201st name pushes out the one seen longest ago', () => {
    expect(MAX_VISITORS).toBe(200)
    let v = empty
    for (let i = 0; i < 200; i++) v = recordVisitor(v, { name: `v${i}`, at: T(i + 1) })
    v = recordVisitor(v, { name: 'v0', at: T(300) }) // v0 is seen again: v1 is now the oldest
    v = recordVisitor(v, { name: 'newcomer', at: T(301) })
    expect(Object.keys(v.visitors)).toHaveLength(200)
    expect(v.visitors.v1).toBeUndefined()
    expect(v.visitors.v0).toBeDefined()
    expect(v.visitors.newcomer).toBeDefined()
  })
  it('does not change its input', () => {
    const before = JSON.stringify(empty)
    recordVisitor(empty, { name: 'A', at: T(0) })
    expect(JSON.stringify(empty)).toBe(before)
  })
})

describe('hiddenVisitor', () => {
  it('a folded name in Roman\'s list hides the entry', () => {
    expect(hiddenVisitor('roman', { hidden: [], names: ['roman'] })).toBe(true)
    expect(hiddenVisitor('anna', { hidden: [], names: ['roman'] })).toBe(false)
    expect(hiddenVisitor('anna', { hidden: [] })).toBe(false)
  })
})
