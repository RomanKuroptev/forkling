import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { migrateToW1 } from './migrate.ts'

const USAGE = `usage: pnpm --filter @forkling/mind migrate-w1 --world <dir> [--template <dir>] [--apply]

  --world     the world repo to move to the W1 layout
  --template  the forkling-world template to take the seed, CLAUDE.md and workflows from (default: this engine's)
  --apply     do it; without it the plan is only printed

The pet-era journal, objects, art, notes and memory move under archive/, the mind starts fresh, and the builder and
validate workflows go. Run it on a clone, read the plan, then commit and push the result yourself.`

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
const plan = migrateToW1(world, template, { apply: values.apply })

console.log(plan.applied ? 'Done. What changed:' : 'Dry run. This is what it would do:')
for (const m of plan.moves) console.log(`  move   ${m.from} -> ${m.to}`)
for (const w of plan.writes) console.log(`  write  ${w}`)
for (const r of plan.removes) console.log(`  remove ${r}`)
if (plan.moves.length + plan.writes.length + plan.removes.length === 0) console.log('  nothing: this world is already on the W1 layout.')
if (!plan.applied) console.log('\nRun again with --apply to do it.')
