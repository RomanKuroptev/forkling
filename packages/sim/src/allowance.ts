/**
 * The daily allowance (spec 9.8). Merge decides how to spend its effort: each wake it gets its daily points (300 at the start, set again each Sunday from the ledger), a point is $0.001
 * of expected model cost, and a plan may not cost more than the points in hand. Pure. The prices are the starting ones;
 * each Sunday code sets them again from the real average cost in the ledger (`pricesFromLedger`, `pricesDue`).
 */
import { POINTS_HELD_MAX } from '@forkling/schema'
import { localDate } from './sleep.ts'
import { localHour, localWeekday, WEEKLY_REVIEW_HOUR } from './weekly.ts'

export type PricedVerb = 'wander' | 'tend' | 'revisit' | 'expand' | 'found' | 'tinker' | 'write' | 'reply' | 'rest' | 'build'

export interface Prices {
  /** A tinker that makes a whole work: the build plus the average repair. */
  fullWork: number
  expand: number
  /** An expand on a place that has earned it (spec v4 2.2). Fixed; the weekly reset leaves it. */
  expandEarned: number
  /** A wander: one trip of up to 6 reads. */
  trip: number
  tend: number
  /** A tinker that makes a sketch: a Sonnet call of about $0.05, so 50 points. A price, not a daily cap: Merge chooses how many. */
  sketch: number
  /** A found: Merge founds a place and the server builds it from the kit (spec v4 2.3). Fixed; the weekly reset leaves it. */
  found: number
  revisit: number
  /** A write whose target is a place, a work or a project (spec v4 5.1). Fixed. */
  caption: number
  /** A write whose target is a subject: standalone text is priced over its cost, on purpose (spec v4 5.1). Fixed. */
  page: number
  /** Replies have a rail of their own (5 a day) and cost nothing from the allowance. */
  reply: number
  rest: number
}

export const PRICES: Prices = { fullWork: 150, expand: 50, expandEarned: 20, trip: 3, tend: 2, sketch: 30, found: 80, revisit: 1, caption: 1, page: 10, reply: 0, rest: 0 }

/** Points at each wake until the first Sunday formula has set another figure (spec v4 5.2). */
export const DAILY_POINTS = 300
/** What may be saved up (spec v4 5.2). */
export const MAX_POINTS_IN_HAND = POINTS_HELD_MAX
/** A deep step runs its step call on Sonnet at medium effort. */
export const DEEP_COST = 30

export interface PricedStep {
  verb: PricedVerb
  /** Only a tinker has a size. One that does not say is a full work. */
  size?: 'full' | 'sketch'
  /** Only a write: its target is a place, a work or a project, so it is a caption and not a page. */
  caption?: boolean
  /** Marks a tend, write or found request as one to think harder about. */
  deep?: boolean
  /** Only an expand: the place has earned the lower price. */
  earned?: boolean
}

/** Points in hand after waking: what was saved, plus the day's grant (`daily`, 300 until a Sunday sets it), up to the most that may be held. */
export function pointsAtWake(inHand: number, daily: number = DAILY_POINTS): number {
  return Math.min(MAX_POINTS_IN_HAND, Math.max(0, inHand) + daily)
}

/** Where a grant of points came from (spec v4 5.3). `daily` is the only source today; donations and the like would add their own. */
export interface PointGrant {
  at: string
  points: number
  source: string
}

/** How many grants are remembered. */
export const MAX_GRANTS_KEPT = 30

/**
 * Gives points from a source: what was in hand plus `points`, up to the most that may be held, and the grant added to the record of
 * the last 30. The source is an argument: no code assumes the only source is the daily grant (spec v4 5.3). Pure.
 */
export function grantPoints(inHand: number, grant: PointGrant, grants: readonly PointGrant[]): { points: number; grants: PointGrant[] } {
  return { points: Math.min(MAX_POINTS_IN_HAND, Math.max(0, inHand) + grant.points), grants: [...grants, grant].slice(-MAX_GRANTS_KEPT) }
}

/** Whether a step may be deep: the ones whose step call is a Haiku call that Merge may choose to run on Sonnet. A sketch is not one: it is always Sonnet. */
function mayBeDeep(step: PricedStep): boolean {
  return step.verb === 'tend' || step.verb === 'write' || step.verb === 'found'
}

