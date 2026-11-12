import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { Forkling } from '@forkling/schema'

/**
 * Moves a pet-era world repo to the W1 layout (spec 16, W1, and decision 3: a fresh mind, the old journal and art kept as
 * history). Everything that was Merge's as a pet goes under `archive/`, read-only history that the site shows; what is
 * left is who it is (`forkling.json`), what it has spent, and its tick log. Nothing is deleted except the builder and
 * validate workflows: git history keeps the rest. It is safe to run twice: a path whose archive copy exists is left alone.
 */
export interface Move {
  from: string
  to: string
}

export interface MigrationPlan {
  moves: Move[]
  /** Files written fresh, from the template or reset. */
  writes: string[]
  /** Files removed. */
  removes: string[]
  applied: boolean
}

const ARCHIVE = 'archive'

/** What the pet was, moved under `archive/` with the same relative path. */
const ARCHIVED = [
  'objects',
  'art',
  'notebook',
  'journal',
  'memory/stream',
  'memory/timeline',
  'memory/beliefs.json',
  'memory/summary.md',
  'memory/people.json',
  'brain/persona.md',
  'brain/temperament.json',
  'brain/skills.json',
  'brain/interests.json',
  'mind/goals.json',
  'mind/state.json',
  'mind/builds',
]

/** Files the fresh mind starts from, copied from the template only when the world has none. */
const START_FROM_TEMPLATE = [
  'self/seed.md',
  'brain/interests.json',
  'memory/beliefs.json',
  'memory/summary.md',
  'mind/goals.json',
  'mind/state.json',
  'journal/.gitkeep',
  'notebook/.gitkeep',
  'memory/stream/.gitkeep',
]

/** Files the engine owns, copied over whatever the world has. */
const ENGINE_OWNED = ['CLAUDE.md', '.github/workflows/mind.yml', '.github/workflows/pages.yml', '.github/workflows/heartbeat.yml', '.github/workflows/validate.yml']

const REMOVED_WORKFLOWS = ['.github/workflows/build.yml']

function isPetEra(raw: Record<string, unknown>): boolean {
  return 'needs' in raw || 'feelings' in raw || typeof raw.mood === 'string'
}

export function migrateToW1(world: string, template: string, opts: { apply: boolean }): MigrationPlan {
  const forklingPath = join(world, 'forkling.json')
  if (!existsSync(forklingPath)) throw new Error(`${world} is not a world: it has no forkling.json`)
  const raw = JSON.parse(readFileSync(forklingPath, 'utf8')) as Record<string, unknown>

  const moves: Move[] = ARCHIVED.filter((rel) => existsSync(join(world, rel)) && !existsSync(join(world, ARCHIVE, rel))).map((rel) => ({ from: rel, to: `${ARCHIVE}/${rel}` }))
  const moved = new Set(moves.map((m) => m.from))
  const gone = (rel: string) => moved.has(rel) || [...moved].some((m) => rel.startsWith(`${m}/`)) || !existsSync(join(world, rel))

  const writes = [
    ...(isPetEra(raw) ? ['forkling.json'] : []),
    ...START_FROM_TEMPLATE.filter((rel) => gone(rel) && existsSync(join(template, rel))),
    ...ENGINE_OWNED.filter((rel) => existsSync(join(template, rel))),
  ]
  const removes = REMOVED_WORKFLOWS.filter((rel) => existsSync(join(world, rel)))
  const plan: MigrationPlan = { moves, writes, removes, applied: opts.apply }
  if (!opts.apply) return plan

  for (const { from, to } of moves) {
    mkdirSync(dirname(join(world, to)), { recursive: true })
    renameSync(join(world, from), join(world, to))
  }
  if (isPetEra(raw)) {
    // Who it is stays: its name, species, seed, time zone and place. How it feels starts again, steady and rested.
    const parsed = Forkling.parse(raw)
    const { mood: _m, energy: _e, ...kept } = parsed
    const fresh = { ...kept, mood: 0, energy: 0.5, intention: { type: 'sit', startedAt: parsed.lastTickAt, seed: parsed.seed, reason: 'I have just been given a new way of living. I sit and look at it.' } }
    writeFileSync(forklingPath, `${JSON.stringify(fresh, null, 2)}\n`)
  }
  for (const rel of START_FROM_TEMPLATE) {
    if (!gone(rel) || !existsSync(join(template, rel))) continue
    mkdirSync(dirname(join(world, rel)), { recursive: true })
    copyFileSync(join(template, rel), join(world, rel))
  }
  for (const rel of ENGINE_OWNED) {
    if (!existsSync(join(template, rel))) continue
    mkdirSync(dirname(join(world, rel)), { recursive: true })
    copyFileSync(join(template, rel), join(world, rel))
  }
  for (const rel of removes) rmSync(join(world, rel))
  return plan
}
