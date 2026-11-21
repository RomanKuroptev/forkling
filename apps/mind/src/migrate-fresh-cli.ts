import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { POINTS_HELD_MAX } from '@forkling/schema'
import { FRESH_ARCHIVE, freshPlanLines, migrateFresh } from './migrate-fresh.ts'

const USAGE = `usage: pnpm --filter @forkling/mind migrate-fresh --world <dir> [--template <dir>] [--start-points <n>] [--apply]

  --world     the world repo to give a fresh start
  --template  the forkling-world template to take the fresh files from (default: this engine's)
  --start-points  points in hand in the fresh mind/state.json (0 to ${POINTS_HELD_MAX}), topped up for today, so the first
              waking tick today grants nothing more and tomorrow adds the daily amount (a build session needs 300 in hand)
  --apply     do it; without it the plan is only printed

Merge's memory, goals, wants, points, diary, notebook, souvenirs, trails, works, places, page, projects and requests move
to ${FRESH_ARCHIVE}/ with the same paths, and the mind starts again from the template. forkling.json, the seed, the budget
and credits, mind/config, sources, health, ticks and tools, the notes, memory/visitors.json, the workflows and the pet-era
archive/ stay. Nothing is deleted. Run it on a clone, read the plan, then commit and push the result yourself.`

const { values } = parseArgs({
  options: {
    world: { type: 'string' },
    template: { type: 'string' },
    'start-points': { type: 'string' },
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
const raw = values['start-points']
const startPoints = raw === undefined ? undefined : /^\d+$/.test(raw) ? Number(raw) : Number.NaN
const plan = migrateFresh(world, template, { apply: values.apply, startPoints })
for (const line of freshPlanLines(plan)) console.log(line)
