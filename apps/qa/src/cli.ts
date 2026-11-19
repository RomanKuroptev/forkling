import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { readWorldSources, scoreSources } from './behaviour/sources.ts'
import { fastChecks } from './fast.ts'
import { qaOut, repoRoot } from './paths.ts'
import { blocking, writeRun } from './report/write.ts'
import { runChecks, type Check } from './run/check.ts'
import { readSourceList } from './sources/list.ts'
import { triageCommand } from './triage/command.ts'
import { writeRunInfo } from './triage/run-info.ts'

const USAGE = `pnpm qa <command>

  fast                         the pull request checks (free, no network, no key); writes qa-out/findings.json and qa-out/report.md
  sources --world <dir>        what Merge read over 7 days, from a world copy or a clone of Merge's repo (no network)
          [--to <yyyy-mm-dd>]  the last day counted (default: the newest trail)
          [--label <name>]     the name in the findings (default: the folder's name)
  triage  findings to GitHub issues labelled qa, by fingerprint; picks up to 5 to fix (qa-out/triage.json)
          [--findings <file>] [--areas world,behaviour,...] [--dry-run] [--repo owner/name]
          --dry-run only reads GitHub and prints what it would open, comment, close and pick`

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
    case 'triage':
      return triageCommand(rest, { root: repoRoot(), out: qaOut(), cwd: process.env.INIT_CWD ?? process.cwd() })
    default:
      console.log(USAGE)
      return command === undefined || command === 'help' ? 0 : 2
  }
}

process.exitCode = await main(process.argv.slice(2))
