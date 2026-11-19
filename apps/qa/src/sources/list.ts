import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { repoRoot } from '../paths.ts'
import type { CheckResult } from '../report/finding.ts'

// qa/sources.json: every source the spec and Roman named, and where it stands (audit spec 9.4, steps QS.1).
export const SOURCE_STATES = ['on the list', 'trial passed, not added', 'trial failed', 'blocked by robots.txt', 'dropped by Roman'] as const
export const SourceState = z.enum(SOURCE_STATES)

// Never these, whatever a trial says (v4 rule for new hosts).
const NEVER = [/(^|\.)reddit\.com$/, /(^|\.)redd\.it$/, /(^|\.)knowyourmeme\.com$/]

export const Source = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().min(1),
    // maker: things people make; pulse: what is going round now; reference: the encyclopedias and collections; manual: tinker only.
    group: z.enum(['maker', 'pulse', 'reference', 'manual']),
    hosts: z.array(z.string().min(1)).min(1),
    state: SourceState,
    reason: z.string().min(1),
    // The source trial's report, repo-relative, or null when there was none.
    trial: z.string().min(1).nullable(),
    promisedBy: z.string().min(1),
    // What Roman should do, for anything not on the list.
    recommended: z.string().min(1).optional(),
  })
  .superRefine((s, ctx) => {
    for (const h of s.hosts) if (NEVER.some((re) => re.test(h))) ctx.addIssue({ code: 'custom', message: `${h} is never a source` })
    if (s.state !== 'on the list' && !s.recommended) ctx.addIssue({ code: 'custom', message: `${s.id} is not on the list and has no recommended answer` })
  })
export type Source = z.infer<typeof Source>

export const SourceList = z.object({ sources: z.array(Source) })
export type SourceList = z.infer<typeof SourceList>

export const sourceListPath = (): string => join(repoRoot(), 'qa', 'sources.json')

export const readSourceList = (path = sourceListPath()): SourceList => SourceList.parse(JSON.parse(readFileSync(path, 'utf8')))

const LIST_ID = 'sources.list-matches-engine'

// The file and the engine's allowlist agree both ways, and every trial report it names exists.
export function checkListMatchesEngine(list: SourceList, engineHosts: readonly string[], fileExists: (repoPath: string) => boolean = (p) => existsSync(join(repoRoot(), p))): CheckResult[] {
  const out: CheckResult[] = []
  const listed = new Set(list.sources.filter((s) => s.state === 'on the list').flatMap((s) => s.hosts))
  const engine = new Set(engineHosts)
  for (const h of listed) {
    if (!engine.has(h))
      out.push({
        id: LIST_ID,
        fingerprint: `${LIST_ID}|not-in-engine|${h}`,
        severity: 'major',
        title: `qa/sources.json says ${h} is on the list, but the engine does not read it`,
        what: `${h} is marked "on the list" in qa/sources.json and is not in ALLOWLIST (apps/mind/src/web/allowlist.ts).`,
        causes: 'The source report would claim Merge reads a site it cannot read.',
        evidence: ['qa/sources.json'],
        where: 'qa/sources.json',
        fixKind: 'data',
      })
  }
  for (const h of engine) {
    if (!listed.has(h))
      out.push({
        id: LIST_ID,
        fingerprint: `${LIST_ID}|not-in-file|${h}`,
        severity: 'major',
        title: `The engine reads ${h}, but qa/sources.json does not list it`,
        what: `${h} is in ALLOWLIST and no source marked "on the list" in qa/sources.json names it.`,
        causes: 'The source checks do not know about a site Merge reads, so nothing watches it.',
        evidence: ['apps/mind/src/web/allowlist.ts'],
        where: 'qa/sources.json',
        fixKind: 'data',
      })
  }
  for (const s of list.sources) {
    if (s.trial && !fileExists(s.trial))
      out.push({
        id: LIST_ID,
        fingerprint: `${LIST_ID}|no-trial|${s.id}`,
        severity: 'minor',
        title: `The trial report for ${s.name} is missing`,
        what: `qa/sources.json points at ${s.trial}, which does not exist.`,
        causes: 'Nobody can read why the source stands where it does.',
        evidence: ['qa/sources.json'],
        where: 'qa/sources.json',
        fixKind: 'data',
      })
  }
  return out
}

const PROMISED_ID = 'sources.promised-missing'

const severityFor = (s: Source): CheckResult['severity'] => (s.state === 'dropped by Roman' ? 'info' : s.group === 'pulse' ? 'major' : 'minor')

// Every promised source that is not on the list. Wiring a source whose trial passed is a code fix (v4 rule for new hosts:
// robots.txt allows and the trial passes); anything else needs Roman's choice, so it says what to choose.
export function checkPromisedMissing(list: SourceList): CheckResult[] {
  return list.sources
    .filter((s) => s.state !== 'on the list')
    .map((s) => ({
      id: PROMISED_ID,
      fingerprint: `${PROMISED_ID}|${s.id}`,
      severity: severityFor(s),
      title: `${s.name} was promised but Merge cannot read it (${s.state})`,
      what: `${s.name} (${s.hosts.join(', ')}, promised by ${s.promisedBy}) is not on the allowlist: ${s.reason} Recommended: ${s.recommended}`,
      causes:
        s.group === 'pulse'
          ? 'Merge has one less way to see what is going round now, so its memes and works follow less of the pulse.'
          : 'Merge has one less kind of thing to read and make from.',
      evidence: s.trial ? [s.trial] : ['qa/sources.json'],
      where: 'apps/mind/src/web/allowlist.ts',
      fixKind: s.state === 'trial passed, not added' ? 'code' : 'roman',
    }))
}
