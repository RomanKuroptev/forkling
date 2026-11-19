import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Place, Project } from '@forkling/schema'
import type { QaJson } from './fixtures.ts'

/**
 * The derived fixtures (audit spec 4): `day-7` with a few pure edits, no model. Each gives the files it changes and its
 * `qa.json`; `writeDerived` puts them in the fixture's folder.
 */
export interface Derived {
  files: Record<string, string>
  qa: QaJson
}

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

/** `night`: the same world after sunset in Stockholm (21:30 on the same day, about six hours after the sun goes down). */
export function deriveNight(day7Now: string): Derived {
  const day = day7Now.slice(0, 10)
  return { files: {}, qa: { base: 'day-7', now: `${day}T21:30:00+01:00`, about: 'day-7 after sunset: the night look of the world.' } }
}

/**
 * `building`: day-7 with one founded place being expanded (cyan wireframe until a day after the fixture's clock), one project
 * being built, and a build session asked for that has no result yet.
 */
export function deriveBuilding(day7: string, now: string): Derived {
  const files: Record<string, string> = {}
  const at = Date.parse(now)
  const places = readdirSync(join(day7, 'places'))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ file: `places/${f}`, place: Place.parse(JSON.parse(readFileSync(join(day7, 'places', f), 'utf8'))) }))
  // A place Merge founded (not Home or the Workshop) when there is one, so the starting pair stays as it is.
  const target = places.find((p) => !['home', 'workshop'].includes(p.place.id)) ?? places[0]
  if (!target) throw new Error(`no places in ${day7}`)
  files[target.file] = json({ ...target.place, state: { ...target.place.state, construction: { kind: 'expand', finishesAt: new Date(at + 86_400_000).toISOString() } } })

  const projectsDir = join(day7, 'projects')
  const projects = existsSync(projectsDir)
    ? readdirSync(projectsDir)
        .filter((d) => existsSync(join(projectsDir, d, 'project.json')))
        .sort()
        .map((d) => Project.parse(JSON.parse(readFileSync(join(projectsDir, d, 'project.json'), 'utf8'))))
    : []
  const project = projects[0]
  if (!project) throw new Error(`no projects in ${day7}`)
  files[`projects/${project.id}/project.json`] = json({ ...project, status: 'building', reason: null })
  const stamp = new Date(at - 10 * 60_000).toISOString()
  const id = `session-${stamp.replace(/[-:T]/g, '').slice(0, 14)}`
  files[`mind/builds/${id}.json`] = json({ id, kind: 'session', requestedAt: stamp, target: project.id, reason: 'Keep going on it: one more sitting to see the change on screen.', pointsInHand: 300 })
  return { files, qa: { base: 'day-7', now, about: `day-7 with ${target.place.id} being expanded, ${project.id} being built and a session asked for.` } }
}
