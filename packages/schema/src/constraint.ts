import { z } from 'zod'

/** The constraint a call was offered (spec 12.4, item 4) and what Merge did with it. A refusal says why, and only a refusal does. */
export const WorkConstraint = z
  .object({ text: z.string().min(1).max(200), refused: z.boolean(), reason: z.string().min(1).max(200).nullable() })
  .strict()
  .superRefine((c, ctx) => {
    if (c.refused && !c.reason) ctx.addIssue({ code: 'custom', path: ['reason'], message: 'a refusal says why' })
    if (!c.refused && c.reason) ctx.addIssue({ code: 'custom', path: ['reason'], message: 'only a refusal has a reason' })
  })
export type WorkConstraint = z.infer<typeof WorkConstraint>
