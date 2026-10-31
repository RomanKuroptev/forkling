import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { Beliefs, BudgetLedger, Forkling, Goals, MindState, objectIdFromPath, Skills, TemperamentRoll, VisitorEvent, WorldObject } from '@forkling/schema'

/** Most inbox events one tick will look at. Newer ones win; the rest are dropped with the rest of the inbox. */
export const MAX_INBOX_EVENTS = 20

export interface InboxItem {
  /** Path relative to the world root, e.g. `events/inbox/1730000000-v_ab12.json`. */
  path: string
  /** The validated event, or null when the file isn't a valid one. */
  event: VisitorEvent | null
  problem?: string
}

/** Everything a tick reads from a world repo, validated. */
export interface WorldFiles {
  dir: string
  forkling: Forkling
  objects: WorldObject[]
  goals: Goals
  mindState: MindState
  budget: BudgetLedger
  skills: Skills
  /** `brain/temperament.json`, or null until it has been rolled. */
  temperament: TemperamentRoll | null
  /** The forkling's own `brain/persona.md`, or empty. */
  persona: string
  /** `memory/beliefs.json`: everything it has believed, dropped ones included. */
  beliefs: Beliefs
  /** `memory/summary.md`: its long-term memory, or empty. */
  summary: string
  inbox: InboxItem[]
}

class WorldFileError extends Error {
  constructor(file: string, lines: string[]) {
    super(`${file}:\n${lines.map((l) => `  ${l}`).join('\n')}`)
  }
}

const lines = (error: z.ZodError) => error.issues.map((i) => `${i.path.map(String).join('.') || 'file'}: ${i.message}`)

function readJson<T>(dir: string, rel: string, schema: z.ZodType<T>, fallback?: unknown): T {
  const full = join(dir, rel)
  let raw: unknown
  if (existsSync(full)) {
    try {
      raw = JSON.parse(readFileSync(full, 'utf8'))
    } catch (e) {
      throw new WorldFileError(rel, [`isn't valid JSON: ${(e as Error).message}`])
    }
  } else if (fallback !== undefined) {
    raw = fallback
  } else {
    throw new WorldFileError(rel, ['is missing'])
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) throw new WorldFileError(rel, lines(parsed.error))
  return parsed.data
}

function listJson(dir: string, rel: string): string[] {
  const full = join(dir, rel)
  if (!existsSync(full)) return []
  return readdirSync(full)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => `${rel}/${f}`)
}

/** Reads and validates a world repo. A file that doesn't fit is an error naming the file and every problem in it. */
export function readWorld(dir: string, monthFor: (forkling: Forkling) => string): WorldFiles {
  const forkling = readJson(dir, 'forkling.json', Forkling)
  const objects = listJson(dir, 'objects').map((rel) => {
    const object = readJson(dir, rel, WorldObject)
    if (objectIdFromPath(rel) !== object.id) throw new WorldFileError(rel, [`id "${object.id}" doesn't match the file name`])
    return object
  })
  const personaPath = join(dir, 'brain/persona.md')
  const summaryPath = join(dir, 'memory/summary.md')

  const inbox = listJson(dir, 'events/inbox')
    .slice(-MAX_INBOX_EVENTS * 5)
    .map((path): InboxItem => {
      try {
        const parsed = VisitorEvent.safeParse(JSON.parse(readFileSync(join(dir, path), 'utf8')))
        return parsed.success ? { path, event: parsed.data } : { path, event: null, problem: lines(parsed.error).join('; ') }
      } catch (e) {
        return { path, event: null, problem: `isn't valid JSON: ${(e as Error).message}` }
      }
    })

  return {
    dir,
    forkling,
    objects,
    goals: readJson(dir, 'mind/goals.json', Goals, {}),
    mindState: readJson(dir, 'mind/state.json', MindState, {}),
    budget: readJson(dir, 'brain/budget.json', BudgetLedger, { month: monthFor(forkling) }),
    skills: readJson(dir, 'brain/skills.json', Skills, {}),
    temperament: existsSync(join(dir, 'brain/temperament.json')) ? readJson(dir, 'brain/temperament.json', TemperamentRoll) : null,
    persona: existsSync(personaPath) ? readFileSync(personaPath, 'utf8') : '',
    beliefs: readJson(dir, 'memory/beliefs.json', Beliefs, []),
    summary: existsSync(summaryPath) ? readFileSync(summaryPath, 'utf8') : '',
    inbox,
  }
}

const normalize = (text: string) => text.replace(/\r\n/g, '\n')

/** Writes a JSON file the way the repo keeps it. Returns whether the content changed. */
export function writeJson(dir: string, rel: string, value: unknown): boolean {
  const full = join(dir, rel)
  const text = `${JSON.stringify(value, null, 2)}\n`
  if (existsSync(full) && normalize(readFileSync(full, 'utf8')) === text) return false
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, text)
  return true
}

/** A text file of the world, or null if it isn't there. */
export function readText(dir: string, rel: string): string | null {
  const full = join(dir, rel)
  return existsSync(full) ? readFileSync(full, 'utf8') : null
}

/** Writes a text file (a journal entry, the memory summary). Returns whether the content changed. */
export function writeText(dir: string, rel: string, text: string): boolean {
  const full = join(dir, rel)
  if (existsSync(full) && normalize(readFileSync(full, 'utf8')) === text) return false
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, text)
  return true
}

export function deleteFile(dir: string, rel: string): void {
  rmSync(join(dir, rel), { force: true })
}
