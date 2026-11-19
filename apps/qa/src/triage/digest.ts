import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { Findings, SEVERITY_ORDER, type Finding } from '../report/finding.ts'
import { stockholmDate } from '../run/check.ts'
import { readFixes } from './fix-try.ts'
import { parseMarker } from './marker.ts'
import type { Tracker } from './tracker.ts'

// The digest (spec 10.8): qa-out/digest.md, and with --post one comment on the pinned "QA digest" issue,
// so Roman gets one email per run, not twenty.

const TriageSummary = z.object({
  dryRun: z.boolean().default(false),
  opened: z.array(z.object({ issue: z.number() })).default([]),
  commented: z.array(z.number()).default([]),
  reopened: z.array(z.number()).default([]),
  closed: z.array(z.number()).default([]),
})

// The five world sheets (one per fixture, `pnpm qa world`) and room for one more.
const MAX_SHEETS = 6
const SUMMARY_LINES = 15

const readJson = (file: string): unknown => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined)
const list = (ns: number[]): string => (ns.length === 0 ? 'none' : ns.map((n) => `#${n}`).join(', '))
const recommended = (body: string): string => /\*\*Recommended answer:\*\*\s*(.+)/.exec(body)?.[1]?.trim() ?? 'no recommended answer written yet'

// The behaviour and sources summaries the other parts of /qa write (first lines only).
function summary(out: string, name: string): string[] {
  const file = join(out, name, 'summary.md')
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8').trim().split('\n').slice(0, SUMMARY_LINES)
}

export const sheetsOf = (out: string): string[] => {
  const dir = join(out, 'sheets')
  return existsSync(dir) ? readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.png')).sort().slice(0, MAX_SHEETS) : []
}

export type DigestInput = {
  out: string
  tracker: Tracker
  now: Date
  mode: string
  // Where a sheet (by file name) is shown from: a relative path locally, the qa-evidence address when posted.
  pictureUrl: (name: string) => Promise<string>
}

export async function renderDigest({ out, tracker, now, mode, pictureUrl }: DigestInput): Promise<string> {
  const date = stockholmDate(now)
  const findings: Finding[] = Findings.parse(readJson(join(out, 'findings.json')) ?? [])
  const triage = TriageSummary.parse(readJson(join(out, 'triage.json')) ?? {})
  const fixes = readFixes(out).filter((f) => f.date === date)
  const open = (await tracker.listIssues('qa')).filter((i) => i.state === 'open')
  // Hand-filed qa issues (phase-2) are Roman's backlog already; the digest lists what triage manages.
  const waiting = open.filter((i) => i.labels.includes('needs-roman') && parseMarker(i.body))
  const gaveUp = open.filter((i) => i.labels.includes('fix-failed') && parseMarker(i.body))

  const lines = [`# QA digest, ${date} (${mode})`, '']
  if (findings.length === 0) lines.push('Nothing was found.')
  else lines.push(`**Found:** ${SEVERITY_ORDER.map((s) => `${findings.filter((f) => f.severity === s).length} ${s}`).join(', ')}.`)
  lines.push(
    '',
    triage.dryRun
      ? `**Issues (triage was a dry run, nothing changed on GitHub):** would open ${triage.opened.length}; would close ${list(triage.closed)}; would reopen ${list(triage.reopened)}; would comment on ${list(triage.commented)}.`
      : `**Issues:** Opened ${list(triage.opened.map((o) => o.issue))}; closed ${list(triage.closed)}; reopened ${list(triage.reopened)}; new evidence on ${list(triage.commented)}.`,
    '',
    '## Fixed and merged',
    '',
  )
  const merged = fixes.filter((f) => f.result === 'merged')
  lines.push(...(merged.length === 0 ? ['Nothing was merged in this run.'] : merged.map((f) => `- #${f.issue} ${f.title}: fixed by #${f.pr}`)))
  const failed = fixes.filter((f) => f.result === 'failed')
  if (failed.length > 0) lines.push('', 'Tried and not yet working (one more try next run):', ...failed.map((f) => `- #${f.issue} ${f.title}: ${f.what}`))

  lines.push('', '## Waiting for Roman', '')
  lines.push(...(waiting.length === 0 ? ['Nothing is waiting for Roman.'] : waiting.map((i) => `- #${i.number} ${i.title}. Recommended answer: ${recommended(i.body)}`)))
  if (gaveUp.length > 0) lines.push('', '## Given up after 2 tries (fix-failed)', '', ...gaveUp.map((i) => `- #${i.number} ${i.title}`))

  for (const [name, heading] of [['behaviour', 'Behaviour'], ['sources', 'Data sources']] as const) {
    const s = summary(out, name)
    if (s.length > 0) lines.push('', `## ${heading}`, '', ...s)
  }

  const sheets = sheetsOf(out)
  if (sheets.length > 0) {
    lines.push('', '## Pictures', '')
    for (const name of sheets) lines.push(`![${name}](${await pictureUrl(name)})`)
  }
  lines.push('')
  return lines.join('\n')
}

export type DigestDeps = { out: string; tracker: Tracker; now?: Date; digestIssue: number; log?: (line: string) => void }

// `pnpm qa digest [--post] [--mode nightly|weekly|release|qa]`
export async function digestCommand(argv: string[], deps: DigestDeps): Promise<number> {
  const { values } = parseArgs({ args: argv, options: { post: { type: 'boolean', default: false }, mode: { type: 'string', default: 'qa' } } })
  const log = deps.log ?? console.log
  const now = deps.now ?? new Date()
  const date = stockholmDate(now)
  const base = { out: deps.out, tracker: deps.tracker, now, mode: values.mode }

  const local = await renderDigest({ ...base, pictureUrl: async (name) => `sheets/${name}` })
  mkdirSync(deps.out, { recursive: true })
  writeFileSync(join(deps.out, 'digest.md'), local)
  log(`Written: ${join(deps.out, 'digest.md')}`)
  if (!values.post) return 0

  const posted = await renderDigest({
    ...base,
    pictureUrl: (name) => deps.tracker.uploadPicture(readFileSync(join(deps.out, 'sheets', name)), `digest/${date}/${name}`),
  })
  await deps.tracker.comment(deps.digestIssue, posted)
  log(`Posted the digest on #${deps.digestIssue}.`)
  return 0
}
