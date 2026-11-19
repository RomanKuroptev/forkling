import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { Area, Findings } from '../report/finding.ts'
import { stockholmDate } from '../run/check.ts'
import { applyPlan } from './apply.ts'
import { GhTracker } from './gh-tracker.ts'
import { planTriage } from './plan.ts'
import { readRunInfo } from './run-info.ts'
import { DryRunTracker, type Tracker } from './tracker.ts'

export const FORKLING_REPO = 'RomanKuroptev/forkling'

// cwd: where the user typed the command (pnpm runs the package script in apps/qa, so the CLI passes INIT_CWD).
export type TriageCommandDeps = { tracker?: Tracker; now?: Date; root: string; out: string; cwd?: string; log?: (line: string) => void }

// `pnpm qa triage [--findings <file>] [--areas a,b] [--dry-run] [--repo owner/name]`
export async function triageCommand(argv: string[], deps: TriageCommandDeps): Promise<number> {
  const { values } = parseArgs({
    args: argv,
    options: { findings: { type: 'string' }, areas: { type: 'string' }, 'dry-run': { type: 'boolean', default: false }, repo: { type: 'string', default: FORKLING_REPO } },
  })
  const log = deps.log ?? console.log
  const date = stockholmDate(deps.now ?? new Date())
  const file = values.findings ? resolve(deps.cwd ?? process.cwd(), values.findings) : join(deps.out, 'findings.json')
  const findings = Findings.parse(JSON.parse(readFileSync(file, 'utf8')))

  const areas = values.areas !== undefined ? Area.array().parse(values.areas.split(',').filter(Boolean)) : (readRunInfo(deps.out)?.areas ?? [])
  if (values.areas === undefined && readRunInfo(deps.out) === null) log('No qa-out/run.json and no --areas: nothing counts as clean this run, so nothing is closed.')

  const real = deps.tracker ?? new GhTracker(values.repo)
  const dry = values['dry-run'] ? new DryRunTracker(real) : null
  const tracker = dry ?? real
  const plan = planTriage({ findings, issues: await tracker.listIssues('qa'), coveredAreas: areas, date })
  const result = await applyPlan(plan, tracker, { root: deps.root, date })

  const summary = {
    date,
    dryRun: dry !== null,
    findings: file,
    coveredAreas: areas,
    opened: result.opened,
    commented: result.commented,
    reopened: result.reopened,
    closed: result.closed,
    updated: result.updated,
    picks: result.picks,
    ...(dry ? { wouldDo: dry.log } : {}),
  }
  mkdirSync(deps.out, { recursive: true })
  writeFileSync(join(deps.out, 'triage.json'), `${JSON.stringify(summary, null, 2)}\n`)

  log(`${dry ? 'Dry run: ' : ''}${findings.length} findings, covered areas: ${areas.join(', ') || 'none'}.`)
  log(`Open ${result.opened.length}, comment ${result.commented.length}, reopen ${result.reopened.length}, close ${result.closed.length}, quiet updates ${result.updated.length}.`)
  if (dry) for (const line of dry.log) log(`  would ${line}`)
  log(`Picked to fix (${result.picks.length}):`)
  for (const p of result.picks) log(`  ${p.issue === undefined ? '(new)' : `#${p.issue}`} ${p.severity} ${p.fixKind}: ${p.title}`)
  log(`Written: ${join(deps.out, 'triage.json')}`)
  return 0
}
