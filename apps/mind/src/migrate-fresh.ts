import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { MigrationPlan, Move } from './migrate.ts'

/**
 * Merge's fresh start (docs/spec/v4/merge-fresh-start.md): everything Merge remembers, made and earned in its first life moves to
 * `archive/v1/` with the same relative paths, and the mind starts again from the template. Who it is (`forkling.json`, the seed), its
 * money (`brain/budget.json`, `brain/credits.json`), the engine's running state (`mind/config.json`, `sources.json`, `health.json`,
 * `ticks/`, `tools.json`, `notes-hidden.json`), the visitors (`notes/`, `memory/visitors.json`), the workflows and the pet-era
 * `archive/` stay as they are. Nothing is deleted. It is safe to run twice: a path whose `archive/v1/` copy exists is left alone, and a
 * fresh file is written only where the path is gone. Moving `mind/state.json` resets the points: the first waking tick grants the
 * starting amount. Run it on a clone, read the plan, then commit and push the result yourself.
 */
export const FRESH_ARCHIVE = 'archive/v1'

/** What Merge v1 remembered, made and earned, outside `memory/` (whose every entry but the visitors moves too). */
const MOVED = [
  'brain/interests.json',
  'brain/persona.md',
  'mind/goals.json',
  'mind/wants.json',
  'mind/state.json',
  'mind/builds',
  'journal',
  'notebook',
  'souvenirs',
  'trails',
  'works',
  'places',
  'art',
  'self/page.md',
  'self/page-history',
  'self/about.md',
  'self/history',
  'self/requests',
  'projects',
  'requests',
  'wishes',
]

/** In `memory/`, only the visitors stay, so people who wrote are still known by name. */
const MEMORY_KEPT = new Set(['visitors.json'])

/** The fresh mind's files, copied from the template only where the path is now gone. */
const START_FROM_TEMPLATE = [
  'places/home.json',
  'places/workshop.json',
  'memory/beliefs.json',
  'memory/people.json',
  'memory/summary.md',
  'memory/stream/.gitkeep',
  'mind/goals.json',
  'mind/state.json',
  'brain/interests.json',
  'journal/.gitkeep',
  'notebook/.gitkeep',
  'souvenirs/.gitkeep',
  'trails/.gitkeep',
  'projects/.gitkeep',
  'requests/.gitkeep',
  'works/.gitkeep',
  'wishes/.gitkeep',
]

function candidates(world: string): string[] {
  const memory = join(world, 'memory')
  const inMemory = existsSync(memory)
    ? readdirSync(memory)
        .filter((name) => !MEMORY_KEPT.has(name))
        .sort()
        .map((name) => `memory/${name}`)
    : []
  return [...inMemory, ...MOVED]
}

/**
 * A path that holds only what the template starts a world with (a fresh file, or a folder of `.gitkeep`s) is not Merge's: it was written by
 * an earlier run, or never used. Leaving it keeps a second run a no-op even for a path the first run had nothing of to archive.
 */
function isFresh(world: string, template: string, rel: string): boolean {
  const here = join(world, rel)
  const there = join(template, rel)
  if (statSync(here).isDirectory()) return readdirSync(here).every((name) => isFresh(world, template, `${rel}/${name}`))
  return existsSync(there) && statSync(there).isFile() && readFileSync(here).equals(readFileSync(there))
}

export function migrateFresh(world: string, template: string, opts: { apply: boolean }): MigrationPlan {
  if (!existsSync(join(world, 'forkling.json'))) throw new Error(`${world} is not a world: it has no forkling.json`)

  const moves: Move[] = candidates(world)
    .filter((rel) => existsSync(join(world, rel)) && !existsSync(join(world, FRESH_ARCHIVE, rel)) && !isFresh(world, template, rel))
    .map((rel) => ({ from: rel, to: `${FRESH_ARCHIVE}/${rel}` }))
  const moved = moves.map((m) => m.from)
  const gone = (rel: string) => moved.some((m) => rel === m || rel.startsWith(`${m}/`)) || !existsSync(join(world, rel))
  const writes = START_FROM_TEMPLATE.filter((rel) => gone(rel) && existsSync(join(template, rel)))
  const plan: MigrationPlan = { moves, writes, removes: [], applied: opts.apply }
  if (!opts.apply) return plan

  for (const { from, to } of moves) {
    mkdirSync(dirname(join(world, to)), { recursive: true })
    renameSync(join(world, from), join(world, to))
  }
  for (const rel of writes) {
    mkdirSync(dirname(join(world, rel)), { recursive: true })
    copyFileSync(join(template, rel), join(world, rel))
  }
  return plan
}
