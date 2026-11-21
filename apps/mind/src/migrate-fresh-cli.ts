import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { FRESH_ARCHIVE, migrateFresh } from './migrate-fresh.ts'

const USAGE = `usage: pnpm --filter @forkling/mind migrate-fresh --world <dir> [--template <dir>] [--apply]

  --world     the world repo to give a fresh start
  --template  the forkling-world template to take the fresh files from (default: this engine's)
  --apply     do it; without it the plan is only printed

Merge's memory, goals, wants, points, diary, notebook, souvenirs, trails, works, places, page, projects and requests move
to ${FRESH_ARCHIVE}/ with the same paths, and the mind starts again from the template. forkling.json, the seed, the budget
and credits, mind/config, sources, health, ticks and tools, the notes, memory/visitors.json, the workflows and the pet-era
archive/ stay. Nothing is deleted. Run it on a clone, read the plan, then commit and push the result yourself.`

const { values } = parseArgs({
  options: {
    world: { type: 'string' },
    template: { type: 'string' },
    apply: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
})
if (values.help || !values.world) {
  console.log(USAGE)
  process.exit(values.help ? 0 : 1)
}

// `pnpm --filter` runs from apps/mind; relative paths mean relative to where the user typed the command.
const here = process.env.INIT_CWD ?? process.cwd()
const world = resolve(here, values.world)
const template = values.template ? resolve(here, values.template) : join(fileURLToPath(new URL('../../../templates/forkling-world', import.meta.url)))
const plan = migrateFresh(world, template, { apply: values.apply })

console.log(plan.applied ? 'Done. What changed:' : 'Dry run. This is what it would do:')
for (const m of plan.moves) console.log(`  move   ${m.from} -> ${m.to}`)
for (const w of plan.writes) console.log(`  write  ${w}`)
if (plan.moves.length + plan.writes.length === 0) console.log(`  nothing to do: this world has had its fresh start (${FRESH_ARCHIVE}/ is there).`)
else if (!plan.applied) console.log('\nRun again with --apply to do it.')
