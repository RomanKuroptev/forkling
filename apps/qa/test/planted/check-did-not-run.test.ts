import { describe, expect, it } from 'vitest'
import { runChecks, type Check } from '../../src/run/check.ts'

const now = new Date('2026-11-20T10:00:00Z')

describe('planted: a check that throws', () => {
  it('writes qa.check-did-not-run, never a silent pass', async () => {
    const broken: Check = {
      id: 'world.not-blank',
      area: 'world',
      title: 'The world is not blank',
      run: async () => {
        throw new Error('the browser did not start')
      },
    }
    const findings = await runChecks([broken], { now })
    expect(findings).toHaveLength(1)
    const f = findings[0]!
    expect(f.id).toBe('qa.check-did-not-run')
    expect(f.fingerprint).toBe('qa.check-did-not-run|world.not-blank')
    expect(f.area).toBe('world')
    expect(f.severity).toBe('major')
    expect(f.what).toContain('the browser did not start')
    expect(f.firstSeen).toBe('2026-11-20')
  })

  it('a check that returns nothing passes, and the others still run after one throws', async () => {
    const quiet: Check = { id: 'a', area: 'page', title: 'A', run: async () => [] }
    const throws: Check = { id: 'b', area: 'page', title: 'B', run: () => Promise.reject(new Error('x')) }
    const finds: Check = {
      id: 'c',
      area: 'page',
      title: 'C',
      run: async () => [{ id: 'c', fingerprint: 'c|1', severity: 'minor', title: 'Found', what: 'w', causes: 'c', evidence: [], fixKind: 'look' }],
    }
    const findings = await runChecks([quiet, throws, finds], { now })
    expect(findings.map((f) => f.fingerprint)).toEqual(['qa.check-did-not-run|b', 'c|1'])
    expect(findings[1]!.area).toBe('page')
    expect(findings[1]!.runs).toBe(1)
  })

  it('a check that returns a malformed finding did not run properly', async () => {
    const bad: Check = { id: 'd', area: 'live', title: 'D', run: async () => [{ id: 'd' } as never] }
    const findings = await runChecks([bad], { now })
    expect(findings[0]!.id).toBe('qa.check-did-not-run')
  })
})
