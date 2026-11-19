import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Finding } from '../src/report/finding.ts'
import { gather, mergeFindings } from '../src/triage/gather.ts'
import { readRunInfo, writeRunInfo } from '../src/triage/run-info.ts'

const now = new Date('2026-11-20T10:00:00Z')
const f = (over: Partial<Finding> = {}): Finding => ({
  id: 'world.floating',
  fingerprint: 'fp-a',
  area: 'world',
  severity: 'minor',
  title: 'A sign floats',
  what: 'what',
  causes: 'causes',
  evidence: ['qa-out/a.png'],
  fixKind: 'look',
  firstSeen: '2026-11-19',
  runs: 1,
  ...over,
})

const write = (file: string, data: unknown): void => {
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data))
}

describe('merging findings', () => {
  it('keeps one per fingerprint: the highest severity wins, earliest firstSeen, most runs, all evidence', () => {
    const explorer = f({ severity: 'minor', title: 'Explorer says', firstSeen: '2026-11-18', runs: 1, evidence: ['qa-out/e.png'] })
    const reviewer = f({ severity: 'major', title: 'Look reviewer confirms', firstSeen: '2026-11-20', runs: 3, evidence: ['qa-out/r.png', 'qa-out/e.png'] })
    const [m] = mergeFindings([[explorer], [reviewer]])
    expect(m).toMatchObject({ severity: 'major', title: 'Look reviewer confirms', firstSeen: '2026-11-18', runs: 3 })
    expect(m!.evidence).toEqual(['qa-out/r.png', 'qa-out/e.png'])
  })

  it('is the same when run twice', () => {
    const once = mergeFindings([[f()], [f({ fingerprint: 'fp-b' })]])
    expect(mergeFindings([once, once])).toEqual(once)
  })
})

describe('pnpm qa gather', () => {
  it('reads fast, the downloaded artefacts and the reviewers, writes one findings.json and the covered areas', () => {
    const out = mkdtempSync(join(tmpdir(), 'qa-gather-'))
    write(join(out, 'findings.json'), [f()])
    writeRunInfo(out, { title: 'fast', areas: ['world'] })
    write(join(out, 'actions', 'qa-live', 'findings.json'), [f({ fingerprint: 'live-1', area: 'live' })])
    write(join(out, 'actions', 'qa-live', 'run.json'), { title: 'live', areas: ['live'] })
    write(join(out, 'review', 'world-explorer.json'), [f({ fingerprint: 'fp-a', severity: 'major' })])
    const r = gather({ out, now, extraAreas: ['behaviour'] })
    expect(r.findings.map((x) => [x.fingerprint, x.severity])).toEqual([['fp-a', 'major'], ['live-1', 'minor']])
    const saved = JSON.parse(readFileSync(join(out, 'findings.json'), 'utf8')) as Finding[]
    expect(saved).toHaveLength(2)
    expect(readFileSync(join(out, 'report.md'), 'utf8')).toContain('A sign floats')
    expect(readRunInfo(out)?.areas.sort()).toEqual(['behaviour', 'live', 'world'])
  })

  it('a file that does not parse becomes qa.check-did-not-run, not a crash', () => {
    const out = mkdtempSync(join(tmpdir(), 'qa-gather-'))
    write(join(out, 'review', 'behaviour-reviewer.json'), '{ not json')
    write(join(out, 'actions', 'qa-live', 'findings.json'), [{ id: 'x' }])
    const r = gather({ out, now })
    const broken = r.findings.filter((x) => x.id === 'qa.check-did-not-run')
    expect(broken.map((x) => x.fingerprint).sort()).toEqual([
      'qa.check-did-not-run|gather:actions/qa-live/findings.json',
      'qa.check-did-not-run|gather:review/behaviour-reviewer.json',
    ])
    expect(broken.find((x) => x.fingerprint.includes('behaviour-reviewer'))!.area).toBe('behaviour')
    expect(broken.find((x) => x.fingerprint.includes('qa-live'))!.area).toBe('live')
  })

  it('a run with nothing to read says so in an empty findings.json', () => {
    const out = mkdtempSync(join(tmpdir(), 'qa-gather-'))
    expect(gather({ out, now }).findings).toEqual([])
    expect(JSON.parse(readFileSync(join(out, 'findings.json'), 'utf8'))).toEqual([])
  })
})
