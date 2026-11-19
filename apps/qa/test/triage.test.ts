import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Findings, type Finding } from '../src/report/finding.ts'
import { repoRoot } from '../src/paths.ts'
import { applyPlan } from '../src/triage/apply.ts'
import { parseMarker } from '../src/triage/marker.ts'
import { planTriage } from '../src/triage/plan.ts'
import { FakeTracker } from '../src/triage/tracker.ts'

const date = '2026-11-20'
const sample = (): Finding[] =>
  Findings.parse(JSON.parse(readFileSync(join(repoRoot(), 'apps/qa/test/fixtures/sample-findings.json'), 'utf8')))

const f = (over: Partial<Finding> = {}): Finding => ({
  id: 'world.floating',
  fingerprint: 'world.floating|sign|day-7',
  area: 'world',
  severity: 'major',
  title: 'A sign floats above the Workshop',
  what: 'The sign is 0.6 m above the roof.',
  causes: 'It looks broken.',
  evidence: [],
  fixKind: 'code',
  firstSeen: '2026-11-19',
  runs: 1,
  ...over,
})

// One triage run against the fake: plan from what the tracker holds now, then apply.
async function run(tracker: FakeTracker, findings: Finding[], areas: Finding['area'][] = ['world', 'behaviour', 'live', 'page', 'e2e', 'coverage']) {
  const plan = planTriage({ findings, issues: await tracker.listIssues('qa'), coveredAreas: areas, date })
  return applyPlan(plan, tracker, { root: repoRoot(), date })
}

describe('triage plan', () => {
  it('opens one issue per new fingerprint, labelled qa, with the marker in the body', async () => {
    const t = new FakeTracker()
    const r = await run(t, [f()])
    expect(r.opened).toHaveLength(1)
    const issue = t.issues[0]!
    expect(issue.labels).toEqual(['qa'])
    expect(issue.title).toBe('A sign floats above the Workshop')
    expect(issue.body).toContain('The sign is 0.6 m above the roof.')
    expect(parseMarker(issue.body)).toMatchObject({ fp: 'world.floating|sign|day-7', area: 'world', clean: 0, tries: 0 })
  })

  it('never opens an issue for an info finding (measured, no action)', async () => {
    const t = new FakeTracker()
    const r = await run(t, [f({ severity: 'info' })])
    expect(r.opened).toEqual([])
    expect(t.calls).toEqual([])
  })

  it('labels server and roman findings needs-roman', async () => {
    const t = new FakeTracker()
    await run(t, [f({ fixKind: 'roman' }), f({ fingerprint: 'b', fixKind: 'server' })])
    expect(t.issues.map((i) => i.labels)).toEqual([['qa', 'needs-roman'], ['qa', 'needs-roman']])
  })

  it('does nothing for a known finding with the same evidence', async () => {
    const t = new FakeTracker()
    await run(t, [f()])
    t.calls.length = 0
    const r = await run(t, [f({ runs: 2 })])
    expect(r.actions).toEqual([])
    expect(t.calls).toEqual([])
  })

  it('comments once when the evidence changed, and not again for the same change', async () => {
    const t = new FakeTracker()
    await run(t, [f()])
    await run(t, [f({ what: 'The sign is 1.2 m above the roof.' })])
    await run(t, [f({ what: 'The sign is 1.2 m above the roof.' })])
    expect(t.issues[0]!.comments).toHaveLength(1)
    expect(t.issues[0]!.comments[0]).toContain('1.2 m')
  })

  it('a re-rendered picture with the same name is not a change', async () => {
    const t = new FakeTracker()
    await run(t, [f({ evidence: ['qa-out/world/a.png'] })])
    const r = await run(t, [f({ evidence: ['qa-out/world/a.png'] })])
    expect(r.actions).toEqual([])
  })

  it('closes after 2 clean runs in a covered area', async () => {
    const t = new FakeTracker()
    await run(t, [f()])
    const one = await run(t, [])
    expect(parseMarker(t.issues[0]!.body)?.clean).toBe(1)
    expect(one.closed).toEqual([])
    expect(t.issues[0]!.state).toBe('open')
    const two = await run(t, [])
    expect(two.closed).toEqual([1])
    expect(t.issues[0]!.state).toBe('closed')
    expect(t.issues[0]!.comments.at(-1)).toContain('not seen for 2 runs')
  })

  it('does not count a run that did not cover the area as clean', async () => {
    const t = new FakeTracker()
    await run(t, [f()])
    await run(t, [], ['behaviour'])
    await run(t, [], ['behaviour'])
    expect(t.issues[0]!.state).toBe('open')
    expect(parseMarker(t.issues[0]!.body)?.clean).toBe(0)
  })

  it('does not count an area as clean when a check in it did not run', async () => {
    const t = new FakeTracker()
    await run(t, [f()])
    const broken = f({ id: 'qa.check-did-not-run', fingerprint: 'qa.check-did-not-run|world.not-blank', title: 'A check did not run' })
    await run(t, [broken])
    await run(t, [broken])
    expect(t.issues[0]!.state).toBe('open')
  })

  it('a finding seen again resets the clean count without a comment', async () => {
    const t = new FakeTracker()
    await run(t, [f()])
    await run(t, [])
    await run(t, [f()])
    expect(parseMarker(t.issues[0]!.body)?.clean).toBe(0)
    expect(t.issues[0]!.comments).toEqual([])
    await run(t, [])
    expect(t.issues[0]!.state).toBe('open')
  })

  it('reopens a closed issue whose fingerprint comes back', async () => {
    const t = new FakeTracker()
    await run(t, [f()])
    await run(t, [])
    await run(t, [])
    const r = await run(t, [f()])
    expect(r.reopened).toEqual([1])
    expect(t.issues).toHaveLength(1)
    expect(t.issues[0]!.state).toBe('open')
    expect(parseMarker(t.issues[0]!.body)?.clean).toBe(0)
  })

  it('leaves qa issues without a marker alone (the hand-filed phase-2 issues, the digest)', async () => {
    const t = new FakeTracker()
    t.seed({ title: 'The LIVE pane is a drawn picture', body: 'Filed by hand.', labels: ['qa', 'phase-2'] })
    await run(t, [])
    await run(t, [])
    expect(t.issues[0]!.state).toBe('open')
    expect(t.calls).toEqual([])
  })

  it('the sample file run twice gives no new actions the second time', async () => {
    const t = new FakeTracker()
    const first = await run(t, sample())
    expect(first.opened.length).toBe(sample().filter((x) => x.severity !== 'info').length)
    const second = await run(t, sample())
    expect(second.actions).toEqual([])
  })
})

