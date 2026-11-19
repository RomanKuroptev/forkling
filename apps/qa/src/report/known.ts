import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

// qa/known-findings.json: majors that are already tracked in an open `qa` issue. Spec 5 blocks a PR only on a *new*
// blocker or major, so a known major stays in the report but does not turn every PR red until it is fixed. Blockers are
// never excused. The fix PR removes its entry. Adding an entry needs an open issue and a reason.
export const KnownFindings = z
  .object({
    version: z.literal(1),
    entries: z.array(z.object({ fingerprint: z.string().min(1), issue: z.number().int().positive(), reason: z.string().min(1) }).strict()),
  })
  .strict()
  .superRefine((file, ctx) => {
    const seen = new Set<string>()
    for (const e of file.entries) {
      if (seen.has(e.fingerprint)) ctx.addIssue({ code: 'custom', message: `listed twice: ${e.fingerprint}` })
      seen.add(e.fingerprint)
    }
  })
export type KnownFindings = z.infer<typeof KnownFindings>

export const knownSet = (file: KnownFindings): Set<string> => new Set(file.entries.map((e) => e.fingerprint))

export function loadKnown(root: string): Set<string> {
  const path = join(root, 'qa', 'known-findings.json')
  return existsSync(path) ? knownSet(KnownFindings.parse(JSON.parse(readFileSync(path, 'utf8')))) : new Set()
}
