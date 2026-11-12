import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Trail, type Artifact } from '@forkling/schema'
import { clampText } from './decision.ts'

/** What it did and wrote before, brought back for the mind to build on: it can only continue its own work if it can see it. */
export interface RecentPast {
  /** The last trips it made, newest first: where it started and what it made of the page it liked best. */
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
  const readings = listFiles(dir, 'trails')
    .filter((f) => f.endsWith('.json'))
    .reverse()
    .flatMap((f) => {
      try {
        const parsed = Trail.safeParse(JSON.parse(readFileSync(join(dir, 'trails', f), 'utf8')))
        if (!parsed.success) return []
        const best = [...parsed.data.pages].filter((p) => p.reaction).sort((a, b) => (b.interest ?? 0) - (a.interest ?? 0))[0]
        const first = parsed.data.pages[0]!
        return [{ date: parsed.data.date, title: clampText(best?.title ?? first.title, 80), summary: clampText(best?.reaction ?? parsed.data.purpose, MAX_SUMMARY) }]
      } catch {
        return []
      }
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
