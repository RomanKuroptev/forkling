import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { repoRoot } from '../src/paths.ts'
import { applyPlan } from '../src/triage/apply.ts'
import { readFixes, recordFix } from '../src/triage/fix-try.ts'
import { parseMarker, withMarker } from '../src/triage/marker.ts'
import { planTriage } from '../src/triage/plan.ts'
import { FakeTracker } from '../src/triage/tracker.ts'

const date = '2026-11-20'
const seedOurs = (t: FakeTracker): number =>
  t.seed({ title: 'A sign floats', body: withMarker('Body.', { fp: 'fp-a', area: 'world', clean: 0, evidence: 'h', tries: 0 }) })

describe('pnpm qa fix-try', () => {
  it('counts a failed try with what was tried, and labels fix-failed on the second', async () => {
    const t = new FakeTracker()
    const n = seedOurs(t)
    const out = mkdtempSync(join(tmpdir(), 'qa-fix-'))
    await recordFix(t, { issue: n, failed: 'Moved the sign down; the test still saw it float.' }, { out, date })
    expect(parseMarker(t.issues[0]!.body)?.tries).toBe(1)
    expect(t.issues[0]!.labels).not.toContain('fix-failed')
    expect(t.issues[0]!.comments[0]).toContain('Moved the sign down')
    await recordFix(t, { issue: n, failed: 'Anchored it to the roof; CI failed.' }, { out, date })
    expect(parseMarker(t.issues[0]!.body)?.tries).toBe(2)
    expect(t.issues[0]!.labels).toContain('fix-failed')
    expect(t.issues[0]!.comments[1]).toContain('fix-failed')
    expect(readFixes(out).map((x) => x.result)).toEqual(['failed', 'fix-failed'])
  })

  it('records a merged fix, and the close later says which PR fixed it', async () => {
    const t = new FakeTracker()
    const n = seedOurs(t)
    const out = mkdtempSync(join(tmpdir(), 'qa-fix-'))
    await recordFix(t, { issue: n, merged: 301 }, { out, date })
    expect(parseMarker(t.issues[0]!.body)?.fixedBy).toBe(301)
    expect(t.issues[0]!.comments[0]).toContain('#301')
    for (let i = 0; i < 2; i++) {
      const plan = planTriage({ findings: [], issues: await t.listIssues('qa'), coveredAreas: ['world'], date })
      await applyPlan(plan, t, { root: repoRoot(), date })
    }
    expect(t.issues[0]!.state).toBe('closed')
    expect(t.issues[0]!.comments.at(-1)).toContain('fixed by #301')
    expect(readFixes(out)).toEqual([{ date, issue: n, title: 'A sign floats', result: 'merged', pr: 301 }])
  })

  it('refuses an issue that triage did not open', async () => {
    const t = new FakeTracker()
    const n = t.seed({ title: 'By hand', body: 'no marker' })
    const out = mkdtempSync(join(tmpdir(), 'qa-fix-'))
    await expect(recordFix(t, { issue: n, merged: 3 }, { out, date })).rejects.toThrow(/not a triage issue/)
  })
})
