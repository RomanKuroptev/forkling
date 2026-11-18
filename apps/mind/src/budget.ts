import { BudgetLedger, type BudgetCall, type Credit } from '@forkling/schema'
import { localDate } from '@forkling/sim'

export type ModelId = 'claude-haiku-5-5' | 'claude-sonnet-5-5'

export interface Usage {
  /** Input tokens that were not served from or written to the cache. */
  input: number
  cacheRead: number
  cacheWrite: number
  output: number
}

/** US dollars per million tokens. Haiku's rates hold for prompts up to 100K tokens; above that they jump 5x. */
const PRICES: Record<ModelId, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
}

/** Every prompt stays under this, so Haiku never reaches its higher price tier. */
export const MAX_PROMPT_TOKENS = 100_000
/** The ledger lists this many latest calls; `spentUsd` always covers all of them. */
const MAX_LOGGED_CALLS = 500

/** The Batch API charges half. */
const BATCH_DISCOUNT = 0.5

export function costUsd(model: ModelId, usage: Usage, opts: { batch?: boolean } = {}): number {
  const p = PRICES[model]
  const full = (usage.input * p.input + usage.cacheRead * p.cacheRead + usage.cacheWrite * p.cacheWrite + usage.output * p.output) / 1e6
  return opts.batch ? full * BATCH_DISCOUNT : full
}

/** About four characters to a token. Only a guard and a dry-run figure, since real usage is recorded after the call. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/** The most a call can cost, assuming none of the input is cached and the output fills `maxOutput`. */
export function estimateCallUsd(model: ModelId, inputTokens: number, maxOutput: number): number {
  return costUsd(model, { input: inputTokens, cacheRead: 0, cacheWrite: 0, output: maxOutput })
}

/** `YYYY-MM` in the forkling's time zone, which is when its month turns over. */
export function monthOf(timezone: string, ms: number): string {
  return localDate(timezone, ms).slice(0, 7)
}

/** Days in the month of a local date (`YYYY-MM-DD`). */
export function daysInMonth(date: string): number {
  const [y, m] = date.split('-').map(Number) as [number, number]
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/**
 * The model cap of a month (spec v4 5.3): `capUsd` plus the credits that arrived in that month. A credit counts for its own month
 * only, so next month starts from `capUsd` again. Every place that reads the cap reads this one: the guard, the pace rule, the fallback
 * to Haiku, the daily points formula and the health file. The check that `capUsd` plus the server stays within $23 reads `capUsd` alone.
 * A credit's month is the first 7 characters of its time (UTC).
 */
export function effectiveCapUsd(ledger: Pick<BudgetLedger, 'capUsd' | 'month'>, credits: readonly Credit[] = [], month: string = ledger.month): number {
  const extra = credits.filter((c) => c.at.slice(0, 7) === month).reduce((n, c) => n + c.usd, 0)
  return Math.round((ledger.capUsd + extra) * 1e8) / 1e8
}

/** What came in this month, in dollars (zero with no credits). */
export const moneyInUsd = (ledger: Pick<BudgetLedger, 'month'>, credits: readonly Credit[] = []): number => effectiveCapUsd({ capUsd: 0, month: ledger.month }, credits)

/**
 * The ledger as the guards read it: the same, with `capUsd` replaced by the effective cap. For reading only, by the places that read the
 * ledger from disk to guard a call; never written back, because the file keeps the real `capUsd`.
 */
export const guardLedger = (ledger: BudgetLedger, credits: readonly Credit[] = []): BudgetLedger => (credits.length === 0 ? ledger : { ...ledger, capUsd: effectiveCapUsd(ledger, credits) })

/** The model cap spread evenly over the month, counting the whole of today. */
export function paceUsd(ledger: BudgetLedger, today: string, credits: readonly Credit[] = []): number {
  return (effectiveCapUsd(ledger, credits) * Number(today.slice(8, 10))) / daysInMonth(today)
}

/** Spend more than this share over the month's pace slows the thought tick and holds tinker and expand (spec 13). */
export const PACE_AHEAD_SHARE = 0.15

export function paceAhead(ledger: BudgetLedger, today: string, credits: readonly Credit[] = []): boolean {
  return ledger.spentUsd > paceUsd(ledger, today, credits) * (1 + PACE_AHEAD_SHARE) + 1e-9
}

/** Creative calls run on Sonnet until spend is this close to the monthly cap, and then on Haiku, so the end of a month is plainer sketches, not a silent Merge. */
export const CREATIVE_FALLBACK_USD = 1.5

/** The model for a creative call (a sketch, a meme, a rework, a reply): Sonnet, or Haiku when the month is nearly spent. */
export function creativeModel(ledger: Pick<BudgetLedger, 'capUsd' | 'spentUsd' | 'month'>, credits: readonly Credit[] = []): ModelId {
  return effectiveCapUsd(ledger, credits) - ledger.spentUsd <= CREATIVE_FALLBACK_USD ? 'claude-haiku-5-5' : 'claude-sonnet-5-5'
}

export function canSpend(ledger: BudgetLedger, estimateUsd: number, credits: readonly Credit[] = []): boolean {
  return ledger.spentUsd + estimateUsd <= effectiveCapUsd(ledger, credits) + 1e-9
}

export function recordCall(ledger: BudgetLedger, call: BudgetCall): BudgetLedger {
  const before = ledger.byKind[call.kind] ?? { calls: 0, input: 0, cacheRead: 0, cacheWrite: 0, output: 0, usd: 0 }
  return {
    ...ledger,
    spentUsd: Math.round((ledger.spentUsd + call.usd) * 1e8) / 1e8,
    calls: [...ledger.calls, call].slice(-MAX_LOGGED_CALLS),
    byKind: {
      ...ledger.byKind,
      [call.kind]: {
        calls: before.calls + 1,
        input: before.input + call.input,
        cacheRead: before.cacheRead + call.cacheRead,
        cacheWrite: before.cacheWrite + call.cacheWrite,
        output: before.output + call.output,
        usd: Math.round((before.usd + call.usd) * 1e8) / 1e8,
      },
    },
  }
}

/**
 * A new month starts from zero. The old month is kept as a one-line total. It never goes back: a ledger already in a
 * later month than the clock says (a time zone or a clock running behind) stays as it is.
 */
export function rollLedger(ledger: BudgetLedger, month: string): BudgetLedger {
  if (month <= ledger.month) return ledger
  const unused = ledger.spentUsd === 0 && ledger.calls.length === 0
  return {
    month,
    serverUsd: ledger.serverUsd,
    capUsd: ledger.capUsd,
    spentUsd: 0,
    calls: [],
    byKind: {},
    history: unused ? ledger.history : [...ledger.history, { month: ledger.month, spentUsd: ledger.spentUsd, calls: ledger.calls.length }],
  }
}

/** A build session is metered (spec-v4 3.3, 5.1): 1 point per $0.001 it really spends, taken as it runs. */
export const SESSION_POINTS_PER_USD = 1000
/** The points a session has taken once it has spent `usd` in all. Rounded on the running total, so the points always agree with the ledger. */
export const sessionPoints = (usd: number): number => Math.round(usd * SESSION_POINTS_PER_USD)
