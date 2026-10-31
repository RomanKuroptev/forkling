import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { StreamEntry, type TimelineEntry } from '@forkling/schema'
import { clampText } from './decision.ts'

/** Raw observations are kept this many days; what mattered has been reflected into beliefs and memory by then. */
export const STREAM_KEEP_DAYS = 7
const MAX_TEXT = 300

const streamPath = (date: string) => `memory/stream/${date}.jsonl`
const timelinePath = (date: string) => `memory/timeline/${date}.jsonl`

function append(dir: string, rel: string, lines: readonly unknown[]): void {
  if (lines.length === 0) return
  const full = join(dir, rel)
  mkdirSync(join(full, '..'), { recursive: true })
  appendFileSync(full, `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`)
}

function countLines(dir: string, rel: string): number {
  const full = join(dir, rel)
  return existsSync(full) ? readFileSync(full, 'utf8').split('\n').filter(Boolean).length : 0
}

export type NewEntry = Omit<StreamEntry, 'id'>

/**
 * Adds what happened to the day's memory stream: raw observations written by code from sim events, no LLM. Entries are
 * numbered within the local day, continuing from what is already there. Returns the entries as written.
 */
export function appendStream(dir: string, date: string, entries: readonly NewEntry[]): StreamEntry[] {
  const first = countLines(dir, streamPath(date)) + 1
  const written = entries.map((e, i) => StreamEntry.parse({ ...e, id: `${date}#${first + i}`, text: clampText(e.text, MAX_TEXT) }))
  append(dir, streamPath(date), written)
  return written
}

/** The day's stream. A line that doesn't fit the schema is skipped, never fatal. */
export function readStream(dir: string, date: string): StreamEntry[] {
  const full = join(dir, streamPath(date))
  if (!existsSync(full)) return []
  return readFileSync(full, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = StreamEntry.safeParse(JSON.parse(line))
        return parsed.success ? [parsed.data] : []
      } catch {
        return []
      }
    })
}

/** One line per step it started, kept for good: the "why?" timeline must reach back further than the stream does. */
export function appendTimeline(dir: string, date: string, entry: TimelineEntry): void {
  append(dir, timelinePath(date), [entry])
}

function daysBefore(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10)
}

/** Deletes streams past their keeping time. Returns the paths removed. */
export function prune(dir: string, today: string): string[] {
  const folder = join(dir, 'memory/stream')
  if (!existsSync(folder)) return []
  const oldest = daysBefore(today, STREAM_KEEP_DAYS - 1)
  const removed: string[] = []
  for (const file of readdirSync(folder)) {
    const day = /^(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(file)?.[1]
    if (day && day < oldest) {
      rmSync(join(folder, file))
      removed.push(`memory/stream/${file}`)
    }
  }
  return removed
}
