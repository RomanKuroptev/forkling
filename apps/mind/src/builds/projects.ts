import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { canStartProject, Project, projectIdFor, type ProjectSession } from '@forkling/schema'
import { cutAtWord } from '@forkling/sim'
import { writeJson } from '../world.ts'

/**
 * Projects on disk (spec-v4 3.1): `projects/<id>/project.json`, `src/` and `shots/` in the world repo. Every write is checked
 * against the schema; the files inside `src/` go through `project-files.ts`. Nothing here chooses, suggests or lists a project:
 * it only keeps what Merge started.
 */

export const PROJECTS_DIR = 'projects'
const jsonPath = (id: string) => `${PROJECTS_DIR}/${id}/project.json`
export const projectDir = (world: string, id: string) => join(world, PROJECTS_DIR, id)

/** Every project that reads, oldest first, and the folders whose `project.json` is missing or does not fit. */
export function readProjects(world: string): { projects: Project[]; unreadable: string[] } {
  const root = join(world, PROJECTS_DIR)
  if (!existsSync(root)) return { projects: [], unreadable: [] }
  const projects: Project[] = []
  const unreadable: string[] = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const p = readProject(world, entry.name)
    if (p && p.id === entry.name) projects.push(p)
    else unreadable.push(entry.name)
  }
  projects.sort((a, b) => Date.parse(a.started) - Date.parse(b.started) || (a.id < b.id ? -1 : 1))
  return { projects, unreadable: unreadable.sort() }
}

export function readProject(world: string, id: string): Project | null {
  const file = join(world, jsonPath(id))
  if (!existsSync(file)) return null
  try {
    const parsed = Project.safeParse(JSON.parse(readFileSync(file, 'utf8')))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** Writes `project.json` (and makes `src/` and `shots/`). Throws on a project that does not fit the schema: code bug, not Merge's. */
export function writeProject(world: string, project: Project): void {
  const checked = Project.parse(project)
  writeJson(world, jsonPath(checked.id), checked)
  for (const sub of ['src', 'shots']) mkdirSync(join(projectDir(world, checked.id), sub), { recursive: true })
}

/** A project by its id, or by its name in any case. */
export function findProject(projects: readonly Project[], target: string): Project | null {
  const t = target.trim().toLowerCase()
  return projects.find((p) => p.id === t) ?? projects.find((p) => p.name.toLowerCase() === t) ?? null
}

/**
 * Starts a project (spec-v4 3.2): `name` is the step's target, `aim` its reason until a session sets one. Refused when 3 are
 * building (a storage rail) or the name is not 3 to 40 characters. The id is a slug of the name, never one already used.
 */
export function createProject(world: string, o: { name: string; aim: string; now: Date; inspiredBy?: Project['inspiredBy'] }): { ok: true; project: Project } | { ok: false; reason: string } {
  const name = o.name.trim().replace(/\s+/g, ' ')
  if (name.length < 3 || name.length > 40) return { ok: false, reason: `a project's name is 3 to 40 characters, and "${name.slice(0, 50)}" is ${name.length}` }
  const { projects, unreadable } = readProjects(world)
  const room = canStartProject(projects)
  if (!room.ok) return room
  const aim = cutAtWord(o.aim.trim().replace(/\s+/g, ' '), 140) || name
  const project = Project.parse({
    id: projectIdFor(name, [...projects.map((p) => p.id), ...unreadable]),
    name,
    aim,
    started: o.now.toISOString(),
    status: 'building',
    reason: null,
    sessions: [],
    inspiredBy: o.inspiredBy ?? null,
    installedIn: null,
  })
  writeProject(world, project)
  return { ok: true, project }
}

/** Finishes or drops a project, with Merge's reason (cut at a word to 140). Throws on an empty reason. */
export function endProject(project: Project, status: 'done' | 'abandoned', reason: string): Project {
  const text = cutAtWord(reason.trim().replace(/\s+/g, ' '), 140)
  if (!text) throw new Error(`a project that is ${status} needs a reason`)
  return Project.parse({ ...project, status, reason: text })
}

export function addSession(project: Project, session: ProjectSession): Project {
  return Project.parse({ ...project, sessions: [...project.sessions, session] })
}
