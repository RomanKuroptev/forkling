import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Artifact } from '@forkling/schema'
import { clampText } from './decision.ts'

/** What it did and wrote before, brought back for the mind to build on: it can only continue its own work if it can see it. */
export interface RecentPast {
  /** The last notes it wrote about what it read, newest first. */
  readings: { date: string; title: string; summary: string }[]
  /** The reason it gave for each of the two days before today, newest first. */
  plans: { date: string; reason: string }[]
  /** The latest things it made, newest first. */
  art: { date: string; kind: string; title: string }[]
}

const MAX_READINGS = 3
const PLAN_DAYS = 2
const MAX_ART = 10
const MAX_SUMMARY = 160

/** The title and the opening sentence of a note written by `renderReadingNote`. Null for anything else. */
export function parseReadingNote(text: string): { title: string; summary: string } | null {
  const lines = text.split('\n')
  const title = /^# (.+)$/.exec(lines[0] ?? '')?.[1]?.trim()
  if (!title) return null
  const body = lines.slice(1).find((l) => l.trim() !== '' && !/^\*.*\*$/.test(l.trim()) && !l.startsWith('#') && !l.startsWith('- '))
  const sentence = /^.*?[.!?](?=\s|$)/.exec(body?.trim() ?? '')?.[0] ?? body?.trim() ?? ''
  return { title, summary: clampText(sentence, MAX_SUMMARY) }
}

/** The day's reason from a plan page written by `renderPlan`: the first line that is not a heading, the long goal or a step. */
export function parsePlanReason(text: string): string | null {
  const line = text.split('\n').map((l) => l.trim()).find((l) => l !== '' && !l.startsWith('#') && !l.startsWith('**Long goal') && !/^\*.*\*$/.test(l) && !/^\d+\. /.test(l))
  return line ? clampText(line, MAX_SUMMARY) : null
}

const listFiles = (dir: string, rel: string): string[] => (existsSync(join(dir, rel)) ? readdirSync(join(dir, rel)).sort() : [])

function daysBefore(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10)
}

/** Reads the recent past from the notebook and the art it has made. A missing folder or an unreadable file is skipped. */
export function readRecentPast(dir: string, today: string, art: readonly Artifact[]): RecentPast {
  const readings = listFiles(dir, 'notebook/reading')
    .filter((f) => /^\d{4}-\d{2}-\d{2}-\d+\.md$/.test(f))
    .reverse()
    .flatMap((f) => {
      const parsed = parseReadingNote(readFileSync(join(dir, 'notebook/reading', f), 'utf8'))
      return parsed ? [{ date: f.slice(0, 10), ...parsed }] : []
    })
    .slice(0, MAX_READINGS)

  const plans = Array.from({ length: PLAN_DAYS }, (_, n) => daysBefore(today, n + 1)).flatMap((date) => {
    const path = join(dir, 'notebook/plans', `${date}.md`)
    const reason = existsSync(path) ? parsePlanReason(readFileSync(path, 'utf8')) : null
    return reason ? [{ date, reason }] : []
  })

  const made = [...art]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_ART)
    .map((a) => ({ date: a.createdAt.slice(0, 10), kind: a.kind, title: a.title }))
  return { readings, plans, art: made }
}
