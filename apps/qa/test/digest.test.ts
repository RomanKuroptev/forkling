import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Finding } from '../src/report/finding.ts'
import { repoRoot } from '../src/paths.ts'
import { digestCommand, renderDigest } from '../src/triage/digest.ts'
import { recordFix } from '../src/triage/fix-try.ts'
import { withMarker } from '../src/triage/marker.ts'
import { FakeTracker } from '../src/triage/tracker.ts'

const now = new Date('2026-11-20T10:00:00Z')
const f = (over: Partial<Finding> = {}): Finding => ({
  id: 'x', fingerprint: 'x', area: 'world', severity: 'major', title: 'A sign floats', what: 'w', causes: 'c',
  evidence: [], fixKind: 'code', firstSeen: '2026-11-20', runs: 1, ...over,
})

function setup() {
  const out = mkdtempSync(join(tmpdir(), 'qa-digest-'))
  writeFileSync(join(out, 'findings.json'), JSON.stringify([
    f({ fingerprint: 'a', severity: 'blocker', title: 'The world is blank' }),
    f({ fingerprint: 'b' }),
    f({ fingerprint: 'c', severity: 'info', title: 'Rest per day' }),
  ]))
  writeFileSync(join(out, 'triage.json'), JSON.stringify({ opened: [{ fingerprint: 'a', issue: 300 }], closed: [12], reopened: [], commented: [] }))
  mkdirSync(join(out, 'sheets'))
  writeFileSync(join(out, 'sheets', 'world-day-7.png'), readFileSync(join(repoRoot(), 'apps/qa/test/fixtures/sample-evidence.png')))
  mkdirSync(join(out, 'behaviour'))
  writeFileSync(join(out, 'behaviour', 'summary.md'), 'Topics: loop on 5 of 7 days.\nMemes: stop at "seen by the planner".\n')
  const t = new FakeTracker()
  t.seed({ title: 'Mastodon trends is not on the list', labels: ['qa', 'needs-roman'], body: withMarker('**Recommended answer:** drop it; robots.txt blocks ClaudeBot.\n\nMore.', { fp: 'm', area: 'live', clean: 0, evidence: 'h', tries: 0 }) })
  t.seed({ title: 'Hand-filed gap', labels: ['qa', 'phase-2'], body: 'no marker' })
  t.seed({ title: 'Old fixed thing', labels: ['qa', 'needs-roman'], state: 'closed', body: 'x' })
  return { out, t }
}

describe('the digest', () => {
  it('says what was found, fixed, waiting for Roman and given up, with pictures and the behaviour summary', async () => {
    const { out, t } = setup()
    await recordFix(t, { issue: 1, merged: 301 }, { out, date: '2026-11-20' })
    const md = await renderDigest({ out, tracker: t, now, mode: 'nightly', pictureUrl: async (p) => `pic:${p}` })
    expect(md).toContain('# QA digest, 2026-11-20 (nightly)')
    expect(md).toContain('1 blocker, 1 major, 0 minor, 1 info')
    expect(md).toContain('Opened #300')
    expect(md).toContain('closed #12')
    expect(md).toContain('#301')
    expect(md).toContain('Mastodon trends is not on the list')
    expect(md).toContain('drop it; robots.txt blocks ClaudeBot.')
    expect(md).not.toContain('Old fixed thing')
    expect(md).not.toContain('Hand-filed gap')
    expect(md).toContain('loop on 5 of 7 days')
    expect(md).toContain('![world-day-7.png](pic:world-day-7.png)')
  })

  it('without --post writes digest.md and touches nothing on GitHub', async () => {
    const { out, t } = setup()
    t.calls.length = 0
    await digestCommand([], { out, tracker: t, now, digestIssue: 269, log: () => {} })
    expect(readFileSync(join(out, 'digest.md'), 'utf8')).toContain('QA digest')
    expect(t.calls).toEqual([])
  })

  it('--post adds exactly one comment on the digest issue, with the sheets uploaded as PNG', async () => {
    const { out, t } = setup()
    const digest = t.seed({ title: 'QA digest', labels: ['qa'], body: 'pinned' })
    t.calls.length = 0
    await digestCommand(['--post'], { out, tracker: t, now, digestIssue: digest, log: () => {} })
    expect(t.calls.filter((c) => c.startsWith('comment'))).toEqual([`comment #${digest}`])
    expect(t.uploads.map((u) => u.remotePath)).toEqual(['digest/2026-11-20/world-day-7.png'])
    expect(t.issues.find((i) => i.number === digest)!.comments[0]).toContain('https://example.test/digest/2026-11-20/world-day-7.png')
  })

  it('after a dry-run triage it says nothing changed on GitHub, with no made-up issue numbers', async () => {
    const { out, t } = setup()
    writeFileSync(join(out, 'triage.json'), JSON.stringify({ dryRun: true, opened: [{ fingerprint: 'a', issue: -1 }], closed: [], reopened: [], commented: [] }))
    const md = await renderDigest({ out, tracker: t, now, mode: 'qa', pictureUrl: async (p) => p })
    expect(md).toContain('dry run, nothing changed on GitHub')
    expect(md).toContain('would open 1')
    expect(md).not.toContain('#-1')
  })

  it('says plainly when nothing waits for Roman', async () => {
    const out = mkdtempSync(join(tmpdir(), 'qa-digest-'))
    const md = await renderDigest({ out, tracker: new FakeTracker(), now, mode: 'qa', pictureUrl: async (p) => p })
    expect(md).toContain('Nothing was found.')
    expect(md).toContain('Nothing is waiting for Roman.')
  })
})
