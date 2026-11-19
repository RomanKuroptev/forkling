import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { Area, DID_NOT_RUN, type Finding, Findings, SEVERITY_ORDER } from '../report/finding.ts'
import { writeRun } from '../report/write.ts'
import { stockholmDate } from '../run/check.ts'
import { readRunInfo, writeRunInfo } from './run-info.ts'

// `pnpm qa gather`: one findings.json for the whole /qa run, from
//   qa-out/findings.json            the fast checks (pnpm qa fast)
//   qa-out/actions/**/findings*.json the Actions artefacts (gh run download)
//   qa-out/review/*.json            the reviewer agents' findings
// and one run.json with every area that was looked at.
// Findings from the planted world (QW.7) are acceptance data, never real problems: they go to
// qa-out/acceptance/planted-findings.json for the qw.md record and never reach findings.json or triage.

const rank = (f: Finding): number => SEVERITY_ORDER.indexOf(f.severity)

// One per fingerprint, in the order first seen. The highest severity wins (a look reviewer confirming an
// explorer's minor makes it major); the earliest firstSeen, the most runs and all evidence are kept.
export function mergeFindings(lists: readonly (readonly Finding[])[]): Finding[] {
  const out = new Map<string, Finding>()
  for (const f of lists.flat()) {
    const had = out.get(f.fingerprint)
    if (!had) {
      out.set(f.fingerprint, { ...f, evidence: [...f.evidence] })
      continue
    }
    const [win, lose] = rank(f) < rank(had) ? [f, had] : [had, f]
    out.set(f.fingerprint, {
      ...win,
      firstSeen: had.firstSeen < f.firstSeen ? had.firstSeen : f.firstSeen,
      runs: Math.max(had.runs, f.runs),
      evidence: [...new Set([...win.evidence, ...lose.evidence])],
    })
  }
  return [...out.values()]
}

const posix = (p: string): string => p.split('\\').join('/')

function filesUnder(dir: string, match: (name: string) => boolean): string[] {
  if (!existsSync(dir)) return []
  return (readdirSync(dir, { recursive: true }) as string[])
    .map((p) => join(dir, p))
    .filter((p) => statSync(p).isFile() && match(posix(p).split('/').pop()!))
    .sort()
}

// A file nobody can read is a check that did not run, in the area its path names (look reviews are world).
function unreadable(rel: string, error: unknown, now: Date): Finding {
  const lower = rel.toLowerCase()
  const area = lower.includes('look') ? 'world' : (Area.options.find((a) => lower.includes(a)) ?? 'live')
  return {
    id: DID_NOT_RUN,
    fingerprint: `${DID_NOT_RUN}|gather:${rel}`,
    area,
    severity: 'major',
    title: `A findings file could not be read: ${rel}`,
    what: `${rel} is not a valid findings list: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`,
    causes: 'Whatever that run or reviewer found is missing from this run, so a problem could go unseen.',
    evidence: [],
    fixKind: 'code',
    firstSeen: stockholmDate(now),
    runs: 1,
  }
}

/** A finding about the planted world: its fixture is `planted` (or `planted-…`), or its fingerprint names it. */
export function isPlanted(f: Finding): boolean {
  return f.fingerprint.includes('|planted|') || (f.fixture !== undefined && /^planted(-|$)/.test(f.fixture))
}

export type GatherOptions = { out: string; now: Date; from?: string[]; extraAreas?: Area[] }

export function gather({ out, now, from = [], extraAreas = [] }: GatherOptions): { findings: Finding[]; files: string[]; planted: Finding[] } {
  const files = [
    ...(existsSync(join(out, 'findings.json')) ? [join(out, 'findings.json')] : []),
    ...filesUnder(join(out, 'actions'), (n) => n.startsWith('findings') && n.endsWith('.json')),
    ...filesUnder(join(out, 'review'), (n) => n.endsWith('.json')),
    ...from.flatMap((d) => filesUnder(d, (n) => n.startsWith('findings') && n.endsWith('.json'))),
  ]
  const lists: Finding[][] = []
  const broken: Finding[] = []
  for (const file of files) {
    const rel = posix(relative(out, file))
    try {
      lists.push(Findings.parse(JSON.parse(readFileSync(file, 'utf8'))))
    } catch (e) {
      broken.push(unreadable(rel.startsWith('..') ? posix(file) : rel, e, now))
    }
  }
  const merged = mergeFindings([...lists, broken])
  const findings = merged.filter((f) => !isPlanted(f))
  const planted = merged.filter(isPlanted)
  const acceptance = join(out, 'acceptance')
  mkdirSync(acceptance, { recursive: true })
  writeFileSync(join(acceptance, 'planted-findings.json'), `${JSON.stringify(planted, null, 2)}
`)

  const runFiles = [out, ...filesUnder(join(out, 'actions'), (n) => n === 'run.json').map((f) => join(f, '..')), ...from]
  const areas = new Set<Area>(extraAreas)
  for (const dir of runFiles) {
    try {
      for (const a of readRunInfo(dir)?.areas ?? []) areas.add(a)
    } catch {
      // a broken run.json adds no areas, so nothing it names is counted clean
    }
  }
  writeRun(out, findings, { title: 'qa' })
  writeRunInfo(out, { title: 'qa', areas: [...areas] })
  return { findings, files, planted }
}
