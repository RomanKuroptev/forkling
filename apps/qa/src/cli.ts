import { resolve } from 'node:path'
import { fastChecks } from './fast.ts'
import { qaOut, repoRoot } from './paths.ts'
import { blocking, writeRun } from './report/write.ts'
import { runChecks } from './run/check.ts'
import { parseArgs } from 'node:util'
import { Area } from './report/finding.ts'
import { stockholmDate } from './run/check.ts'
import { FORKLING_REPO, triageCommand } from './triage/command.ts'
import { loadConfig } from './triage/config.ts'
import { digestCommand } from './triage/digest.ts'
import { recordFix } from './triage/fix-try.ts'
import { gather } from './triage/gather.ts'
import { GhTracker } from './triage/gh-tracker.ts'
import { writeRunInfo } from './triage/run-info.ts'

const USAGE = `pnpm qa <command>

  fast    the pull request checks (free, no network, no key); writes qa-out/findings.json and qa-out/report.md
  triage  findings to GitHub issues labelled qa, by fingerprint; picks up to 5 to fix (qa-out/triage.json)
          [--findings <file>] [--areas world,behaviour,...] [--dry-run] [--repo owner/name]
          --dry-run only reads GitHub and prints what it would open, comment, close and pick
  gather  merges qa-out/findings.json, qa-out/actions/** (Actions artefacts) and qa-out/review/*.json (reviewers)
          into qa-out/findings.json and run.json   [--from <dir>]... [--areas world,behaviour,...]
  fix-try <issue> --failed "<what was tried>" | --merged <pr>   a fixer's result; 2 failures label fix-failed
  digest  writes qa-out/digest.md   [--post] adds one comment on the pinned QA digest issue   [--mode nightly|weekly|release]`

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv
  switch (command) {
    case 'fast': {
      const findings = await runChecks(fastChecks, { now: new Date() })
      const out = qaOut()
      writeRun(out, findings, { title: 'fast' })
      writeRunInfo(out, { title: 'fast', areas: fastChecks.map((c) => c.area) })
      console.log(`${fastChecks.length} checks, ${findings.length} findings; report in ${out}`)
      return blocking(findings) ? 1 : 0
    }
    case 'triage':
      return triageCommand(rest, { root: repoRoot(), out: qaOut(), cwd: process.env.INIT_CWD ?? process.cwd() })
    case 'gather': {
      const { values } = parseArgs({ args: rest, options: { from: { type: 'string', multiple: true, default: [] }, areas: { type: 'string', default: '' } } })
      const cwd = process.env.INIT_CWD ?? process.cwd()
      const { findings, files } = gather({
        out: qaOut(),
        now: new Date(),
        from: values.from.map((d) => resolve(cwd, d)),
        extraAreas: Area.array().parse(values.areas.split(',').filter(Boolean)),
      })
      console.log(`${files.length} findings files, ${findings.length} findings after merging; written to ${qaOut('findings.json')}`)
      return 0
    }
    case 'fix-try': {
      const { values, positionals } = parseArgs({ args: rest, allowPositionals: true, options: { failed: { type: 'string' }, merged: { type: 'string' } } })
      const issue = Number(positionals[0])
      if (!Number.isInteger(issue) || (values.failed === undefined) === (values.merged === undefined)) {
        console.log('pnpm qa fix-try <issue> --failed "<what was tried>" | --merged <pr>')
        return 2
      }
      const result = values.merged !== undefined ? { issue, merged: Number(values.merged) } : { issue, failed: values.failed! }
      const r = await recordFix(new GhTracker(FORKLING_REPO), result, { out: qaOut(), date: stockholmDate(new Date()) })
      console.log(`#${r.issue}: ${r.result}`)
      return 0
    }
    case 'digest':
      return digestCommand(rest, { out: qaOut(), tracker: new GhTracker(FORKLING_REPO), digestIssue: loadConfig(repoRoot()).digestIssue })
    default:
      console.log(USAGE)
      return command === undefined || command === 'help' ? 0 : 2
  }
}

process.exitCode = await main(process.argv.slice(2))
