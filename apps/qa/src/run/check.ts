import { type Area, CheckResult, DID_NOT_RUN, type Finding } from '../report/finding.ts'

export type CheckContext = {
  // The time of the run (findings' firstSeen is its Stockholm date).
  now: Date
}

export type Check = {
  id: string
  area: Area
  title: string
  run: (ctx: CheckContext) => Promise<CheckResult[]>
}

export const stockholmDate = (d: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e))

export const didNotRun = (check: Pick<Check, 'id' | 'area' | 'title'>, error: unknown, now: Date): Finding => ({
  id: DID_NOT_RUN,
  fingerprint: `${DID_NOT_RUN}|${check.id}`,
  area: check.area,
  severity: 'major',
  title: `A check did not run: ${check.title}`,
  what: `The check ${check.id} stopped with: ${message(error)}`,
  causes: 'Nothing is known about what this check looks at, so a problem there could go unseen.',
  evidence: [],
  fixKind: 'code',
  firstSeen: stockholmDate(now),
  runs: 1,
})

// Runs every check in turn. A check that throws, or returns something that is not a finding, gives
// qa.check-did-not-run; it is never a silent pass, and the checks after it still run.
export async function runChecks(checks: readonly Check[], ctx: CheckContext): Promise<Finding[]> {
  const out: Finding[] = []
  for (const check of checks) {
    try {
      const results = await check.run(ctx)
      const parsed = results.map((r) => CheckResult.parse(r))
      for (const r of parsed) out.push({ ...r, area: r.area ?? check.area, firstSeen: stockholmDate(ctx.now), runs: 1 })
    } catch (e) {
      out.push(didNotRun(check, e, ctx.now))
    }
  }
  return out
}
