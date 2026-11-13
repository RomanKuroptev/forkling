import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { MigrationPlan } from './migrate.ts'

/**
 * Home and the Workshop become place files (W5). A world made before places has none, so this adds them from the template.
 * It writes only what is missing, so it is safe to run twice and never overwrites a place Merge has changed. Run it on a clone,
 * read the plan, then commit and push the result yourself (it is a change to the world repo, and the release is Roman's).
 */
export const W5_STARTING_FILES = ['places/home.json', 'places/workshop.json']

export function migrateToW5(world: string, template: string, opts: { apply: boolean }): MigrationPlan {
  if (!existsSync(join(world, 'forkling.json'))) throw new Error(`${world} is not a world: it has no forkling.json`)
  const writes = W5_STARTING_FILES.filter((rel) => !existsSync(join(world, rel)) && existsSync(join(template, rel)))
  const plan: MigrationPlan = { moves: [], writes, removes: [], applied: opts.apply }
  if (!opts.apply) return plan
  for (const rel of writes) {
    mkdirSync(dirname(join(world, rel)), { recursive: true })
    copyFileSync(join(template, rel), join(world, rel))
  }
  return plan
}
