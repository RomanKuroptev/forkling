import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { Health, TICK_KEEP_DAYS, TickLine, type Goals, type TickStep } from '@forkling/schema'
import { clampText } from './decision.ts'
import { buildHealth } from './health.ts'
import type { Tick, TickResult } from './tick/context.ts'
import { round } from './tick/util.ts'
import { writeJson } from './world.ts'

const ticksPath = (date: string) => `mind/ticks/${date}.jsonl`
const HEALTH_PATH = 'mind/health.json'

/** A day's tick lines. A line that does not fit the schema is skipped, never fatal. */
export function readTicks(dir: string, date: string): TickLine[] {
  const full = join(dir, ticksPath(date))
  if (!existsSync(full)) return []
  return readFileSync(full, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((text) => {
      try {
        const parsed = TickLine.safeParse(JSON.parse(text))
        return parsed.success ? [parsed.data] : []
      } catch {
        return []
      }
    })
}

function appendTick(dir: string, date: string, line: TickLine): void {
  const full = join(dir, ticksPath(date))
  mkdirSync(join(full, '..'), { recursive: true })
  appendFileSync(full, `${JSON.stringify(line)}\n`)
}

function daysBefore(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10)
}

/** Deletes tick logs past their keeping time. Returns the paths removed. */
export function pruneTicks(dir: string, today: string): string[] {
  const folder = join(dir, 'mind/ticks')
  if (!existsSync(folder)) return []
  const oldest = daysBefore(today, TICK_KEEP_DAYS - 1)
  const removed: string[] = []
  for (const name of readdirSync(folder)) {
    const day = /^(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(name)?.[1]
    if (day && day < oldest) {
      rmSync(join(folder, name))
      removed.push(`mind/ticks/${name}`)
    }
  }
  return removed
}

/** The last health summary, or null if there is none or it does not fit the schema (it is rebuilt from the next tick). */
export function readHealth(dir: string): Health | null {
  const full = join(dir, HEALTH_PATH)
  if (!existsSync(full)) return null
  try {
    const parsed = Health.safeParse(JSON.parse(readFileSync(full, 'utf8')))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** The step in progress, if there is one. */
function stepOf(goals: Goals): TickStep | null {
  const now = goals.now
  const step = now ? goals.today?.steps[now.index] : undefined
  if (!now || !step) return null
  return { index: now.index, verb: step.verb, ...(step.targetId ? { targetId: step.targetId } : {}), startedAt: now.startedAt, until: now.until }
}

/** FNV-1a, enough to tell one plan from another. */
function hash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** Today's plan as a short id that changes when the plan is replaced. */
function planIdOf(goals: Goals): string | null {
  const today = goals.today
  if (!today) return null
  return `${today.date}:${hash(JSON.stringify(today.steps.map((s) => [s.verb, s.targetId ?? null, s.minutes, s.reason])))}`
}

/** What this tick did, as one line. */
function lineFor(t: Tick, result: TickResult): TickLine {
  return TickLine.parse({
    at: t.nowIso,
    engine: t.deps.engine ?? 'dev',
    asleep: t.asleep,
    triggers: t.triggers.slice(0, 12).map((x) => ({ kind: x.kind, score: round(x.score, 2) })),
    think: t.thinkKind,
    calls: t.attempts.slice(0, 20),
    notes: t.notes.slice(0, 30).map((n) => clampText(n, 300)),
    stepBefore: stepOf(t.w.goals),
    stepAfter: stepOf(t.goals),
    planId: planIdOf(t.goals),
    needs: Object.fromEntries(Object.entries(t.body.needs).map(([id, v]) => [id, round(v ?? 0, 1)])),
    mood: t.mood,
    drift: [],
    wrote: result.written.slice(0, 60),
    summary: clampText(result.summary, 300),
  })
}

/**
 * Every tick leaves one line in `mind/ticks/` and refreshes `mind/health.json`, even a tick that changed nothing in the
 * world. These are the only files a quiet tick writes. A dry run writes nothing.
 */
export function logTick(t: Tick, result: TickResult): TickResult {
  if (t.deps.dryRun) return result
  const line = lineFor(t, result)
  appendTick(t.dir, t.today, line)
  pruneTicks(t.dir, t.today)
  writeJson(t.dir, HEALTH_PATH, buildHealth(readHealth(t.dir), line, { today: t.today, nowMs: t.nowMs, goals: t.goals, mind: t.mind, budget: t.budget }))
  return { ...result, logged: true }
}
