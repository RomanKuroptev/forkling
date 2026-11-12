import { z } from 'zod'

/** A thought line is shown above Merge, so it is cut to this many characters (spec 2.2). */
export const THOUGHT_MAX_CHARS = 140

/** The answer of a thought tick (spec 2.2). It never writes files other than the stream. */
export const ThoughtAnswer = z.object({
  thought: z.string().describe(`One line, up to ${THOUGHT_MAX_CHARS} characters, shown above you: what is on your mind right now.`),
  scores: z
    .array(z.object({ id: z.string().describe('The id of an event listed in the data block.'), importance: z.number().int().min(1).max(10) }))
    .describe('An importance score from 1 to 10 for each new event.'),
  surprise: z.number().int().min(0).max(10).describe('How surprising the current step is, 0 to 10.'),
  action: z.enum(['continue', 'replan', 'notice']).describe('continue; replan, with a reason; or notice, to look at a note.'),
  reason: z.string().nullable().describe('Why, when the action is replan; otherwise null.'),
})
export type ThoughtAnswer = z.infer<typeof ThoughtAnswer>
