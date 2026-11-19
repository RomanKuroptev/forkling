import { fastChecks } from './fast.ts'
import { qaOut } from './paths.ts'
import { blocking, writeRun } from './report/write.ts'
import { runChecks } from './run/check.ts'

const USAGE = `pnpm qa <command>

  fast    the pull request checks (free, no network, no key); writes qa-out/findings.json and qa-out/report.md`

async function main(argv: string[]): Promise<number> {
  const [command] = argv
  switch (command) {
    case 'fast': {
      const findings = await runChecks(fastChecks, { now: new Date() })
      const out = qaOut()
      writeRun(out, findings, { title: 'fast' })
      console.log(`${fastChecks.length} checks, ${findings.length} findings; report in ${out}`)
      return blocking(findings) ? 1 : 0
    }
    default:
      console.log(USAGE)
      return command === undefined || command === 'help' ? 0 : 2
  }
}

process.exitCode = await main(process.argv.slice(2))