export function stepCost(step: PricedStep, prices: Prices = PRICES): number {
  if (step.deep && mayBeDeep(step)) return DEEP_COST
  switch (step.verb) {
    case 'wander':
      return prices.trip
    case 'tend':
      return prices.tend
    case 'revisit':
      return prices.revisit
    case 'expand':
      // Earning gives a lower price, never a higher one: the expand price floats with the Sunday reset, the earned one is fixed (spec v4 2.2).
      return step.earned ? Math.min(prices.expandEarned, prices.expand) : prices.expand
    case 'found':
      return prices.found
    case 'tinker':
      return step.size === 'sketch' ? prices.sketch : prices.fullWork
    case 'write':
      return step.caption ? prices.caption : prices.page
    case 'reply':
      return prices.reply
    case 'rest':
      return prices.rest
    case 'build':
      // A build session is metered as it runs (spec-v4 3.3: 1 point per $0.001 spent), so it costs nothing when it starts.
      return 0
  }
}

export function planCost(steps: readonly PricedStep[], prices: Prices = PRICES): number {
  return steps.reduce((sum, s) => sum + stepCost(s, prices), 0)
}

/** A price is only reset from a kind of call that has at least this many calls in the window; fewer keep the old price (spec v4 5.2). */
export const MIN_CALLS_FOR_PRICE = 5
/** The window of calls a price is reset from, in days (spec v4 5.2). The ledger keeps only its last 500 calls, so it may be shorter in fact. */
export const PRICE_WINDOW_DAYS = 14
/** A price moves by at most this share of itself in a week, and is never under 1 (spec v4 5.2). */
export const PRICE_MAX_MOVE = 0.25
/** A sketch and a full work are priced under their cost, on purpose: visible things are cheap (spec v4 5.1). */
export const VISIBLE_FACTOR = 0.6
const PRICE_WINDOW_MS = PRICE_WINDOW_DAYS * 86_400_000
/** A trip is up to this many reads, so it is priced as that many reads at the average read cost. */
const READS_PER_TRIP = 6

export interface LedgerCall {
  at: string
  kind: string
  usd: number
}

/** Which ledger call kinds make up each reset price. A sketch and a rework are both made as sketches. Fixed prices (caption, page, expandEarned, deep, reply, rest) are not here. */
const PRICE_KINDS: Partial<Record<keyof Prices, readonly string[]>> = {
  sketch: ['sketch', 'rework'],
  tend: ['tend'],
  expand: ['expand'],
  revisit: ['revisit'],
}

const points = (usd: number): number => Math.max(1, Math.ceil(usd * 1000 - 1e-9))

/** A price moved toward `target` by at most a quarter of itself, rounded, never under 1. */
export function moveToward(current: number, target: number): number {
  const lo = Math.max(1, Math.round(current * (1 - PRICE_MAX_MOVE)))
  const hi = Math.max(1, Math.round(current * (1 + PRICE_MAX_MOVE)))
  return Math.min(hi, Math.max(lo, Math.max(1, target)))
}

/**
 * The prices set again from what the calls really cost (spec v4 5.2): for each reset price, the average cost of its kind of call over
 * the last 14 days, in points of $0.001, times its factor (sketch and full work 0.6, the rest 1), rounded up. A price moves by at most 25%
 * a week and is never under 1, and a kind with fewer than 5 calls in the window keeps its old price. A full work is its build call plus
 * its share of the repair calls; a trip is up to 6 reads at the average read cost; a found is the found call plus the kit build call.
 * Captions, pages, an earned expand, replies and rest are fixed. Pure.
 */
export function pricesFromLedger(calls: readonly LedgerCall[], nowMs: number, current: Prices): Prices {
  const since = nowMs - PRICE_WINDOW_MS
  const recent = calls.filter((c) => Date.parse(c.at) >= since)
  const of = (...kinds: readonly string[]) => recent.filter((c) => kinds.includes(c.kind))
  const mean = (list: readonly LedgerCall[]) => list.reduce((n, c) => n + c.usd, 0) / list.length
  const next: Prices = { ...current }
  const set = (key: keyof Prices, usd: number, factor = 1) => {
    next[key] = moveToward(current[key], points(usd * factor))
  }
  for (const [key, kinds] of Object.entries(PRICE_KINDS) as [keyof Prices, readonly string[]][]) {
    const list = of(...kinds)
    if (list.length >= MIN_CALLS_FOR_PRICE) set(key, mean(list), key === 'sketch' ? VISIBLE_FACTOR : 1)
  }
  const builds = of('tinker')
  if (builds.length >= MIN_CALLS_FOR_PRICE) set('fullWork', mean(builds) + of('repair').reduce((n, c) => n + c.usd, 0) / builds.length, VISIBLE_FACTOR)
  const reads = of('read')
  if (reads.length >= MIN_CALLS_FOR_PRICE) set('trip', mean(reads) * READS_PER_TRIP)
  const asked = of('found')
  const built = of('foundbuild')
  if (asked.length >= MIN_CALLS_FOR_PRICE && built.length >= MIN_CALLS_FOR_PRICE) set('found', mean(asked) + mean(built))
  return next
}

