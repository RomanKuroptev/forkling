import { z } from 'zod'
import { Timestamp } from './intention.ts'

/**
 * What the server gives the site at `GET /now.json` (spec 2.2, 14.3): the step in progress, the last thought line and the
 * mood in words. Made by the loop on every reflex tick and held in memory; it is never committed to the world repo.
 */
export const NowJson = z.object({
  updatedAt: Timestamp,
  asleep: z.boolean(),
  step: z.object({ verb: z.string().max(40), target: z.string().max(120).nullable(), reason: z.string().max(200), until: Timestamp }).nullable(),
  thought: z.string().max(140).nullable(),
  mood: z.string().max(60),
})
export type NowJson = z.infer<typeof NowJson>
