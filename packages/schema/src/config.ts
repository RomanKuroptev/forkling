import { z } from 'zod'

/**
 * `mind/config.json` (spec 12.3): the switches that turn a variety nudge from measured into enforced. Only Roman changes it, and a
 * file that is missing or says nothing leaves every switch off. A switch the engine does not know, or a limit that makes no sense,
 * is an error, so that a typo is never read as "off" without anyone noticing.
 */
export const MindConfig = z
  .strictObject({
    variety: z
      .strictObject({
        /** No more than `limit` write steps on one subject in `days` days; a refused step is told why. Subjects are clusters of pages, not names. */
        sameTopicWrites: z
          .strictObject({ on: z.boolean().default(false), limit: z.number().int().min(1).max(10).default(3), days: z.number().int().min(1).max(30).default(7) })
          .prefault({}),
        /** No tinker on the same work more than `limit` times in a row. */
        sameWorkTinker: z.strictObject({ on: z.boolean().default(false), limit: z.number().int().min(1).max(10).default(2) }).prefault({}),
      })
      .prefault({}),
  })
  .prefault({})
export type MindConfig = z.infer<typeof MindConfig>
