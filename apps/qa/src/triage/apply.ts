import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import type { Finding } from '../report/finding.ts'
import { fingerprintHash, withMarker } from './marker.ts'
import { CLOSE_AFTER_CLEAN_RUNS, type Action, type Pick, type TriagePlan } from './plan.ts'
import type { Tracker } from './tracker.ts'

export type ApplyOptions = {
  // Evidence paths in findings are relative to this folder (the repo root).
  root: string
  date: string
}

export type TriageResult = {
  actions: Action[]
  opened: { fingerprint: string; issue: number }[]
  commented: number[]
  reopened: number[]
  closed: number[]
  updated: number[]
  picks: Pick[]
}

const basename = (p: string): string => p.split(/[\\/]/).pop() ?? p

// Evidence lines: PNGs are put on the qa-evidence branch and shown; other files are named; a missing PNG is
// listed so the issue says so, and the run goes on.
async function evidenceLines(f: Finding, tracker: Tracker, opts: ApplyOptions, uploaded: Map<string, string>): Promise<string[]> {
  const lines: string[] = []
  for (const path of f.evidence) {
    if (!path.toLowerCase().endsWith('.png')) {
      lines.push(`- \`${path}\``)
      continue
    }
    const full = isAbsolute(path) ? path : join(opts.root, path)
    if (!existsSync(full)) {
      lines.push(`- missing: \`${path}\``)
      continue
    }
    const remote = `${fingerprintHash(f.fingerprint)}/${opts.date}/${basename(path)}`
    let url = uploaded.get(remote)
    if (url === undefined) {
      url = await tracker.uploadPicture(readFileSync(full), remote)
      uploaded.set(remote, url)
    }
    lines.push(`![${basename(path)}](${url})`)
  }
  return lines.length === 0 ? ['(none)'] : lines
}

function facts(f: Finding): string {
  const rows: [string, string | undefined][] = [
    ['Severity', f.severity],
    ['Area', f.area],
    ['Fix kind', f.fixKind],
    ['Fixture', f.fixture],
    ['Where', f.where && `\`${f.where}\``],
    ['Check', `\`${f.id}\``],
    ['First seen', f.firstSeen],
    ['Fingerprint', `\`${f.fingerprint}\``],
  ]
  return ['| | |', '|---|---|', ...rows.filter(([, v]) => v).map(([k, v]) => `| ${k} | ${v} |`)].join('\n')
}

async function issueBody(f: Finding, tracker: Tracker, opts: ApplyOptions, uploaded: Map<string, string>): Promise<string> {
  return [
    `**What:** ${f.what}`,
    '',
    `**What it causes:** ${f.causes}`,
    '',
    facts(f),
    '',
    '**Evidence**',
    '',
    ...(await evidenceLines(f, tracker, opts, uploaded)),
    '',
    `Opened by \`pnpm qa triage\` (the audit harness). It closes itself after ${CLOSE_AFTER_CLEAN_RUNS} runs in a row that look and do not see it.`,
  ].join('\n')
}

async function changeNote(heading: string, f: Finding, tracker: Tracker, opts: ApplyOptions, uploaded: Map<string, string>): Promise<string> {
  return [heading, '', `**What:** ${f.what}`, '', `Severity: ${f.severity}.`, '', '**Evidence**', '', ...(await evidenceLines(f, tracker, opts, uploaded))].join('\n')
}

export async function applyPlan(plan: TriagePlan, tracker: Tracker, opts: ApplyOptions): Promise<TriageResult> {
  const result: TriageResult = { actions: plan.actions, opened: [], commented: [], reopened: [], closed: [], updated: [], picks: [] }
  const uploaded = new Map<string, string>()
  for (const a of plan.actions) {
    switch (a.kind) {
      case 'open': {
        const body = withMarker(await issueBody(a.finding, tracker, opts, uploaded), a.state)
        const issue = await tracker.createIssue({ title: a.finding.title, body, labels: a.labels })
        result.opened.push({ fingerprint: a.finding.fingerprint, issue })
        break
      }
      case 'comment':
        await tracker.comment(a.issue.number, await changeNote(`The evidence changed (${opts.date}).`, a.finding, tracker, opts, uploaded))
        await tracker.editBody(a.issue.number, withMarker(a.issue.body, a.state))
        result.commented.push(a.issue.number)
        break
      case 'reopen':
        await tracker.reopen(a.issue.number, await changeNote(`Seen again on ${opts.date}, so this is open again.`, a.finding, tracker, opts, uploaded))
        await tracker.editBody(a.issue.number, withMarker(a.issue.body, a.state))
        result.reopened.push(a.issue.number)
        break
      case 'update':
        await tracker.editBody(a.issue.number, withMarker(a.issue.body, a.state))
        result.updated.push(a.issue.number)
        break
      case 'close':
        await tracker.editBody(a.issue.number, withMarker(a.issue.body, a.state))
        await tracker.close(
          a.issue.number,
          `This was not seen for ${CLOSE_AFTER_CLEAN_RUNS} runs in a row (the last on ${opts.date}), so it is closed${a.state.fixedBy ? `: fixed by #${a.state.fixedBy}.` : '.'}`,
        )
        result.closed.push(a.issue.number)
        break
    }
  }
  const openedBy = new Map(result.opened.map((o) => [o.fingerprint, o.issue]))
  result.picks = plan.picks.map((p) => (p.issue === undefined && openedBy.has(p.fingerprint) ? { ...p, issue: openedBy.get(p.fingerprint)! } : p))
  return result
}
