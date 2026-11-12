import type { ThoughtState } from '@forkling/schema'
import { hourInZone } from './playback.ts'

const MIN = 60_000

/** Thought ticks come every 2 minutes from 18:00 to sleep time and every 5 minutes at other waking hours (spec 2.2). */
export const THOUGHT_EVENING_HOUR = 18
export const THOUGHT_EVENING_INTERVAL_MS = 2 * MIN
export const THOUGHT_DAY_INTERVAL_MS = 5 * MIN
/** While spend runs ahead of the month's pace they slow to every 10 minutes (spec 13). */
export const THOUGHT_SLOW_INTERVAL_MS = 10 * MIN
/** After this many failures in a row they pause (spec 11.3). */
export const MAX_THOUGHT_FAILURES = 5
export const THOUGHT_PAUSE_MS = 15 * MIN
/** At most this many replans a day may come from thought ticks (spec 2.3). */
export const MAX_THOUGHT_REPLANS_PER_DAY = 4
const MAX_REASON_CHARS = 140
const KEEP_THOUGHTS = 5

export function thoughtIntervalMs(a: { timezone: string; nowMs: number; paceAhead: boolean }): number {
  if (a.paceAhead) return THOUGHT_SLOW_INTERVAL_MS
  return hourInZone(a.timezone, a.nowMs) >= THOUGHT_EVENING_HOUR ? THOUGHT_EVENING_INTERVAL_MS : THOUGHT_DAY_INTERVAL_MS
}

/** Whether a thought tick should run now. Never while asleep, never during a pause, and otherwise an interval after the last. */
export function thoughtDue(a: { timezone: string; nowMs: number; asleep: boolean; paceAhead: boolean; thought?: ThoughtState | undefined }): boolean {
  if (a.asleep) return false
  const { thought } = a
  if (thought?.pausedUntil && a.nowMs < Date.parse(thought.pausedUntil)) return false
  if (!thought?.lastAt) return true
  return a.nowMs - Date.parse(thought.lastAt) >= thoughtIntervalMs(a)
}

export type ThoughtOutcome = { ok: true; line: string } | { ok: false } | { skipped: true }

/**
 * What a thought tick leaves behind. A good one keeps its line (the last 5) and clears the failures; a failed one counts,
 * and the fifth in a row pauses them for 15 minutes and starts the count again; a skipped one (no call was made, say at
 * the budget cap) only moves the clock, so it is tried again an interval later and not every reflex tick.
 */
export function afterThought(prev: ThoughtState | undefined, outcome: ThoughtOutcome, nowMs: number): ThoughtState {
  const base: ThoughtState = { failures: 0, recent: [], ...prev, lastAt: new Date(nowMs).toISOString() }
  delete base.pausedUntil
  if ('skipped' in outcome) return { ...base, ...(prev?.pausedUntil ? { pausedUntil: prev.pausedUntil } : {}) }
  if (outcome.ok) return { ...base, failures: 0, recent: [...base.recent, outcome.line].slice(-KEEP_THOUGHTS) }
  const failures = base.failures + 1
  if (failures >= MAX_THOUGHT_FAILURES) return { ...base, failures: 0, pausedUntil: new Date(nowMs + THOUGHT_PAUSE_MS).toISOString() }
  return { ...base, failures }
}

/** Records a replan a thought asked for, or returns null when the day's 4 are used. The reason is cut to 140 characters. */
export function requestReplan(prev: ThoughtState | undefined, a: { today: string; reason: string; at: string }): ThoughtState | null {
  const used = prev?.replans?.date === a.today ? prev.replans.count : 0
  if (used >= MAX_THOUGHT_REPLANS_PER_DAY) return null
  return {
    failures: 0,
    recent: [],
    ...prev,
    replans: { date: a.today, count: used + 1 },
    replanRequest: { reason: a.reason.trim().slice(0, MAX_REASON_CHARS), at: a.at },
  }
}
