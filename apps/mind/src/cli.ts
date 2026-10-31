import { appendFileSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { hasCredentials } from './credentials.ts'
import { anthropicClient } from './llm.ts'
import { loadSpecies } from './species.ts'
import { runTick } from './tick.ts'

const USAGE = `usage: pnpm mind:local [--world <dir>] [--now <ISO time>] [--dry-run] [--no-llm]

  --world    the world repo to tick (default: the current directory)
  --now      pretend it is this moment (default: now)
  --dry-run  print the prompt and a token and cost estimate; call nothing, write nothing
  --no-llm   run the tick without ever calling the model`

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      world: { type: 'string' },
      now: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      'no-llm': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })
  if (values.help) {
    console.log(USAGE)
    return
  }

  // `pnpm --filter` runs from apps/mind; relative paths mean relative to where the user typed the command.
  const dir = resolve(process.env.INIT_CWD ?? process.cwd(), values.world ?? '.')
  const now = values.now ? new Date(values.now) : new Date()
  if (Number.isNaN(now.getTime())) throw new Error(`--now "${values.now}" is not a time`)

  const speciesId = (JSON.parse(readFileSync(join(dir, 'forkling.json'), 'utf8')) as { species?: string }).species ?? 'cat'
  const species = loadSpecies(speciesId)

  const result = await runTick(dir, {
    now,
    llm: values['no-llm'] || !hasCredentials(process.env) ? null : anthropicClient(),
    pack: species.pack,
    behaviors: species.behaviors,
    speciesPersona: species.persona,
    pools: species.pools,
    dryRun: values['dry-run'],
  })

  if (values['dry-run'] && result.prompt) {
    console.log(`--- system (${result.prompt.model}, cached) ---\n${result.prompt.system}\n\n--- user ---\n${result.prompt.user}\n`)
    console.log(`about ${result.prompt.tokens} tokens in, at most $${result.prompt.maxUsd.toFixed(4)} for a ${result.prompt.kind} call`)
  }
  for (const note of result.notes) console.log(`note: ${note}`)
  console.log(result.changed ? `changed: ${result.summary}` : 'nothing changed')

  const spent = result.calls.reduce((sum, c) => sum + c.usd, 0)
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `changed=${result.changed}\nsummary=${result.summary.replace(/[\r\n]+/g, ' ')}\n`)
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = result.calls.map((c) => `| ${c.kind} | ${c.model} | ${c.input} | ${c.cacheRead} | ${c.cacheWrite} | ${c.output} | $${c.usd.toFixed(5)} |`)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      [
        `### Mind tick ${now.toISOString()}`,
        result.changed ? `Changed: ${result.summary}` : 'Nothing changed.',
        ...result.notes.map((n) => `- ${n}`),
        ...(rows.length > 0
          ? ['', '| call | model | input | cache read | cache write | output | cost |', '|---|---|---:|---:|---:|---:|---:|', ...rows, '', `Spent this tick: $${spent.toFixed(5)}`]
          : []),
        '',
      ].join('\n'),
    )
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
