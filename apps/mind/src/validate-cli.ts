import { appendFileSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { loadSpecies } from './species.ts'
import { checkPaths, validateContraptions, validateWorld } from './validate.ts'
import { readWorld } from './world.ts'

const USAGE = `usage: pnpm --filter @forkling/mind validate --world <dir> [--changed <file>]

  --world    the world repo to check (a checkout of the pull request)
  --changed  a file listing the paths the pull request changes, one per line; they must stay inside what the builder may touch

Exits 1 when anything is wrong. Writes dataonly=true|false to GITHUB_OUTPUT.`

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { world: { type: 'string' }, changed: { type: 'string' }, help: { type: 'boolean', short: 'h', default: false } } })
  if (values.help) {
    console.log(USAGE)
    return
  }
  const base = process.env.INIT_CWD ?? process.cwd()
  const dir = resolve(base, values.world ?? '.')
  const problems: string[] = []
  let dataOnly = false

  if (values.changed) {
    const changed = readFileSync(resolve(base, values.changed), 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
    const paths = checkPaths(changed)
    dataOnly = paths.dataOnly
    for (const p of paths.offending) problems.push(`${p}: the builder may only change ${['objects/', 'art/', 'site/', 'notebook/', 'journal/'].join(', ')}`)
  }

  const speciesId = (() => {
    try {
      return (JSON.parse(readFileSync(join(dir, 'forkling.json'), 'utf8')) as { species?: string }).species ?? 'cat'
    } catch {
      return 'cat'
    }
  })()
  const species = loadSpecies(speciesId)
  const result = validateWorld(dir, species)
  problems.push(...result.problems)
  if (result.problems.length === 0) problems.push(...(await validateContraptions(readWorld(dir, () => '2000-01').objects)))

  for (const p of problems) console.log(`problem: ${p}`)
  console.log(problems.length === 0 ? `ok: the world fits its schemas and ran for ${result.ticks} ticks${dataOnly ? ' (data only)' : ''}` : `${problems.length} problem${problems.length === 1 ? '' : 's'}`)
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `dataonly=${dataOnly}\n`)
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, ['### Validate', problems.length === 0 ? 'No problems.' : problems.map((p) => `- ${p}`).join('\n'), dataOnly ? 'Data only: safe to merge without review.' : '', ''].join('\n'))
  }
  if (problems.length > 0) process.exit(1)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
