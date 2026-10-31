import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Artifact, BuildRequest, forklingPackIssues, type MicroBehavior, type SpeciesPack, type WorldObject } from '@forkling/schema'
import { heightAt, isWalkable, runHeadless, starterIsland, worldWithObjects } from '@forkling/sim'
import { checkProject } from './project.ts'
import { runContraption } from './physics.ts'
import { MAX_FRAME_BYTES } from './photos.ts'
import { readWorld } from './world.ts'

/** What the builder may write in a world repo. A pull request that touches anything else is turned down. */
export const BUILDER_PATHS = ['objects/', 'art/', 'site/', 'notebook/', 'journal/'] as const

export interface PathCheck {
  ok: boolean
  /** The changed paths outside the builder's folders. */
  offending: string[]
  /** Only `objects/<id>.json` files changed: pure data, safe to merge without a human. */
  dataOnly: boolean
}

const OBJECT_FILE = /^objects\/[a-z0-9][a-z0-9-]*\.json$/

/** Whether a change stays inside what the builder may touch, and whether it is pure object data. */
export function checkPaths(changed: readonly string[]): PathCheck {
  const inside = (p: string) => !p.startsWith('/') && !p.split('/').includes('..') && BUILDER_PATHS.some((prefix) => p.startsWith(prefix))
  const offending = changed.filter((p) => !inside(p))
  return { ok: offending.length === 0, offending, dataOnly: changed.length > 0 && offending.length === 0 && changed.every((p) => OBJECT_FILE.test(p)) }
}

export interface ValidateResult {
  problems: string[]
  /** How many ticks of the body the headless run played. */
  ticks: number
}

/** Ticks of the headless run: 1000, at 0.1 s each. */
const HEADLESS_SECONDS = 100
const STEPS_PER_SECOND = 10
/** An object this close to the waterline is in it. */
const SHORE_MARGIN = 0.3
const REACH = 1.6

const jsonFiles = (dir: string, rel: string): string[] => {
  const full = join(dir, rel)
  return existsSync(full) ? readdirSync(full).filter((f) => f.endsWith('.json')).map((f) => `${rel}/${f}`) : []
}

/**
 * Everything CI checks about a world repo: every file fits its schema (including the ones the mind would silently
 * skip), objects stand on land and can be reached, photos are small jpegs, and the body can live in the world for a
 * thousand ticks without getting stuck or leaving the ground.
 */
export function validateWorld(dir: string, species: { pack: SpeciesPack; behaviors: MicroBehavior[] }): ValidateResult {
  const problems: string[] = []
  let world
  try {
    world = readWorld(dir, () => '2000-01')
  } catch (e) {
    return { problems: [(e as Error).message], ticks: 0 }
  }
  const { forkling, objects } = world

  for (const issue of forklingPackIssues(forkling, species.pack)) problems.push(`forkling.json: ${issue}`)

  for (const rel of jsonFiles(dir, 'art')) {
    try {
      const parsed = Artifact.safeParse(JSON.parse(readFileSync(join(dir, rel), 'utf8')))
      if (!parsed.success) problems.push(`${rel}: ${parsed.error.issues.map((i) => `${i.path.map(String).join('.') || 'file'}: ${i.message}`).join('; ')}`)
      else if (`art/${parsed.data.id}.json` !== rel) problems.push(`${rel}: id "${parsed.data.id}" doesn't match the file name`)
      else if (parsed.data.kind === 'photo' && !existsSync(join(dir, 'art', parsed.data.content.image))) problems.push(`${rel}: its frame ${parsed.data.content.image} is missing`)
    } catch (e) {
      problems.push(`${rel}: isn't valid JSON: ${(e as Error).message}`)
    }
  }
  const photos = join(dir, 'art/photos')
  if (existsSync(photos)) {
    for (const f of readdirSync(photos).filter((n) => n !== '.gitkeep')) {
      const bytes = readFileSync(join(photos, f))
      const jpeg = bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8
      if (!f.endsWith('.jpg') || !jpeg || statSync(join(photos, f)).size > MAX_FRAME_BYTES) problems.push(`art/photos/${f}: not a jpeg of a sane size`)
    }
  }
  const projects = join(dir, 'site/projects')
  if (existsSync(projects)) {
    for (const id of readdirSync(projects).filter((d) => statSync(join(projects, d)).isDirectory())) {
      for (const problem of checkProject(dir, id).problems) problems.push(`site/projects/${id}: ${problem}`)
    }
  }
  for (const rel of jsonFiles(dir, 'mind/builds')) {
    try {
      const parsed = BuildRequest.safeParse(JSON.parse(readFileSync(join(dir, rel), 'utf8')))
      if (!parsed.success) problems.push(`${rel}: not a build request`)
    } catch {
      problems.push(`${rel}: isn't valid JSON`)
    }
  }

  const sim = worldWithObjects(objects)
  for (const o of objects) {
    const [x, , z] = o.position
    if (heightAt(x, z, starterIsland) < starterIsland.waterLevel + SHORE_MARGIN) {
      problems.push(`objects/${o.id}.json: ${o.id} stands in the water`)
      continue
    }
    const around: [number, number][] = [[REACH, 0], [-REACH, 0], [0, REACH], [0, -REACH], [REACH, REACH], [-REACH, -REACH], [REACH, -REACH], [-REACH, REACH]]
    if (!around.some(([dx, dz]) => isWalkable(sim.nav.grid, x + dx, z + dz))) problems.push(`objects/${o.id}.json: ${o.id} cannot be reached: there is no walkable ground beside it`)
  }

  const run = runHeadless({ pack: species.pack, behaviors: species.behaviors, seed: forkling.seed, startHour: 10, seconds: HEADLESS_SECONDS, world: sim })
  if (run.maxStuckSteps >= 30) problems.push(`the body got stuck for ${run.maxStuckSteps} steps in a row`)
  if (run.offGrid > 0) problems.push(`the body left the walkable ground ${run.offGrid} times`)
  if (run.needsOutOfRange > 0) problems.push('a need left its range of 0 to 100')
  if (run.badIntentions > 0) problems.push(`the body chose ${run.badIntentions} intentions that do not exist in the pack`)
  return { problems, ticks: HEADLESS_SECONDS * STEPS_PER_SECOND }
}

/** Runs every mechanism in the world headless: each has to move something, keep everything on the island, and come to rest. */
export async function validateContraptions(objects: readonly WorldObject[]): Promise<string[]> {
  const problems: string[] = []
  for (const o of objects) {
    if (!o.contraption) continue
    const run = await runContraption(o)
    if (!run) continue
    const flaw = run.escaped ? 'its parts were flung off the island' : !run.moved ? 'nothing moved' : !run.settled ? 'it never came to rest' : null
    if (flaw) problems.push(`objects/${o.id}.json: ${o.id} does not work: ${flaw}`)
  }
  return problems
}
