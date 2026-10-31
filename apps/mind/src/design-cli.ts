import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { hasCredentials } from './credentials.ts'
import { runDesign } from './design.ts'
import { anthropicClient } from './llm.ts'
import { loadSpecies } from './species.ts'

const USAGE = `usage: pnpm --filter @forkling/mind design --world <dir> --id <build id> [--pr <file>] [--now <ISO time>] [--dry-run]

  --world    the world repo
  --id       the request in mind/builds/<id>.json to design
  --pr       where to write the pull request's words as JSON ({ "title", "body" }); written only when there is an object to propose
  --dry-run  say what would be sent; call nothing, write nothing`

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      world: { type: 'string' },
      id: { type: 'string' },
      pr: { type: 'string' },
      now: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })
  if (values.help || !values.id) {
    console.log(USAGE)
    return
  }
  const base = process.env.INIT_CWD ?? process.cwd()
  const dir = resolve(base, values.world ?? '.')
  const now = values.now ? new Date(values.now) : new Date()
  if (Number.isNaN(now.getTime())) throw new Error(`--now "${values.now}" is not a time`)

  const speciesId = (JSON.parse(readFileSync(join(dir, 'forkling.json'), 'utf8')) as { species?: string }).species ?? 'cat'
  const species = loadSpecies(speciesId)
  const result = await runDesign(dir, {
    now,
    llm: !hasCredentials(process.env) ? null : anthropicClient(),
    pack: species.pack,
    speciesPersona: species.persona,
    id: values.id,
    dryRun: values['dry-run'],
  })

  for (const note of result.notes) console.log(`note: ${note}`)
  console.log(result.ok ? `designed ${values.id}` : `nothing designed for ${values.id}`)
  if (result.ok && result.pr && values.pr) writeFileSync(resolve(base, values.pr), JSON.stringify(result.pr))
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `designed=${result.ok}\n`)
  if (process.env.GITHUB_STEP_SUMMARY) {
    const spent = result.calls.reduce((sum, c) => sum + c.usd, 0)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      [`### Design ${values.id}`, result.ok ? 'Designed.' : 'Nothing designed.', ...result.notes.map((n) => `- ${n}`), ...(result.calls.length > 0 ? ['', `Spent: $${spent.toFixed(5)}`] : []), ''].join('\n'),
    )
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
