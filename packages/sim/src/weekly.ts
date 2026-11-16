import { localDate } from './sleep.ts'

/** Spec 9.5: the weekly review is on Sunday at 20:00, Merge's own time. */
export const WEEKLY_REVIEW_HOUR = 20
/** A review that gave nothing usable is not tried again within this long. */
export const WEEKLY_RETRY_MS = 30 * 60_000
/** Spec 9.5: up to 2 renames in a review, places and works together. */
export const MAX_REVIEW_RENAMES = 2

/** The weekday in an IANA time zone at a Unix time in milliseconds: 0 is Sunday. */
export function localWeekday(timezone: string, ms: number): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' }).format(new Date(ms))
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name)
}

const localHour = (timezone: string, ms: number): number => Number(new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' }).format(new Date(ms)))

export interface WeeklyDueInput {
  nowMs: number
  timezone: string
  asleep: boolean
  /** The local date of the last review that was usable. */
  lastWeeklyDate: string | null
  /** When a review last gave nothing usable, so it is not tried every tick. */
  lastTriedMs: number | null
}

/** The long goal is looked at again this many days after it was last reviewed, so it cannot stand unreviewed until a Sunday. */
export const GOAL_REVIEW_DAYS = 3

export interface GoalReviewDueInput {
  nowMs: number
  asleep: boolean
  /** When the long goal was last reviewed (or set), or null when there is no long goal. */
  reviewedAt: string | null
  lastTriedMs: number | null
}

/** Whether the long goal should be looked at now: awake, there is one, it was last reviewed 3 days ago or more, and no try gave nothing in the last 30 minutes. Pure. */
export function goalReviewDue(i: GoalReviewDueInput): boolean {
  if (i.asleep || i.reviewedAt === null) return false
  if (i.nowMs - Date.parse(i.reviewedAt) < GOAL_REVIEW_DAYS * 86_400_000) return false
  return i.lastTriedMs === null || i.nowMs - i.lastTriedMs >= WEEKLY_RETRY_MS
}

/**
 * Whether the weekly review should run now: Sunday from 20:00 until Merge goes to bed, once a Sunday, and not within 30 minutes
 * of a try that gave nothing. A Sunday that is missed altogether is missed; the next is a week away. Pure.
 */
export function weeklyDue(i: WeeklyDueInput): boolean {
  if (i.asleep) return false
  if (localWeekday(i.timezone, i.nowMs) !== 0 || localHour(i.timezone, i.nowMs) < WEEKLY_REVIEW_HOUR) return false
  if (i.lastWeeklyDate === localDate(i.timezone, i.nowMs)) return false
  return i.lastTriedMs === null || i.nowMs - i.lastTriedMs >= WEEKLY_RETRY_MS
}
