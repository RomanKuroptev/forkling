import { appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Finding } from '../report/finding.ts'
import { writeRun } from '../report/write.ts'
import type { Score } from './score.ts'

/** Writes findings.json and report.md as every run does, plus scores.json, then `extra` (the spread) and a table of the scores at the end of report.md. */
export function writeBehaviour(outDir: string, runs: { label: string; from: string; to: string; scores: Score[] }[], findings: readonly Finding[], title: string, extra = ''): void {
  writeRun(outDir, findings, { title })
  writeFileSync(join(outDir, 'scores.json'), `${JSON.stringify(runs, null, 2)}\n`)
  const lines = ['', '## Scores', '']
  for (const r of runs) {
    lines.push(`### ${r.label} (${r.from} to ${r.to})`, '', '| Score | Value | Alarm |', '|---|---|---|')
    for (const s of r.scores) lines.push(`| ${s.title} | ${s.value.replace(/\|/g, '/')} | ${s.alarm ? 'yes' : ''} |`)
    lines.push('')
  }
  appendFileSync(join(outDir, 'report.md'), `${extra}${lines.join('\n')}`)
}
