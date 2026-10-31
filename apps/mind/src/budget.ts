import { BudgetLedger, type BudgetCall } from '@forkling/schema'
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

export function costUsd(model: ModelId, usage: Usage): number {
  const p = PRICES[model]
  return (usage.input * p.input + usage.cacheRead * p.cacheRead + usage.cacheWrite * p.cacheWrite + usage.output * p.output) / 1e6
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

export function canSpend(ledger: BudgetLedger, estimateUsd: number): boolean {
  return ledger.spentUsd + estimateUsd <= ledger.capUsd + 1e-9
}

export function recordCall(ledger: BudgetLedger, call: BudgetCall): BudgetLedger {
  return {
    ...ledger,
    spentUsd: Math.round((ledger.spentUsd + call.usd) * 1e8) / 1e8,
    calls: [...ledger.calls, call].slice(-MAX_LOGGED_CALLS),
  }
}

/** A new month starts from zero. The old month is kept as a one-line total. */
export function rollLedger(ledger: BudgetLedger, month: string): BudgetLedger {
  if (ledger.month === month) return ledger
  return {
    month,
    capUsd: ledger.capUsd,
    spentUsd: 0,
    calls: [],
    history: [...ledger.history, { month: ledger.month, spentUsd: ledger.spentUsd, calls: ledger.calls.length }],
  }
}
