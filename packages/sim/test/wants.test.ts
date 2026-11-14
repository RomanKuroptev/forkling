import { describe, expect, it } from 'vitest'
import type { Want } from '@forkling/schema'
import { MAX_WANT_ATTEMPTS, MAX_WANT_EDITS, applyWantEdits, dropFailedWants, recordWantAttempt, rewriteWants } from '../src/wants.ts'

const T0 = '2026-11-15T10:00:00+01:00'
const T1 = '2026-11-16T10:00:00+01:00'
const w = (id: string, over: Partial<Want> = {}): Want => ({ id, kind: 'question', text: `text ${id}`, why: 'because', since: T0, attempts: 0, lastTouched: T0, ...over })
const add = (text = 'x') => ({ op: 'add' as const, kind: 'question' as const, text, why: 'y' })

describe('applyWantEdits (spec 9.3: up to 4 edits)', () => {
  it('adds a want with a fresh id, today as since and lastTouched', () => {
    const r = applyWantEdits([w('w1')], [{ op: 'add', kind: 'project', text: 'Map the fog', why: 'It keeps coming back.' }], T1)
    expect(r.wants.map((x) => x.id)).toEqual(['w1', 'w2'])
    expect(r.wants[1]).toMatchObject({ kind: 'project', text: 'Map the fog', since: T1, lastTouched: T1, attempts: 0 })
  })
  it('never reuses an id, even one that was dropped in the same call', () => {
    const r = applyWantEdits([w('w1'), w('w2')], [{ op: 'drop', id: 'w2' }, add()], T1)
    expect(r.wants.map((x) => x.id)).toEqual(['w1', 'w3'])
  })
  it('drops a want by id', () => {
    const r = applyWantEdits([w('w1'), w('w2')], [{ op: 'drop', id: 'w1' }], T1)
    expect(r.wants.map((x) => x.id)).toEqual(['w2'])
    expect(r.rejected).toEqual([])
  })
  it('reorders by a list of ids and keeps any it forgot, at the end', () => {
    const r = applyWantEdits([w('w1'), w('w2'), w('w3')], [{ op: 'reorder', ids: ['w3', 'w1'] }], T1)
    expect(r.wants.map((x) => x.id)).toEqual(['w3', 'w1', 'w2'])
  })
  it('rejects an unknown id in a drop or reorder, and says so', () => {
    const r = applyWantEdits([w('w1')], [{ op: 'drop', id: 'nope' }, { op: 'reorder', ids: ['w1', 'nope'] }], T1)
    expect(r.wants.map((x) => x.id)).toEqual(['w1'])
    expect(r.rejected).toHaveLength(2)
  })
  it('takes only the first 4 edits', () => {
    expect(MAX_WANT_EDITS).toBe(4)
    const r = applyWantEdits([], Array.from({ length: 6 }, (_, i) => add(`t${i}`)), T1)
    expect(r.wants).toHaveLength(4)
    expect(r.rejected).toHaveLength(2)
  })
  it('refuses an add past 12', () => {
    const full = Array.from({ length: 12 }, (_, i) => w(`w${i + 1}`))
    const r = applyWantEdits(full, [add()], T1)
    expect(r.wants).toHaveLength(12)
    expect(r.rejected).toHaveLength(1)
  })
  it('cuts a text over 140 characters and a reason over 200', () => {
    const r = applyWantEdits([], [{ op: 'add', kind: 'question', text: 'x'.repeat(200), why: 'y'.repeat(300) }], T1)
    expect(r.wants[0]?.text).toHaveLength(140)
    expect(r.wants[0]?.why).toHaveLength(200)
  })
  it('rejects an add with no text', () => {
    expect(applyWantEdits([], [add('   ')], T1).rejected).toHaveLength(1)
  })
  it('does not change its input', () => {
    const input = [w('w1')]
    applyWantEdits(input, [{ op: 'drop', id: 'w1' }], T1)
    expect(input).toHaveLength(1)
  })
})

describe('attempts and the 4-failure drop (spec 9.4)', () => {
  it('records an attempt on a want, and when', () => {
    const r = recordWantAttempt([w('w1'), w('w2')], 'w1', T1)
    expect(r[0]).toMatchObject({ attempts: 1, lastTouched: T1 })
    expect(r[1]?.attempts).toBe(0)
  })
  it('does nothing for a step that names no want, or one that is gone', () => {
    const wants = [w('w1')]
    expect(recordWantAttempt(wants, undefined, T1)).toEqual(wants)
    expect(recordWantAttempt(wants, 'gone', T1)).toEqual(wants)
  })
  it('drops a want at 4 failed attempts and reports it', () => {
    expect(MAX_WANT_ATTEMPTS).toBe(4)
    const r = dropFailedWants([w('w1', { attempts: 3 }), w('w2', { attempts: 4 }), w('w3', { attempts: 5 })])
    expect(r.wants.map((x) => x.id)).toEqual(['w1'])
    expect(r.dropped.map((x) => x.id)).toEqual(['w2', 'w3'])
  })
})

describe('rewriteWants (the sleep rewrite changes at most half, spec 9.4)', () => {
  const six = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6'].map((id) => w(id))
  it('allows an unchanged list and a change of up to half', () => {
    expect(rewriteWants(six, six).ok).toBe(true)
    expect(rewriteWants(six, [...six.slice(0, 3), w('w7'), w('w8'), w('w9')]).ok).toBe(true)
  })
  it('refuses more than half changed (an edit of the text counts as a change)', () => {
    const edited = six.map((x, i) => (i < 4 ? { ...x, text: 'something else' } : x))
    const r = rewriteWants(six, edited)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/half/)
  })
  it('counts a dropped want as a change', () => {
    expect(rewriteWants(six, six.slice(0, 2)).ok).toBe(false)
    expect(rewriteWants(six, six.slice(0, 3)).ok).toBe(true)
  })
  it('a reorder alone is not a change', () => {
    expect(rewriteWants(six, [...six].reverse()).ok).toBe(true)
  })
  it('has no limit while there are fewer than 3 wants, so the list can fill', () => {
    expect(rewriteWants([], six).ok).toBe(true)
    expect(rewriteWants([w('w1'), w('w2')], six).ok).toBe(true)
  })
  it('refuses a list over 12', () => {
    const big = Array.from({ length: 13 }, (_, i) => w(`w${i + 1}`))
    expect(rewriteWants(big.slice(0, 12), big).ok).toBe(false)
  })
})
