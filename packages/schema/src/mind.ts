import { z } from 'zod'
import { Timestamp } from './intention.ts'

/** Hard monthly ceiling per forkling, in US dollars. */
export const MONTHLY_CAP_USD = 10

/** `mind/state.json`: what the mind has already seen, so it can tell what is new. */
export const MindState = z.object({
  /** Object ids the forkling has met. An id not in here is a novelty. */
  knownObjects: z.array(z.string()).default([]),
  /** Visitor event types it has met. */
  seenEventTypes: z.array(z.string()).default([]),
  /** Local date of the last morning plan. */
  lastPlanDate: z.iso.date().optional(),
  /** When the LLM was last asked, so strong needs don't wake it every tick. */
  lastThinkAt: Timestamp.optional(),
  /** Why the mind chose to stay up late, in its own words. */
  lateNightReason: z.string().max(200).optional(),
  /** Steps it took recently, newest last, for the anti-fixation check. */
  recent: z.array(z.object({ verb: z.string(), targetId: z.string().optional(), at: Timestamp })).max(20).default([]),
  /** Why the validator last turned a plan down, newest last. */
  rejections: z.array(z.object({ at: Timestamp, reasons: z.array(z.string()) })).max(10).default([]),
})
export type MindState = z.infer<typeof MindState>

export const BudgetCall = z.object({
  at: Timestamp,
  kind: z.string().min(1),
  model: z.string().min(1),
  input: z.number().int().nonnegative(),
  cacheRead: z.number().int().nonnegative(),
  cacheWrite: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
  usd: z.number().nonnegative(),
})
export type BudgetCall = z.infer<typeof BudgetCall>

/** `brain/budget.json`: this month's spend. The guard stops all LLM calls once `spentUsd` reaches `capUsd`. */
export const BudgetLedger = z.object({
  /** `YYYY-MM` in the forkling's time zone. */
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'like 2026-11'),
  capUsd: z.number().positive().max(MONTHLY_CAP_USD).default(MONTHLY_CAP_USD),
  spentUsd: z.number().nonnegative().default(0),
  calls: z.array(BudgetCall).default([]),
  /** Totals of earlier months, kept after the call list is reset. */
  history: z.array(z.object({ month: z.string(), spentUsd: z.number().nonnegative(), calls: z.number().int().nonnegative() })).default([]),
})
export type BudgetLedger = z.infer<typeof BudgetLedger>
