import { z } from 'zod'

/**
 * What a forkling is doing and why. `type` is an action id from its species pack (the engine
 * never hardcodes the list). The body plays it back from `(startedAt, seed)`.
 */
export const Intention = z.object({
  type: z.string().min(1),
  /** A spot kind (`sunbeam`), `visitor`, or an object id once objects exist (M5). */
  targetId: z.string().min(1).optional(),
  /** Seconds on the simulation clock. */
  startedAt: z.number(),
  seed: z.number().int().nonnegative(),
  /** One sentence in the forkling's voice. */
  reason: z.string().min(1).max(200),
})
export type Intention = z.infer<typeof Intention>
