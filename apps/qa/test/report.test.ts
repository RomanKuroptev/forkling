import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Finding } from '../src/report/finding.ts'
import { blocking, renderReport, writeRun } from '../src/report/write.ts'

const f = (severity: Finding['severity'], title: string, area: Finding['area'] = 'world'): Finding => ({
  id: 'x',
  fingerprint: `x|${title}`,
  area,
  severity,
  title,
  what: `what of ${title}`,
  causes: `causes of ${title}`,
  evidence: ['qa-out/world/a.png'],
  fixKind: 'code',
  firstSeen: '2026-11-20',
  runs: 1,
})

describe('report', () => {
  it('says plainly when nothing was found', () => {
    expect(renderReport([], { title: 'fast' })).toContain('Nothing was found.')
  })

  it('lists findings by severity with counts per area first', () => {
    const md = renderReport([f('minor', 'Small'), f('blocker', 'Broken', 'live'), f('major', 'Wrong')], { title: 'fast' })
    expect(md.indexOf('Broken')).toBeLessThan(md.indexOf('Wrong'))
    expect(md.indexOf('Wrong')).toBeLessThan(md.indexOf('Small'))
    expect(md).toMatch(/\| world \| 0 \| 1 \| 1 \| 0 \|/)
    expect(md).toContain('[qa-out/world/a.png]')
  })

  it('blocks only on blocker and major', () => {
    expect(blocking([f('minor', 'a'), f('info', 'b')])).toBe(false)
    expect(blocking([f('major', 'a')])).toBe(true)
  })

  it('writes findings.json and report.md', () => {
    const dir = mkdtempSync(join(tmpdir(), 'qa-'))
    writeRun(dir, [f('info', 'Note')], { title: 'fast' })
    expect(JSON.parse(readFileSync(join(dir, 'findings.json'), 'utf8'))).toHaveLength(1)
    expect(readFileSync(join(dir, 'report.md'), 'utf8')).toContain('Note')
  })
})
