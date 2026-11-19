import { type Area, DID_NOT_RUN, type Finding, type FixKind, SEVERITY_ORDER, type Severity } from '../report/finding.ts'
import { evidenceHash, parseMarker, type QaState } from './marker.ts'
import type { Issue } from './tracker.ts'

// Triage as a pure step (audit spec section 10, items 2 and 3): this run's findings and the qa issues on GitHub
// in, the actions and the picks out. apply.ts carries them out through a Tracker.

export type Action =
  | { kind: 'open'; finding: Finding; state: QaState; labels: string[] }
  | { kind: 'comment'; issue: Issue; finding: Finding; state: QaState }
  | { kind: 'reopen'; issue: Issue; finding: Finding; state: QaState }
  // Only the hidden state line changes (the clean count); no comment, so no email.
  | { kind: 'update'; issue: Issue; state: QaState }
  | { kind: 'close'; issue: Issue; state: QaState }

export type Pick = { fingerprint: string; issue?: number; severity: Severity; fixKind: FixKind; area: Area; title: string }

export type TriagePlan = { actions: Action[]; picks: Pick[] }

export type TriageInput = {
  findings: readonly Finding[]
  issues: readonly Issue[]
  // The areas this run looked at. A finding that is missing only counts as clean when its area was looked at.
  coveredAreas: readonly Area[]
  date: string
  maxPicks?: number
}

export const CLOSE_AFTER_CLEAN_RUNS = 2
// Kinds the fixer may never take on (spec 10): they go to Roman.
export const ROMAN_KINDS: readonly FixKind[] = ['server', 'roman']
export const SKIP_LABELS = ['needs-roman', 'fix-failed', 'qa-rules']

export const labelsFor = (f: Finding): string[] => (ROMAN_KINDS.includes(f.fixKind) ? ['qa', 'needs-roman'] : ['qa'])

// Our issues by fingerprint. Two issues with one fingerprint should not happen; the open one, then the oldest, wins.
function byFingerprint(issues: readonly Issue[]): Map<string, { issue: Issue; state: QaState }> {
  const out = new Map<string, { issue: Issue; state: QaState }>()
  const sorted = [...issues].sort((a, b) => (a.state === b.state ? a.number - b.number : a.state === 'open' ? -1 : 1))
  for (const issue of sorted) {
    const state = parseMarker(issue.body)
    if (state && !out.has(state.fp)) out.set(state.fp, { issue, state })
  }
  return out
}

export function planTriage({ findings, issues, coveredAreas, date, maxPicks = 5 }: TriageInput): TriagePlan {
  const known = byFingerprint(issues)
  // An area where a check did not run was not fully looked at, so nothing in it counts as clean.
  const broken = new Set(findings.filter((f) => f.id === DID_NOT_RUN).map((f) => f.area))
  const covered = new Set(coveredAreas.filter((a) => !broken.has(a)))
  const seen = new Set(findings.map((f) => f.fingerprint))
  const actions: Action[] = []

  // info is measured, no action (spec 3): it goes into the digest, never into an issue.
  for (const finding of findings.filter((f) => f.severity !== 'info')) {
    const evidence = evidenceHash(finding)
    const hit = known.get(finding.fingerprint)
    if (!hit) {
      actions.push({ kind: 'open', finding, labels: labelsFor(finding), state: { fp: finding.fingerprint, area: finding.area, clean: 0, evidence, tries: 0 } })
      continue
    }
    const { issue, state } = hit
    const next = { ...state, area: finding.area, clean: 0, evidence }
    if (issue.state === 'closed') {
      // It came back, so whatever fix was merged did not hold.
      const { fixedBy: _gone, ...reopened } = next
      actions.push({ kind: 'reopen', issue, finding, state: reopened })
    } else if (state.evidence !== evidence) actions.push({ kind: 'comment', issue, finding, state: next })
    else if (state.clean > 0) actions.push({ kind: 'update', issue, state: next })
  }

  for (const [fp, { issue, state }] of known) {
    if (seen.has(fp) || issue.state === 'closed' || !covered.has(state.area)) continue
    const next = { ...state, clean: state.clean + 1 }
    actions.push({ kind: next.clean >= CLOSE_AFTER_CLEAN_RUNS ? 'close' : 'update', issue, state: next })
  }

  return { actions, picks: pickFixes(findings, known, date, maxPicks) }
}

// Up to maxPicks blockers and majors, blockers first, then the oldest; never needs-roman, fix-failed or qa-rules.
function pickFixes(findings: readonly Finding[], known: Map<string, { issue: Issue }>, date: string, max: number): Pick[] {
  const rank = (s: Severity): number => SEVERITY_ORDER.indexOf(s)
  const candidates = findings
    .filter((f) => f.severity === 'blocker' || f.severity === 'major')
    .filter((f) => !ROMAN_KINDS.includes(f.fixKind))
    .filter((f) => !known.get(f.fingerprint)?.issue.labels.some((l) => SKIP_LABELS.includes(l)))
    .map((f) => {
      const issue = known.get(f.fingerprint)?.issue
      const opened = issue ? issue.createdAt.slice(0, 10) : date
      return { f, issue, since: opened < f.firstSeen ? opened : f.firstSeen }
    })
    .sort((a, b) => rank(a.f.severity) - rank(b.f.severity) || a.since.localeCompare(b.since) || a.f.fingerprint.localeCompare(b.f.fingerprint))
  return candidates.slice(0, max).map(({ f, issue }) => ({
    fingerprint: f.fingerprint,
    ...(issue ? { issue: issue.number } : {}),
    severity: f.severity,
    fixKind: f.fixKind,
    area: f.area,
    title: f.title,
  }))
}
