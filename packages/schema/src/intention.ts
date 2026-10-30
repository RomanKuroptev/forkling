import { z } from 'zod'

/** An ISO 8601 timestamp, e.g. `2026-10-30T12:00:00Z`. Used in repo files so diffs stay readable. */
export const Timestamp = z.iso.datetime({ offset: true })

/**
 * What a forkling is doing and why, as stored in `forkling.json`. `type` is an action id from its species pack (the
 * engine never hardcodes the list). The body plays it back deterministically from `(startedAt, seed)`.
 */
export const Intention = z.object({
  type: z.string().min(1),
  /** A spot kind (`sunbeam`), `visitor`, or an object id once objects can be targeted (M5). */
  targetId: z.string().min(1).optional(),
  startedAt: Timestamp,
  seed: z.number().int().nonnegative(),
  /** One sentence in the forkling's voice. */
  reason: z.string().min(1).max(200),
})
export type Intention = z.infer<typeof Intention>
