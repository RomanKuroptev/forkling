/**
 * The daily allowance (spec 9.8). Merge decides how to spend its effort: each wake it gets 150 points, a point is $0.001
 * of expected model cost, and a plan may not cost more than the points in hand. Pure. The prices are the starting ones;
 * each Sunday code sets them again from the real average cost in the ledger (not built yet).
 */

export type PricedVerb = 'wander' | 'tend' | 'revisit' | 'expand' | 'found' | 'tinker' | 'write' | 'reply' | 'rest'

export interface Prices {
  /** A tinker that makes a whole work: the build plus the average repair. */
  fullWork: number
  expand: number
  /** A wander: one trip of up to 6 reads. */
  trip: number
  tend: number
  /** A tinker that makes a sketch. */
  sketch: number
  /** Writing the build request that a found step makes. */
  foundRequest: number
  revisit: number
  write: number
  /** Replies have a rail of their own (5 a day) and cost nothing from the allowance. */
  reply: number
  rest: number
}

export const PRICES: Prices = { fullWork: 240, expand: 50, trip: 3, tend: 2, sketch: 2, foundRequest: 2, revisit: 1, write: 1, reply: 0, rest: 0 }

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
  /** Marks a tend, write, sketch or found request as one to think harder about. */
  deep?: boolean
}

/** Points in hand after waking: what was saved, plus the day's 150, up to the most that may be held. */
export function pointsAtWake(inHand: number): number {
  return Math.min(MAX_POINTS_IN_HAND, Math.max(0, inHand) + DAILY_POINTS)
}

/** Whether a step may be deep: the ones whose step call is a Haiku call that Merge may choose to run on Sonnet. */
function mayBeDeep(step: PricedStep): boolean {
  return step.verb === 'tend' || step.verb === 'write' || step.verb === 'found' || (step.verb === 'tinker' && step.size === 'sketch')
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
      return prices.expand
    case 'found':
      return prices.foundRequest
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
