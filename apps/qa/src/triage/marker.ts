import { createHash } from 'node:crypto'
import { z } from 'zod'
import { Area, type Finding } from '../report/finding.ts'

// The triage state of one issue, kept as a hidden line in its body: the issue is already the one record per
// fingerprint, so no state file is needed and any PC can run triage. An issue without it is not ours.
export const QaState = z.object({
  fp: z.string().min(1),
  area: Area,
  // Covered runs in a row that did not see the finding; 2 closes the issue.
  clean: z.number().int().min(0),
  // evidenceHash of the finding as the issue last told it.
  evidence: z.string(),
  // Failed fix attempts; 2 labels the issue fix-failed.
  tries: z.number().int().min(0),
  // The fix PR that was merged for it (pnpm qa fix-try --merged), so the close can say what fixed it.
  fixedBy: z.number().int().positive().optional(),
})
export type QaState = z.infer<typeof QaState>

const MARKER = /<!-- qa-state (.*?) -->/

// < and > are escaped so a fingerprint can never end the HTML comment early.
const encode = (s: QaState): string => JSON.stringify(s).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')

export function parseMarker(body: string): QaState | null {
  const m = MARKER.exec(body)
  if (!m) return null
  try {
    const parsed = QaState.safeParse(JSON.parse(m[1]!))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function withMarker(body: string, state: QaState): string {
  const line = `<!-- qa-state ${encode(state)} -->`
  return MARKER.test(body) ? body.replace(MARKER, line) : `${body.trimEnd()}\n\n${line}\n`
}

const basename = (p: string): string => p.split(/[\\/]/).pop() ?? p

// What counts as "the evidence changed": severity, the what text, and the evidence file names. Picture bytes are
// left out on purpose: a re-render differs by a pixel every run and would comment every night.
export function evidenceHash(f: Finding): string {
  const names = f.evidence.map(basename).sort()
  return createHash('sha256').update(JSON.stringify([f.severity, f.what, names])).digest('hex').slice(0, 12)
}

export const fingerprintHash = (fp: string): string => createHash('sha256').update(fp).digest('hex').slice(0, 12)
