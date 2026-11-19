import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { repoRoot } from '../src/paths.ts'
import { triageCommand } from '../src/triage/command.ts'
import { writeRunInfo } from '../src/triage/run-info.ts'
import { FakeTracker } from '../src/triage/tracker.ts'

const sample = join(repoRoot(), 'apps/qa/test/fixtures/sample-findings.json')
const now = new Date('2026-11-20T10:00:00Z')

describe('pnpm qa triage', () => {
  it('--dry-run reads the tracker but changes nothing, and says what it would do', async () => {
    const tracker = new FakeTracker()
    tracker.seed({ title: 'Hand-filed', body: 'no marker', labels: ['qa', 'phase-2'] })
    const out = mkdtempSync(join(tmpdir(), 'qa-triage-'))
    const lines: string[] = []
    await triageCommand(['--findings', sample, '--dry-run'], { tracker, now, root: repoRoot(), out, log: (l) => lines.push(l) })
    expect(tracker.calls).toEqual([])
    expect(tracker.issues).toHaveLength(1)
    const written = JSON.parse(readFileSync(join(out, 'triage.json'), 'utf8'))
    expect(written.dryRun).toBe(true)
    expect(written.opened).toHaveLength(7)
    expect(written.wouldDo.filter((l: string) => l.startsWith('open:'))).toHaveLength(7)
    expect(lines.join('\n')).toContain('nothing is closed')
  })

  it('opens the sample findings, picks fixable blockers and majors, and reads covered areas from run.json', async () => {
    const tracker = new FakeTracker()
    const out = mkdtempSync(join(tmpdir(), 'qa-triage-'))
    writeRunInfo(out, { title: 'nightly', areas: ['world', 'live'] })
    await triageCommand(['--findings', sample], { tracker, now, root: repoRoot(), out, log: () => {} })
    const written = JSON.parse(readFileSync(join(out, 'triage.json'), 'utf8'))
    expect(written.coveredAreas).toEqual(['world', 'live'])
    expect(tracker.issues).toHaveLength(7)
    // The blocker is a server finding and the Mastodon one is Roman's: neither is picked.
    expect(written.picks.map((p: { fixKind: string }) => p.fixKind)).toEqual(['code', 'data', 'prompt', 'code'])
    expect(tracker.issues.filter((i) => i.labels.includes('needs-roman')).map((i) => i.title)).toEqual([
      'Mastodon trends is promised but not on the list',
      '/health says the sandbox is missing',
    ])
  })
})
