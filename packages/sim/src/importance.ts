import { COLD_START_WANTS } from './mind-plan.ts'

/** Spec 9.3: a reflection runs when the importance since the last one adds up to 60, or 30 while the wants list has fewer than 3 entries (9.4). */
export const REFLECT_THRESHOLD = 60
export const REFLECT_THRESHOLD_COLD = 30
/** At most 2 a day (v3: was 3), at least 2 hours apart. */
export const MAX_REFLECTIONS_PER_DAY = 2
export const REFLECT_GAP_MS = 2 * 3_600_000
/** A step whose surprise score is this high or higher adds its surprise score to the importance again. */
export const SURPRISE_ADDS_FROM = 7

/** The events whose importance code sets (spec 9.3 and 12.4 item 8), so the thought tick does not have to score them. */
const FIXED = {
  buildFailed: 6,
  buildLanded: 5,
  noteFound: 4,
  /** Roman set the status of a request of Merge's (spec v4 8). */
  requestAnswered: 6,
  souvenirKept: 3,
  /** An insight from a reflection is stored in the stream with importance 5 so later reflections can build on it. */
  insight: 5,
  /** "I keep repeating myself": the nudges would have fired 3 or more times in a day. */
  boredom: 6,
} as const
export type FixedEvent = keyof typeof FIXED

export const fixedImportance = (event: FixedEvent): number => FIXED[event]

/** What a step's surprise adds on top of the score the step already has: its own score again, from 7. */
export const surpriseImportance = (surprise: number): number => (surprise >= SURPRISE_ADDS_FROM ? surprise : 0)

/** The importance of everything scored after `sinceMs` (the last reflection). */
export function importanceSum(items: readonly { at: number; importance: number }[], sinceMs: number): number {
  let sum = 0
  for (const i of items) if (i.at > sinceMs) sum += i.importance
  return sum
}

export interface ReflectInput {
  sum: number
  wantCount: number
  reflectionsToday: number
  lastReflectionMs: number | null
  nowMs: number
  asleep: boolean
}

/** Whether a reflection should start now. Nothing here chooses what Merge reflects on. */
export function reflectDue(i: ReflectInput): boolean {
  if (i.asleep) return false
  if (i.reflectionsToday >= MAX_REFLECTIONS_PER_DAY) return false
  if (i.lastReflectionMs !== null && i.nowMs - i.lastReflectionMs < REFLECT_GAP_MS) return false
  return i.sum >= (i.wantCount < COLD_START_WANTS ? REFLECT_THRESHOLD_COLD : REFLECT_THRESHOLD)
}