/** The call kinds the allowance does not pay for: the overhead the daily points formula subtracts (spec v4 5.2). */
export const OVERHEAD_KINDS: readonly string[] = ['thought', 'decide', 'morning', 'reflection', 'bedtime', 'memory', 'screen', 'goalreview', 'weekly', 'look']
/** The daily points need this many full days of overhead on record before the formula replaces the starting figure. */
export const OVERHEAD_DAYS_NEEDED = 7
/** Never less than this, whatever the ledger says (spec v4 5.2). */
export const DAILY_POINTS_FLOOR = 100

/**
 * The overhead of each local date in the ledger, as `{ date, usd }` for every date before `today` that is not yet in `known`. The ledger
 * keeps only its last 500 calls, so each day is read the day after it, while its calls are still there; `known` keeps what was read.
 * Pure. `dateOf` gives the local date of a call.
 */
export function recordOverheadDays(known: readonly { date: string; usd: number }[], calls: readonly LedgerCall[], today: string, dateOf: (iso: string) => string): { date: string; usd: number }[] {
  const have = new Set(known.map((d) => d.date))
  const sums = new Map<string, number>()
  for (const c of calls) {
    if (!OVERHEAD_KINDS.includes(c.kind)) continue
    const d = dateOf(c.at)
    if (d >= today || have.has(d)) continue
    sums.set(d, (sums.get(d) ?? 0) + c.usd)
  }
  return [...known, ...[...sums].map(([date, usd]) => ({ date, usd }))].sort((a, b) => a.date.localeCompare(b.date)).slice(-14)
}

/**
 * The daily points from the ledger (spec v4 5.2): `max(100, round to 10 of ((cap - overhead x days) / days x 1000 x 0.9))`, where cap is
 * the effective model cap for the month, overhead is the mean daily spend of the overhead kinds over the last 7 full days and days is
 * the days in the month. Until 7 full days are on record it stays at the starting `DAILY_POINTS`. Pure.
 */
export function dailyPointsFor(a: { capUsd: number; daysInMonth: number; overheadDays: readonly { usd: number }[] }): number {
  const last = a.overheadDays.slice(-OVERHEAD_DAYS_NEEDED)
  if (last.length < OVERHEAD_DAYS_NEEDED) return DAILY_POINTS
  const overhead = last.reduce((n, d) => n + d.usd, 0) / last.length
  const raw = ((a.capUsd - overhead * a.daysInMonth) / a.daysInMonth) * 1000 * 0.9
  return Math.max(DAILY_POINTS_FLOOR, Math.round(raw / 10) * 10)
}

/** Whether the prices are set again now: awake, on a Sunday in the forkling's time zone, and not already done that Sunday. Pure. */
export function pricesDue(a: { timezone: string; nowMs: number; asleep: boolean; today: string; pricesSetOn?: string | undefined }): boolean {
  if (a.asleep) return false
  // Sunday from 20:00, after the weekly review (spec v4 5.2).
  return localWeekday(a.timezone, a.nowMs) === 0 && localHour(a.timezone, a.nowMs) >= WEEKLY_REVIEW_HOUR && a.pricesSetOn !== a.today && localDate(a.timezone, a.nowMs) === a.today
}

/** The prices in force: the starting ones until a Sunday reset has set others. Anything a stored table lacks comes from the starting ones. */
export function livePrices(stored: Partial<Prices> | undefined): Prices {
  const { foundRequest: _found, write: _write, ...rest } = (stored ?? {}) as Partial<Prices> & { foundRequest?: number; write?: number }
  return { ...PRICES, ...rest }
}
