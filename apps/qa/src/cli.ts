import { fastChecks } from './fast.ts'
import { qaOut, repoRoot } from './paths.ts'
import { blocking, writeRun } from './report/write.ts'
import { runChecks } from './run/check.ts'
import { triageCommand } from './triage/command.ts'
import { writeRunInfo } from './triage/run-info.ts'

const USAGE = `pnpm qa <command>

  fast    the pull request checks (free, no network, no key); writes qa-out/findings.json and qa-out/report.md
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
    case 'triage':
      return triageCommand(rest, { root: repoRoot(), out: qaOut(), cwd: process.env.INIT_CWD ?? process.cwd() })
    default:
      console.log(USAGE)
      return command === undefined || command === 'help' ? 0 : 2
  }
}

process.exitCode = await main(process.argv.slice(2))
