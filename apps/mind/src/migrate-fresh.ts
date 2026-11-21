import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { MindState, POINTS_HELD_MAX } from '@forkling/schema'
import { localDate } from '@forkling/sim'
import type { MigrationPlan, Move } from './migrate.ts'

/**
 * Merge's fresh start (docs/spec/v4/merge-fresh-start.md): everything Merge remembers, made and earned in its first life moves to
 * `archive/v1/` with the same relative paths, and the mind starts again from the template. Who it is (`forkling.json`, the seed), its
 * money (`brain/budget.json`, `brain/credits.json`), the engine's running state (`mind/config.json`, `sources.json`, `health.json`,
 * `ticks/`, `tools.json`, `notes-hidden.json`), the visitors (`notes/`, `memory/visitors.json`), the workflows and the pet-era
 * `archive/` stay as they are. Nothing is deleted. It is safe to run twice: a path whose `archive/v1/` copy exists is left alone, and a
 * fresh file is written only where the path is gone. Moving `mind/state.json` resets the points: the first waking tick grants the
 * daily amount. With `startPoints` the fresh state holds that many instead, topped up for today, so the first waking tick that day
 * grants nothing more and tomorrow adds the daily amount as usual (Roman, 21 November: a build session needs 300 in hand). Run it
 * on a clone, read the plan, then commit and push the result yourself.
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

/** Where the points of a `--start-points` fresh state came from, in its one grant. */
export const FRESH_START_SOURCE = 'fresh start'

/** A fresh plan, and the points the fresh state starts with when it is written with them. */
export interface FreshPlan extends MigrationPlan {
  startPoints?: number
  /** The day the start points are for (the world's own date). */
  startDay?: string
}

export interface FreshOptions {
  apply: boolean
  /** Points in hand in the fresh `mind/state.json`, a whole number from 0 to POINTS_HELD_MAX. */
  startPoints?: number
  now?: () => Date
}

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
  if (rel === 'mind/state.json' && isStartPointsState(readFileSync(here, 'utf8'))) return true
  return existsSync(there) && statSync(there).isFile() && readFileSync(here).equals(readFileSync(there))
}

/** A state this command wrote with start points and nothing has touched since: only the allowance and its one fresh-start grant. */
function isStartPointsState(text: string): boolean {
  try {
    const raw = JSON.parse(text) as Record<string, unknown>
    const state = MindState.parse(raw)
    return Object.keys(raw).every((k) => k === 'allowance' || k === 'grants') && state.grants?.length === 1 && state.grants[0]!.source === FRESH_START_SOURCE
  } catch {
    return false
  }
}

function timezoneOf(world: string): string {
  const forkling = JSON.parse(readFileSync(join(world, 'forkling.json'), 'utf8')) as { timezone?: unknown }
  return typeof forkling.timezone === 'string' ? forkling.timezone : 'Europe/Stockholm'
}

/** The fresh `mind/state.json` that holds `points` for today (spec v4 5.2: the daily grant comes only when the day changes). */
export function startPointsState(points: number, now: Date, timezone: string): Pick<MindState, 'allowance' | 'grants'> {
  const state = { allowance: { points, day: localDate(timezone, now.getTime()) }, grants: [{ at: now.toISOString(), points, source: FRESH_START_SOURCE }] }
  MindState.parse(state)
  return state
}

export function migrateFresh(world: string, template: string, opts: FreshOptions): FreshPlan {
  if (!existsSync(join(world, 'forkling.json'))) throw new Error(`${world} is not a world: it has no forkling.json`)
  const { startPoints } = opts
  if (startPoints !== undefined && !(Number.isInteger(startPoints) && startPoints >= 0 && startPoints <= POINTS_HELD_MAX))
    throw new Error(`start points must be a whole number from 0 to ${POINTS_HELD_MAX}, not ${startPoints}`)
  const now = (opts.now ?? (() => new Date()))()

  const moves: Move[] = candidates(world)
    .filter((rel) => existsSync(join(world, rel)) && !existsSync(join(world, FRESH_ARCHIVE, rel)) && !isFresh(world, template, rel))
    .map((rel) => ({ from: rel, to: `${FRESH_ARCHIVE}/${rel}` }))
  const moved = moves.map((m) => m.from)
  const gone = (rel: string) => moved.some((m) => rel === m || rel.startsWith(`${m}/`)) || !existsSync(join(world, rel))
  const writes = START_FROM_TEMPLATE.filter((rel) => gone(rel) && existsSync(join(template, rel)))
  const plan: FreshPlan = { moves, writes, removes: [], applied: opts.apply }
  const freshState = startPoints !== undefined && writes.includes('mind/state.json') ? startPointsState(startPoints, now, timezoneOf(world)) : null
  if (freshState) {
    plan.startPoints = startPoints
    plan.startDay = freshState.allowance!.day
  }
  if (!opts.apply) return plan

  for (const { from, to } of moves) {
    mkdirSync(dirname(join(world, to)), { recursive: true })
    renameSync(join(world, from), join(world, to))
  }
  for (const rel of writes) {
    mkdirSync(dirname(join(world, rel)), { recursive: true })
    if (rel === 'mind/state.json' && freshState) writeFileSync(join(world, rel), `${JSON.stringify(freshState, null, 2)}\n`)
    else copyFileSync(join(template, rel), join(world, rel))
  }
  return plan
}

/** What the command prints about a plan. */
export function freshPlanLines(plan: FreshPlan): string[] {
  const lines = [plan.applied ? 'Done. What changed:' : 'Dry run. This is what it would do:']
  for (const m of plan.moves) lines.push(`  move   ${m.from} -> ${m.to}`)
  for (const w of plan.writes)
    lines.push(w === 'mind/state.json' && plan.startPoints !== undefined ? `  write  ${w} (${plan.startPoints} start points for ${plan.startDay})` : `  write  ${w}`)
  if (plan.moves.length + plan.writes.length === 0) lines.push(`  nothing to do: this world has had its fresh start (${FRESH_ARCHIVE}/ is there).`)
  else if (!plan.applied) lines.push('', 'Run again with --apply to do it.')
  return lines
}
