import { appendFileSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { hasCredentials } from './credentials.ts'
import { anthropicClient } from './llm.ts'
import { runPhotos } from './photos.ts'
import { loadSpecies } from './species.ts'

const USAGE = `usage: pnpm --filter @forkling/mind photos --world <dir> --frames <dir> [--now <ISO time>] [--dry-run]

  --world    the world repo (default: the current directory)
  --frames   the folder the eye cam rendered <shot id>.jpg into
  --now      pretend it is this moment (default: now)
  --dry-run  say what would be sent; call nothing, write nothing`

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      world: { type: 'string' },
      frames: { type: 'string' },
      now: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })
  if (values.help || !values.frames) {
    console.log(USAGE)
    return
  }
  const base = process.env.INIT_CWD ?? process.cwd()
  const dir = resolve(base, values.world ?? '.')
  const now = values.now ? new Date(values.now) : new Date()
  if (Number.isNaN(now.getTime())) throw new Error(`--now "${values.now}" is not a time`)

  const speciesId = (JSON.parse(readFileSync(join(dir, 'forkling.json'), 'utf8')) as { species?: string }).species ?? 'cat'
  const species = loadSpecies(speciesId)
  const result = await runPhotos(dir, {
    now,
    llm: !hasCredentials(process.env) ? null : anthropicClient(),
    pack: species.pack,
    speciesPersona: species.persona,
    framesDir: resolve(base, values.frames),
    dryRun: values['dry-run'],
  })

  for (const note of result.notes) console.log(`note: ${note}`)
  console.log(result.made > 0 ? `kept ${result.made} ${result.made === 1 ? 'photo' : 'photos'}` : 'no photos kept')
  if (process.env.GITHUB_STEP_SUMMARY) {
    const spent = result.calls.reduce((sum, c) => sum + c.usd, 0)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      [`### Photos ${now.toISOString()}`, `Kept ${result.made}.`, ...result.notes.map((n) => `- ${n}`), ...(result.calls.length > 0 ? ['', `Spent on captions: $${spent.toFixed(5)}`] : []), ''].join('\n'),
    )
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
