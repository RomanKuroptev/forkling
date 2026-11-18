import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { Artifact, Beliefs, BudgetLedger, type Credit, Forkling, Goals, Interests, MindState, SourceStats, Tools, Visitors, Wants, actTools, type Note, type NotesHidden } from '@forkling/schema'
import { readCredits } from './credits.ts'
import { readNotes, readNotesHidden } from './notes.ts'
import { DEFAULT_SEED } from './seed.ts'

/** Everything a tick reads from a world repo, validated. */
export interface WorldFiles {
  dir: string
  forkling: Forkling
  goals: Goals
  mindState: MindState
  budget: BudgetLedger
  /** `brain/credits.json` (spec v4 5.3): money Roman has added, or none. The effective cap is `budget.capUsd` plus this month's. */
  credits: Credit[]
  /** `mind/sources.json`: each source's weekly numbers. */
  sources: SourceStats
  /** The forkling's own `brain/persona.md`, or empty. Pet era: nothing reads it any more. */
  persona: string
  /** `self/seed.md`: the only authored personality text, or the engine's own copy until the world has one. */
  seed: string
  /** `memory/beliefs.json`: everything it has believed, dropped ones included. */
  beliefs: Beliefs
  /** `notes/*.json` (spec 10.1): every note a visitor left, and `mind/notes-hidden.json`, the ones Roman hid. */
  notes: Note[]
  notesHidden: NotesHidden
  /** `memory/visitors.json` (spec v4 7): who Merge has talked to, by the name they gave; empty before the first named note. */
  visitors: Visitors
  /** `mind/tools.json` (spec v4 8): what Roman has given Merge, or none. */
  tools: Tools
  /** `self/about.md` (spec 9.2): who Merge says it is now, or empty before its first weekly review. */
  about: string
  /** `self/page.md` (spec 9.7): Merge's own notes to itself, or empty. */
  page: string
  /** `mind/wants.json` (spec 9.4): the wants list, or an empty one. */
  wants: Wants
  /** `memory/summary.md`: its long-term memory, or empty. */
  summary: string
  /** `brain/interests.json`: what it is into, and its obsessions. */
  interests: Interests
  /** Everything in `art/`. */
  art: Artifact[]
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

/**
 * `mind/tools.json` (spec v4 8). The rail: nothing Merge can do reaches outside its own world at launch, so an entry of class `act`
 * stops the engine, with a plain message. The server checks it at start and every tick checks it again.
 */
export function readTools(dir: string): Tools {
  const tools = readJson(dir, 'mind/tools.json', Tools, {})
  const act = actTools(tools)
  if (act.length > 0) throw new Error(`mind/tools.json has an entry of class act (${act.map((t) => t.id).join(', ')}). Merge cannot act outside its own world yet, so the engine will not start until it is taken out of the file.`)
  return tools
}

/** Reads and validates a world repo. A file that doesn't fit is an error naming the file and every problem in it. */
export function readWorld(dir: string, monthFor: (forkling: Forkling) => string): WorldFiles {
  const forkling = readJson(dir, 'forkling.json', Forkling)
  const personaPath = join(dir, 'brain/persona.md')
  const summaryPath = join(dir, 'memory/summary.md')

  return {
    dir,
    forkling,
    goals: readJson(dir, 'mind/goals.json', Goals, {}),
    mindState: readJson(dir, 'mind/state.json', MindState, {}),
    budget: readJson(dir, 'brain/budget.json', BudgetLedger, { month: monthFor(forkling) }),
    credits: readCredits(dir),
    sources: readJson(dir, 'mind/sources.json', SourceStats, {}),
    persona: existsSync(personaPath) ? readFileSync(personaPath, 'utf8') : '',
    seed: existsSync(join(dir, 'self/seed.md')) ? readFileSync(join(dir, 'self/seed.md'), 'utf8') : DEFAULT_SEED,
    beliefs: readJson(dir, 'memory/beliefs.json', Beliefs, []),
    wants: readJson(dir, 'mind/wants.json', Wants, {}),
    notes: readNotes(dir),
    notesHidden: readNotesHidden(dir),
    visitors: readJson(dir, 'memory/visitors.json', Visitors, {}),
    tools: readTools(dir),
    about: existsSync(join(dir, 'self/about.md')) ? readFileSync(join(dir, 'self/about.md'), 'utf8').trim() : '',
    page: existsSync(join(dir, 'self/page.md')) ? readFileSync(join(dir, 'self/page.md'), 'utf8').trim() : '',
    summary: existsSync(summaryPath) ? readFileSync(summaryPath, 'utf8') : '',
    interests: readJson(dir, 'brain/interests.json', Interests, {}),
    art: listJson(dir, 'art').flatMap((rel) => {
      try {
        const parsed = Artifact.safeParse(JSON.parse(readFileSync(join(dir, rel), 'utf8')))
        return parsed.success ? [parsed.data] : []
      } catch {
        return []
      }
    }),
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

/** Writes a binary file (a thumbnail). Returns whether the content changed. */
export function writeBytes(dir: string, rel: string, bytes: Buffer): boolean {
  const full = join(dir, rel)
  if (existsSync(full) && readFileSync(full).equals(bytes)) return false
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, bytes)
  return true
}

export function deleteFile(dir: string, rel: string): void {
  rmSync(join(dir, rel), { force: true })
}
