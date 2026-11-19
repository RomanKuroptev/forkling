import { z } from 'zod'

// One format for everything the harness finds (audit spec section 3).
export const Area = z.enum(['page', 'world', 'e2e', 'behaviour', 'live', 'coverage'])
export type Area = z.infer<typeof Area>

// blocker: broken for visitors or a rail broken. major: clearly wrong. minor: small. info: measured, no action.
export const Severity = z.enum(['blocker', 'major', 'minor', 'info'])
export type Severity = z.infer<typeof Severity>
export const SEVERITY_ORDER: readonly Severity[] = ['blocker', 'major', 'minor', 'info']

// What the triage loop may do with it (spec section 10).
export const FixKind = z.enum(['code', 'look', 'prompt', 'data', 'server', 'roman'])
export type FixKind = z.infer<typeof FixKind>

// Pictures for Roman are PNG, never SVG; other evidence (JSON, logs) is fine.
const EvidencePath = z
  .string()
  .min(1)
  .refine((p) => !p.toLowerCase().endsWith('.svg'), 'pictures are PNG, never SVG')

export const Finding = z.object({
  id: z.string().min(1),
  fingerprint: z.string().min(1),
  area: Area,
  severity: Severity,
  title: z.string().min(1),
  what: z.string().min(1),
  causes: z.string().min(1),
  evidence: z.array(EvidencePath),
  where: z.string().min(1).optional(),
  fixKind: FixKind,
  fixture: z.string().min(1).optional(),
  firstSeen: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  runs: z.number().int().min(1),
})
export type Finding = z.infer<typeof Finding>

// A findings file: one entry per fingerprint, so the same problem is one issue.
export const Findings = z.array(Finding).superRefine((list, ctx) => {
  const seen = new Set<string>()
  for (const f of list) {
    if (seen.has(f.fingerprint)) ctx.addIssue({ code: 'custom', message: `fingerprint twice: ${f.fingerprint}` })
    seen.add(f.fingerprint)
  }
})

// What a check returns: area, firstSeen and runs are filled in by the runner.
export const CheckResult = Finding.omit({ area: true, firstSeen: true, runs: true }).extend({ area: Area.optional() })
export type CheckResult = z.infer<typeof CheckResult>

export const DID_NOT_RUN = 'qa.check-did-not-run'
