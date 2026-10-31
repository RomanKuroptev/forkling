import { createPrng } from './prng.ts'

const MIN = 60_000
const WAKE_HOUR = 7
const BED_HOUR = 23
const JITTER_MIN = 30
const WEEKEND_LIE_IN_MIN = 60
const LATE_NIGHT_MIN = 90

export interface SleepOptions {
  /** The forkling's own seed, so two forklings keep different hours. */
  seed: number
  timezone: string
  /** Local date (`YYYY-MM-DD`) on whose evening the forkling stays up late. */
  lateNight?: string
}

export interface SleepWindow {
  /** Unix ms when it wakes on this local date. */
  wakeMs: number
  /** Unix ms when it goes to bed on the evening of this local date. */
  bedMs: number
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>()
const partFormatters = new Map<string, Intl.DateTimeFormat>()

/** The local calendar date (`YYYY-MM-DD`) in an IANA time zone at a Unix time in milliseconds. */
export function localDate(timezone: string, ms: number): string {
  let format = dateFormatters.get(timezone)
  if (!format) {
    format = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
    dateFormatters.set(timezone, format)
  }
  return format.format(new Date(ms))
}

/** The zone's offset from UTC at a Unix time, in ms. */
function offsetAt(timezone: string, ms: number): number {
  let format = partFormatters.get(timezone)
  if (!format) {
    format = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
    partFormatters.set(timezone, format)
  }
  const p: Record<string, number> = {}
  for (const part of format.formatToParts(new Date(ms))) if (part.type !== 'literal') p[part.type] = Number(part.value)
  return Date.UTC(p.year!, p.month! - 1, p.day!, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000
}

/** Unix ms of `hours` after local midnight on a local date. Right across daylight saving changes. */
function zonedMs(date: string, hours: number, timezone: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  const guess = Date.UTC(y, m - 1, d) + hours * 3_600_000
  const first = guess - offsetAt(timezone, guess)
  return guess - offsetAt(timezone, first)
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

function dayKey(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000)
}

/** Jitter in minutes, within ±30, fixed by the seed, the day and which end of the day it is for. */
function jitter(seed: number, date: string, salt: number): number {
  const rng = createPrng(Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(dayKey(date) + salt, 0xc2b2ae35))
  rng.next()
  return rng.range(-JITTER_MIN, JITTER_MIN)
}

/** When the forkling wakes on a local date and when it goes to bed that evening. Deterministic. */
export function sleepWindow(date: string, seed: number, timezone: string, lateNight = false): SleepWindow {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay()
  const weekend = weekday === 0 || weekday === 6
  const wakeShift = jitter(seed, date, 1) + (weekend ? WEEKEND_LIE_IN_MIN : 0)
  const bedShift = jitter(seed, date, 2) + (lateNight ? LATE_NIGHT_MIN : 0)
  return {
    wakeMs: Math.round(zonedMs(date, WAKE_HOUR, timezone) + wakeShift * MIN),
    bedMs: Math.round(zonedMs(date, BED_HOUR, timezone) + bedShift * MIN),
  }
}

/** Whether the forkling is in bed at a Unix time in milliseconds. */
export function isAsleepAt(ms: number, opts: SleepOptions): boolean {
  const date = localDate(opts.timezone, ms)
  const today = sleepWindow(date, opts.seed, opts.timezone, opts.lateNight === date)
  if (ms >= today.bedMs) return true
  if (ms < today.wakeMs) {
    // Still asleep, unless last night's bedtime (a late one) hasn't come yet.
    const yesterday = addDays(date, -1)
    const lastBed = sleepWindow(yesterday, opts.seed, opts.timezone, opts.lateNight === yesterday).bedMs
    return ms >= lastBed
  }
  return false
}
