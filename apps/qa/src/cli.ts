import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { readWorldSources, scoreSources } from './behaviour/sources.ts'
import { fastChecks } from './fast.ts'
import { qaOut, repoRoot } from './paths.ts'
import { Area } from './report/finding.ts'
import { blocking, writeRun } from './report/write.ts'
import { runChecks, stockholmDate, type Check } from './run/check.ts'
import { readSourceList } from './sources/list.ts'
import { FORKLING_REPO, triageCommand } from './triage/command.ts'
import { loadConfig } from './triage/config.ts'
import { digestCommand } from './triage/digest.ts'
import { recordFix } from './triage/fix-try.ts'
import { gather } from './triage/gather.ts'
import { GhTracker } from './triage/gh-tracker.ts'
import { writeRunInfo } from './triage/run-info.ts'
import { liveCommand, LIVE_USAGE } from './live/command.ts'
import { SCORE_USAGE, scoreCommand } from './behaviour/score-cli.ts'
import { fixturesCommand, FIXTURES_USAGE, liveClone } from './fixtures/command.ts'

const USAGE = `pnpm qa <command>

  fast                         the pull request checks (free, no network, no key); writes qa-out/findings.json and qa-out/report.md
  sources --world <dir>        what Merge read over 7 days, from a world copy or a clone of Merge's repo (no network)
          [--to <yyyy-mm-dd>]  the last day counted (default: the newest trail)
          [--label <name>]     the name in the findings (default: the folder's name)
  triage  findings to GitHub issues labelled qa, by fingerprint; picks up to 5 to fix (qa-out/triage.json)
          [--findings <file>] [--areas world,behaviour,...] [--dry-run] [--repo owner/name]
          --dry-run only reads GitHub and prints what it would open, comment, close and pick
  gather  merges qa-out/findings.json, qa-out/actions/** (Actions artefacts) and qa-out/review/*.json (reviewers)
          into qa-out/findings.json and run.json   [--from <dir>]... [--areas world,behaviour,...]
  fix-try <issue> --failed "<what was tried>" | --merged <pr>   a fixer's result; 2 failures label fix-failed
  digest  writes qa-out/digest.md   [--post] adds one comment on the pinned QA digest issue   [--mode nightly|weekly|release]
${LIVE_USAGE}
  score   ${SCORE_USAGE}
${FIXTURES_USAGE}`

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
    case 'sources': {
      const { values } = parseArgs({ args: rest, options: { world: { type: 'string' }, to: { type: 'string' }, label: { type: 'string' } } })
      if (!values.world) {
        console.log(USAGE)
        return 2
      }
      // pnpm runs the script inside apps/qa; a relative path is meant from where the command was typed.
      const world = resolve(process.env.INIT_CWD ?? process.cwd(), values.world)
      const label = values.label ?? basename(world)
      const out = qaOut()
      const check: Check = {
        id: 'sources.what-merge-read',
        area: 'behaviour',
        title: `What Merge read (${label})`,
        run: async () => {
          const { summary, findings } = scoreSources(readWorldSources(world), readSourceList(), { label, ...(values.to ? { to: values.to } : {}) })
          mkdirSync(join(out, 'sources'), { recursive: true })
          writeFileSync(join(out, 'sources', `behaviour-${label}.json`), `${JSON.stringify(summary, null, 2)}\n`)
          return findings
        },
      }
      const findings = await runChecks([check], { now: new Date() })
      writeRun(out, findings, { title: `sources (${label})` })
      writeRunInfo(out, { title: `sources (${label})`, areas: [check.area] })
      console.log(`${findings.length} findings; report in ${out}`)
      return 0
    }
    case 'live':
      return liveCommand(rest, { out: qaOut(), cwd: process.env.INIT_CWD ?? process.cwd() })
    case 'score':
      return scoreCommand(rest)
    case 'fixtures':
      return fixturesCommand(rest, { cwd: process.env.INIT_CWD ?? process.cwd() })
    case 'live-clone':
      console.log(`live clone in ${liveClone(qaOut())}`)
      return 0
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
