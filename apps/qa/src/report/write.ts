import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Area, type Finding, Findings, SEVERITY_ORDER } from './finding.ts'

export type RunInfo = { title: string }

// A new blocker or major blocks a PR; minor and info never do (spec section 5). A major that waits for Roman's choice
// (fixKind roman) does not: no PR can make it, and it would hold every PR until he decides. It stays in the report.
export const blocking = (findings: readonly Finding[]): boolean =>
  findings.some((f) => f.severity === 'blocker' || (f.severity === 'major' && f.fixKind !== 'roman'))

const evidenceLinks = (f: Finding): string => (f.evidence.length === 0 ? '' : `\n  Evidence: ${f.evidence.map((e) => `[${e}](${e})`).join(', ')}`)

// report.md: plain words, counts per area at the top, then the findings by severity.
export function renderReport(findings: readonly Finding[], run: RunInfo): string {
  const lines = [`# QA report: ${run.title}`, '']
  if (findings.length === 0) return [...lines, 'Nothing was found.', ''].join('\n')
  lines.push(`| Area | ${SEVERITY_ORDER.join(' | ')} |`, `|---|${SEVERITY_ORDER.map(() => '---').join('|')}|`)
  for (const area of Area.options) {
    const mine = findings.filter((f) => f.area === area)
    if (mine.length === 0) continue
    lines.push(`| ${area} | ${SEVERITY_ORDER.map((s) => mine.filter((f) => f.severity === s).length).join(' | ')} |`)
  }
  lines.push('')
  for (const severity of SEVERITY_ORDER) {
    const mine = findings.filter((f) => f.severity === severity)
    if (mine.length === 0) continue
    lines.push(`## ${severity} (${mine.length})`, '')
    for (const f of mine) {
      const where = [f.fixture && `fixture ${f.fixture}`, f.where && `in ${f.where}`].filter(Boolean).join(', ')
      lines.push(`- **${f.title}** (${f.area}, ${f.fixKind}${where ? `, ${where}` : ''})  \n  ${f.what} ${f.causes}${evidenceLinks(f)}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

export function writeRun(outDir: string, findings: readonly Finding[], run: RunInfo): void {
  const checked = Findings.parse(findings)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'findings.json'), `${JSON.stringify(checked, null, 2)}\n`)
  writeFileSync(join(outDir, 'report.md'), renderReport(checked, run))
}
