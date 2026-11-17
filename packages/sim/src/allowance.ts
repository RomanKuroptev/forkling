/**
 * The daily allowance (spec 9.8). Merge decides how to spend its effort: each wake it gets 150 points, a point is $0.001
 * of expected model cost, and a plan may not cost more than the points in hand. Pure. The prices are the starting ones;
 * each Sunday code sets them again from the real average cost in the ledger (`pricesFromLedger`, `pricesDue`).
 */
import { localDate } from './sleep.ts'
import { localWeekday } from './weekly.ts'

export type PricedVerb = 'wander' | 'tend' | 'revisit' | 'expand' | 'found' | 'tinker' | 'write' | 'reply' | 'rest'

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
  write: number
  /** Replies have a rail of their own (5 a day) and cost nothing from the allowance. */
  reply: number
  rest: number
}

export const PRICES: Prices = { fullWork: 240, expand: 50, expandEarned: 20, trip: 3, tend: 2, sketch: 50, found: 80, revisit: 1, write: 1, reply: 0, rest: 0 }

/** Points at each wake. */
export const DAILY_POINTS = 150
/** What may be saved up. A full work therefore takes about two days of saving. */
export const MAX_POINTS_IN_HAND = 450
/** A deep step runs its step call on Sonnet at medium effort. */
export const DEEP_COST = 30

export interface PricedStep {
  verb: PricedVerb
  /** Only a tinker has a size. One that does not say is a full work. */
  size?: 'full' | 'sketch'
  /** Marks a tend, write or found request as one to think harder about. */
  deep?: boolean
  /** Only an expand: the place has earned the lower price. */
  earned?: boolean
}

/** Points in hand after waking: what was saved, plus the day's 150, up to the most that may be held. */
export function pointsAtWake(inHand: number): number {
  return Math.min(MAX_POINTS_IN_HAND, Math.max(0, inHand) + DAILY_POINTS)
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
      return step.earned ? prices.expandEarned : prices.expand
    case 'found':
      return prices.found
    case 'tinker':
      return step.size === 'sketch' ? prices.sketch : prices.fullWork
    case 'write':
      return prices.write
    case 'reply':
      return prices.reply
    case 'rest':
      return prices.rest
  }
}

export function planCost(steps: readonly PricedStep[], prices: Prices = PRICES): number {
  return steps.reduce((sum, s) => sum + stepCost(s, prices), 0)
}

/** A sketch is never priced under this many points, however cheap the week's sketches were (Roman, 17 Nov). */
export const SKETCH_PRICE_FLOOR = 20
/** A price is only reset from a kind of call that has at least this many calls in the window; fewer keep the old price. */
export const MIN_CALLS_FOR_PRICE = 3
const PRICE_WINDOW_MS = 7 * 86_400_000
/** A trip is up to this many reads, so it is priced as that many reads at the average read cost. */
const READS_PER_TRIP = 6

export interface LedgerCall {
  at: string
  kind: string
  usd: number
}

/** Which ledger call kinds make up each price. A sketch and a rework are both made as sketches; the write step's calls are `art`. */
const PRICE_KINDS: Partial<Record<keyof Prices, readonly string[]>> = {
  sketch: ['sketch', 'rework'],
  tend: ['tend'],
  expand: ['expand'],
  revisit: ['revisit'],
  write: ['art'],
}

const points = (usd: number): number => Math.max(1, Math.ceil(usd * 1000 - 1e-9))

/**
 * The prices set again from what the calls really cost: for each price, the average cost of its kind of call over the last 7 days,
 * in points of $0.001, rounded up, never below 1, and a sketch never below 20. A price whose kind has fewer than 3 calls in the window
 * keeps its old value (the ledger keeps only its last 500 calls, so a quiet kind may have none). A full work is its build call plus its
 * share of the repair calls; a trip is up to 6 reads at the average read cost; replies and rest stay free. Pure.
 */
export function pricesFromLedger(calls: readonly LedgerCall[], nowMs: number, current: Prices): Prices {
  const since = nowMs - PRICE_WINDOW_MS
  const recent = calls.filter((c) => Date.parse(c.at) >= since)
  const of = (...kinds: readonly string[]) => recent.filter((c) => kinds.includes(c.kind))
  const mean = (list: readonly LedgerCall[]) => list.reduce((n, c) => n + c.usd, 0) / list.length
  const next: Prices = { ...current }
  for (const [key, kinds] of Object.entries(PRICE_KINDS) as [keyof Prices, readonly string[]][]) {
    const list = of(...kinds)
    if (list.length >= MIN_CALLS_FOR_PRICE) next[key] = points(mean(list))
  }
  const builds = of('tinker')
  if (builds.length >= MIN_CALLS_FOR_PRICE) next.fullWork = points(mean(builds) + of('repair').reduce((n, c) => n + c.usd, 0) / builds.length)
  const reads = of('read')
  if (reads.length >= MIN_CALLS_FOR_PRICE) next.trip = points(mean(reads) * READS_PER_TRIP)
  next.sketch = Math.max(SKETCH_PRICE_FLOOR, next.sketch)
  return next
}

/** Whether the prices are set again now: awake, on a Sunday in the forkling's time zone, and not already done that Sunday. Pure. */
export function pricesDue(a: { timezone: string; nowMs: number; asleep: boolean; today: string; pricesSetOn?: string | undefined }): boolean {
  if (a.asleep) return false
  return localWeekday(a.timezone, a.nowMs) === 0 && a.pricesSetOn !== a.today && localDate(a.timezone, a.nowMs) === a.today
}

/** The prices in force: the starting ones until a Sunday reset has set others. Anything a stored table lacks comes from the starting ones. */
export function livePrices(stored: Partial<Prices> | undefined): Prices {
  const { foundRequest: _old, ...rest } = (stored ?? {}) as Partial<Prices> & { foundRequest?: number }
  return { ...PRICES, ...rest }
}
