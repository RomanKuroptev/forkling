import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { finishProject } from './project.ts'

const USAGE = `usage: pnpm --filter @forkling/mind project --world <dir> --id <build id> [--usd <number>] [--now <ISO time>]

Checks the project the builder wrote to site/projects/<id>/ and, if it passes, keeps it as an artifact in art/.
--usd is what the builder spent, which goes into the budget ledger. Writes projectok=true|false to GITHUB_OUTPUT.`

function main(): void {
  const { values } = parseArgs({
    options: { world: { type: 'string' }, id: { type: 'string' }, usd: { type: 'string' }, now: { type: 'string' }, help: { type: 'boolean', short: 'h', default: false } },
  })
  if (values.help || !values.id) {
    console.log(USAGE)
    return
  }
  const dir = resolve(process.env.INIT_CWD ?? process.cwd(), values.world ?? '.')
  const now = values.now ? new Date(values.now) : new Date()
  if (Number.isNaN(now.getTime())) throw new Error(`--now "${values.now}" is not a time`)
  const usd = Number(values.usd ?? 0)
  const result = finishProject(dir, { now, id: values.id, usd: Number.isFinite(usd) && usd > 0 ? usd : 0 })

  for (const p of result.problems) console.log(`problem: ${p}`)
  console.log(result.ok ? `kept ${values.id}` : `${values.id} does not pass`)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `projectok=${result.ok}\n`)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, [`### Project ${values.id}`, result.ok ? 'Passed the checks.' : result.problems.map((p) => `- ${p}`).join('\n'), usd > 0 ? `Spent: $${usd.toFixed(4)}` : '', ''].join('\n'))
}

try {
  main()
} catch (e) {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
}
