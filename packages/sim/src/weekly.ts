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
