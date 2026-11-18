import { z } from 'zod'
import { Timestamp } from './intention.ts'

/**
 * One piece of money in (spec v4 5.3): a donation or anything else Roman credits to the month it arrived in. Only Roman adds to
 * `brain/credits.json`; Merge and the server never write it, which is why it is a file of its own and not part of `brain/budget.json`
 * (the server rewrites that one every tick).
 */
export const Credit = z.object({
  at: Timestamp,
  usd: z.number().positive(),
  /** Where it came from, in a word: `roman`, `donation`. */
  source: z.string().min(1).max(60),
  note: z.string().max(300).default(''),
})
export type Credit = z.infer<typeof Credit>

/** `brain/credits.json`: starts as `{ "credits": [] }`. The effective model cap of a month is `capUsd` plus the credits of that month. */
export const Credits = z.object({ credits: z.array(Credit).default([]) })
export type Credits = z.infer<typeof Credits>

/** The most points that may be held, as the schema and the allowance both name it (spec v4 5.2). */
export const POINTS_HELD_MAX = 1500
