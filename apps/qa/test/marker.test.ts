import { describe, expect, it } from 'vitest'
import { evidenceHash, parseMarker, withMarker } from '../src/triage/marker.ts'
import type { Finding } from '../src/report/finding.ts'

const state = { fp: 'world.sign|a-->b|<x>', area: 'world' as const, clean: 1, evidence: 'abc', tries: 0 }

describe('issue marker', () => {
  it('round-trips, even with --> and < > in the fingerprint', () => {
    const body = withMarker('Some text.', state)
    expect(body.startsWith('Some text.')).toBe(true)
    expect(body.match(/-->/g)).toHaveLength(1)
    expect(parseMarker(body)).toEqual(state)
  })

  it('replaces an old marker instead of adding a second', () => {
    const body = withMarker(withMarker('Text.', state), { ...state, clean: 0 })
    expect(body.match(/qa-state/g)).toHaveLength(1)
    expect(parseMarker(body)?.clean).toBe(0)
  })

  it('a body without a marker, or with a broken one, is not ours', () => {
    expect(parseMarker('Filed by hand.')).toBeNull()
    expect(parseMarker('<!-- qa-state {not json} -->')).toBeNull()
    expect(parseMarker('<!-- qa-state {"fp":"x"} -->')).toBeNull()
  })
})

describe('evidence hash', () => {
  const f = (over: Partial<Finding>): Finding => ({
    id: 'x', fingerprint: 'x', area: 'world', severity: 'major', title: 't', what: 'w', causes: 'c',
    evidence: ['qa-out/a/one.png', 'qa-out/b/two.png'], fixKind: 'code', firstSeen: '2026-11-20', runs: 1, ...over,
  })

  it('changes with severity, what, or the evidence file names', () => {
    const base = evidenceHash(f({}))
    expect(evidenceHash(f({ severity: 'minor' }))).not.toBe(base)
    expect(evidenceHash(f({ what: 'other' }))).not.toBe(base)
    expect(evidenceHash(f({ evidence: ['qa-out/a/one.png'] }))).not.toBe(base)
  })

  it('does not change with the title, runs, or the order or folder of the evidence', () => {
    const base = evidenceHash(f({}))
    expect(evidenceHash(f({ title: 'new title', runs: 4 }))).toBe(base)
    expect(evidenceHash(f({ evidence: ['qa-out/c/two.png', 'qa-out/a/one.png'] }))).toBe(base)
  })
})
