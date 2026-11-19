import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Finding } from '../src/report/finding.ts'
import { KnownFindings, knownSet } from '../src/report/known.ts'
import { blocking } from '../src/report/write.ts'
import { repoRoot } from '../src/paths.ts'
import { join } from 'node:path'

const f = (severity: Finding['severity'], fingerprint: string): Finding => ({
  id: 'x',
  fingerprint,
  area: 'world',
  severity,
  title: 't',
  what: 'w',
  causes: 'c',
  evidence: [],
  fixKind: 'code',
  firstSeen: '2026-11-20',
  runs: 1,
})

describe('known findings (spec 5: only a new blocker or major blocks a PR)', () => {
  it('a major already tracked in an open issue does not block, a new one does', () => {
    const known = new Set(['world.work-shown|day-7'])
    expect(blocking([f('major', 'world.work-shown|day-7')], known)).toBe(false)
    expect(blocking([f('major', 'world.work-shown|day-7'), f('major', 'world.other')], known)).toBe(true)
  })

  it('a blocker always blocks, known or not', () => {
    expect(blocking([f('blocker', 'live.down')], new Set(['live.down']))).toBe(true)
  })

  it('each entry names its open issue and why; a fingerprint is listed once', () => {
    const entry = { fingerprint: 'a', issue: 290, reason: 'tracked until the engine shows every work' }
    expect(KnownFindings.safeParse({ version: 1, entries: [entry] }).success).toBe(true)
    expect(KnownFindings.safeParse({ version: 1, entries: [{ ...entry, issue: 0 }] }).success).toBe(false)
    expect(KnownFindings.safeParse({ version: 1, entries: [{ ...entry, reason: '' }] }).success).toBe(false)
    expect(KnownFindings.safeParse({ version: 1, entries: [entry, entry] }).success).toBe(false)
  })

  it('the committed list parses', () => {
    const file = KnownFindings.parse(JSON.parse(readFileSync(join(repoRoot(), 'qa/known-findings.json'), 'utf8')))
    expect(knownSet(file).size).toBe(file.entries.length)
  })
})
