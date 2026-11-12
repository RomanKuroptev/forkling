import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Souvenir, Trail } from '@forkling/schema'
import type { KnownSouvenir } from './trip.ts'

const DAY_MS = 86_400_000
/** An item read in the last 30 days is not read again (spec 6.6). */
const RECENT_DAYS = 30
/** The newest souvenirs a new one is compared with. */
const MAX_SOUVENIRS = 300

export interface WanderState {
  /** Whether a page was read on a trail in the last 30 days. */
  readRecently(url: string): boolean
  souvenirs: KnownSouvenir[]
  trailsToday: number
}

function files(dir: string, folder: string): string[] {
  const path = join(dir, folder)
  return existsSync(path) ? readdirSync(path).filter((f) => f.endsWith('.json')).sort() : []
}

function parse<T>(dir: string, folder: string, file: string, schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } }): T | null {
  try {
    const r = schema.safeParse(JSON.parse(readFileSync(join(dir, folder, file), 'utf8')))
    return r.success ? r.data : null
  } catch {
    return null
  }
}

/** What earlier trips left in the world that a new trip must know: the pages read lately, the souvenirs kept, the trails of today. */
export function readWanderState(dir: string, today: string): WanderState {
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - RECENT_DAYS * DAY_MS).toISOString().slice(0, 10)
  const recent = new Set<string>()
  let trailsToday = 0
  for (const file of files(dir, 'trails')) {
    const trail = parse(dir, 'trails', file, Trail)
    if (!trail) continue
    if (trail.date === today) trailsToday++
    if (trail.date >= cutoff) for (const page of trail.pages) if (!page.failed) recent.add(page.url)
  }
  const souvenirs = files(dir, 'souvenirs')
    .slice(-MAX_SOUVENIRS)
    .flatMap((file) => {
      const s = parse(dir, 'souvenirs', file, Souvenir)
      return s ? [{ id: s.id, url: s.source.url, content: s.content }] : []
    })
  return { readRecently: (url) => recent.has(url), souvenirs, trailsToday }
}
