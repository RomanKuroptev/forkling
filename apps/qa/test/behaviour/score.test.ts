import { describe, expect, it } from 'vitest'
import { parsePlan, parseSummary, readRun, type RunData } from '../../src/behaviour/read-run.ts'
import { readLevels, SCORES, scoreRun } from '../../src/behaviour/score.ts'
import { DID_NOT_RUN } from '../../src/report/finding.ts'
import { makeRun, WEEK } from './make-run.ts'

const levels = readLevels()
const NOW = new Date('2026-11-26T12:00:00Z')
const score = async (shape: Parameters<typeof makeRun>[0]) => {
  const { world, out } = makeRun(shape)
  return scoreRun(readRun({ world, outDir: out, label: 'test' }), levels, NOW)
}
const ids = (f: { id: string }[]) => f.map((x) => x.id).sort()

describe('a healthy run', () => {
  it('measures every score and raises no alarm', async () => {
    const r = await score({ days: WEEK })
    expect(r.scores.map((s) => s.id).sort()).toEqual(SCORES.map((s) => s.id).sort())
    expect(r.findings).toEqual([])
  })
})

describe('planted: the same topic every day ("loop")', () => {
  it('raises topic runs, topic variety and repeated words', async () => {
    const loop = (d: number) => [`Loop counter ${d}`, `Feedback loop ${d}`]
    const r = await score({ days: WEEK, titles: loop, about: () => 'the loop meter pulses, the loop signal returns, the tempo wraps round the loop' })
    expect(ids(r.findings)).toEqual(['behaviour.repeated-words', 'behaviour.topic-runs', 'behaviour.topic-variety'])
    const runs = r.findings.find((f) => f.id === 'behaviour.topic-runs')!
    expect(runs.title).toContain('7 days')
    expect(runs.fingerprint).toBe('behaviour.topic-runs|test')
    expect(r.findings.find((f) => f.id === 'behaviour.repeated-words')!.title).toContain('"loop"')
  })
})

describe('planted: rest', () => {
  it('40% rest every day raises the rest alarm', async () => {
    const r = await score({ days: WEEK, rest: () => 4 })
    expect(ids(r.findings)).toEqual(['behaviour.rest'])
    expect(r.findings[0]!.what).toContain('40%')
  })
  it('rest rising 3 days in a row raises it even under 25% a day', async () => {
    const r = await score({ days: WEEK, steps: 20, rest: (d) => [1, 1, 1, 1, 2, 3, 4][d]! })
    expect(ids(r.findings)).toEqual(['behaviour.rest'])
    expect(r.findings[0]!.title).toContain('rising 3 days')
  })
})

describe('planted: nothing new and nothing visual', () => {
  it('a day with nothing made misses the looks and the visual day', async () => {
    const r = await score({ days: WEEK, titles: (d) => (d === 3 ? [] : undefined) })
    expect(r.findings.map((f) => f.id)).toContain('behaviour.visual-every-day')
    expect(r.findings.map((f) => f.id)).toContain('behaviour.something-new')
  })
  it('things made only in the afternoon miss the morning look', async () => {
    const r = await score({ days: WEEK, hours: [13, 14] })
    expect(ids(r.findings)).toEqual(['behaviour.something-new'])
  })
})

describe('planted: rails and money from the summary', () => {
  it('a broken rail is a blocker', async () => {
    const summary = `# Fast-forward: FAIL\n\n- Simulated: ${WEEK[0]} to ${WEEK[6]} (7 days asked), 9 ticks\n- Spent: $1.000 of a $3 cap\n\n## Crashes: 0\n\n\n## Rails broken: 1\n\n- 2026-11-20T03:00: a decide call while asleep\n\n## Rejections and failures\n`
    const r = await score({ days: WEEK, summary })
    expect(r.findings).toEqual([expect.objectContaining({ id: 'behaviour.rails', severity: 'blocker' })])
    expect(r.findings[0]!.what).toContain('a decide call while asleep')
  })
})

describe('a score that cannot be measured', () => {
  it('gives qa.check-did-not-run, and the others still run', async () => {
    const { world, out } = makeRun({ days: WEEK })
    const run = readRun({ world, outDir: out, label: 'test' })
    const broken = { ...run, report: { ...run.report, made: null } } as unknown as RunData
    const r = await scoreRun(broken, levels, NOW)
    expect(r.findings).toEqual([expect.objectContaining({ id: DID_NOT_RUN, fingerprint: `${DID_NOT_RUN}|behaviour.kinds|test` })])
    expect(r.scores.length).toBe(SCORES.length - 1)
  })
  it('a folder that is not a world cannot be read', () => {
    expect(() => readRun({ world: 'no-such-folder', label: 'x' })).toThrow(/not a world/)
  })
})

describe('reading', () => {
  it('a live world with no summary scores its last 7 logged days', () => {
    const { world } = makeRun({ days: [...WEEK, '2026-11-26'], summary: null })
    const run = readRun({ world, label: 'live' })
    expect([run.from, run.to]).toEqual(['2026-11-20', '2026-11-26'])
    expect(run.prompts).toBeNull()
    expect(run.summary).toBeNull()
  })
  it('reads the summary the fast-forward writes', () => {
    const s = parseSummary('# Fast-forward: PASS\n\n- Simulated: 2026-11-19 to 2026-11-25 (7 days asked), 43196 ticks\n- Spent: $1.343 of a $3 cap; the daily pace is $0.42\n\n## Crashes: 0\n\n\n## Rails broken: 0\n\n## Build sessions: 10\n\n- Cost: $0.300 in all, $0.030 a session, the dearest $0.050 (a session over $1 fails the run)\n')
    expect(s).toEqual({ from: '2026-11-19', to: '2026-11-25', pass: true, spentUsd: 1.343, capUsd: 3, crashes: 0, railsBroken: [], dearestSessionUsd: 0.05 })
  })
  it('reads a plan file', () => {
    expect(parsePlan('2026-11-25', '# Plan\n\n1. **tend** (home), 30 min: Put the toy on the plinth.\n2. **rest**, 60 min: Beside the plinth.\n')).toEqual([
      { date: '2026-11-25', verb: 'tend', target: 'home', reason: 'Put the toy on the plinth.' },
      { date: '2026-11-25', verb: 'rest', target: '', reason: 'Beside the plinth.' },
    ])
  })
})