describe('triage picks', () => {
  it('picks up to 5 blockers and majors, blockers first, then oldest', async () => {
    const t = new FakeTracker()
    const many = [
      f({ fingerprint: 'm-new', firstSeen: '2026-11-19' }),
      f({ fingerprint: 'm-old', firstSeen: '2026-11-01' }),
      f({ fingerprint: 'b', severity: 'blocker', firstSeen: '2026-11-19' }),
      f({ fingerprint: 'minor', severity: 'minor' }),
      f({ fingerprint: 'info', severity: 'info' }),
      ...['1', '2', '3', '4'].map((n) => f({ fingerprint: `m${n}`, firstSeen: '2026-11-18' })),
    ]
    const r = await run(t, many)
    expect(r.picks.map((p) => p.fingerprint)).toEqual(['b', 'm-old', 'm1', 'm2', 'm3'])
    expect(r.picks.every((p) => typeof p.issue === 'number')).toBe(true)
  })

  it('skips needs-roman, fix-failed and qa-rules, and fixKinds server and roman', async () => {
    const t = new FakeTracker()
    await run(t, [f({ fingerprint: 'a' }), f({ fingerprint: 'b' }), f({ fingerprint: 'c' }), f({ fingerprint: 'd' }), f({ fingerprint: 'e', fixKind: 'roman' })])
    await t.addLabels(1, ['needs-roman'])
    await t.addLabels(2, ['fix-failed'])
    await t.addLabels(3, ['qa-rules'])
    const r = await run(t, [f({ fingerprint: 'a' }), f({ fingerprint: 'b' }), f({ fingerprint: 'c' }), f({ fingerprint: 'd' }), f({ fingerprint: 'e', fixKind: 'roman' })])
    expect(r.picks.map((p) => p.fingerprint)).toEqual(['d'])
  })
})

describe('triage pictures', () => {
  it('uploads PNG evidence once and shows it in the issue; a missing file is listed, not fatal', async () => {
    const t = new FakeTracker()
    await run(t, [f({ evidence: ['apps/qa/test/fixtures/sample-evidence.png', 'qa-out/gone.png', 'qa-out/world/a.json'] })])
    expect(t.uploads).toHaveLength(1)
    expect(t.uploads[0]!.remotePath).toMatch(/^[0-9a-f]{12}\/2026-11-20\/sample-evidence\.png$/)
    const body = t.issues[0]!.body
    expect(body).toContain('![sample-evidence.png](https://example.test/')
    expect(body).toContain('missing: `qa-out/gone.png`')
    expect(body).toContain('`qa-out/world/a.json`')
  })
})
