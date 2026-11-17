import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { buildRunReport, formatRunReport } from './run-report.ts'

const USAGE = `usage: pnpm --filter @forkling/mind run-report --world <clone of a world repo> --from <YYYY-MM-DD> --to <YYYY-MM-DD> [--json]

Step 8's run report: everything in the launch checklist that can be counted from the repo, in plain words and numbers.
It reads the files, the tick logs and the git history, and writes nothing. Merge never sees it.`

function main(): void {
  const { values } = parseArgs({ options: { world: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, json: { type: 'boolean', default: false }, help: { type: 'boolean', short: 'h', default: false } } })
  if (values.help) return void console.log(USAGE)
  if (!values.world || !values.from || !values.to) throw new Error(`--world, --from and --to are required\n\n${USAGE}`)
  const dir = resolve(process.env.INIT_CWD ?? process.cwd(), values.world)
  const report = buildRunReport(dir, { from: values.from, to: values.to })
  console.log(values.json ? JSON.stringify(report, null, 2) : formatRunReport(report))
}

try {
  main()
} catch (e) {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
}
