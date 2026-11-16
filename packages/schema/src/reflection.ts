import { z } from 'zod'
import { BeliefOp } from './memory.ts'

/**
 * One edit to the wants list, in the flat shape a structured answer needs (plain strings, nulls and arrays). `op` says which of
 * the other fields mean anything: an add has `kind`, `text` and `why`, a drop has `id`, a reorder has `ids`. Code turns it into
 * a typed edit and turns down one with a missing part (`wantEditsFrom` in the sim).
 */
export const ReflectionWantEdit = z.object({
  op: z.enum(['add', 'drop', 'reorder']),
  kind: z.enum(['question', 'obsession', 'project']).nullable(),
  text: z.string().nullable(),
  why: z.string().nullable(),
  id: z.string().nullable(),
  ids: z.array(z.string()).nullable(),
})
export type ReflectionWantEdit = z.infer<typeof ReflectionWantEdit>

/**
 * What a reflection returns (spec 9.3). The limits (3 questions, 5 insights, 4 want edits, text lengths) are applied in code, not
 * in the schema, because a structured answer should not fail for being a word too long. Nothing here lets Merge set its own
 * importance, pick the next reflection's time or touch a file: it only says what it thinks.
 */
export const ReflectionAnswer = z.object({
  questions: z.array(z.string()),
  /** Each cites the stream ids it rests on; one that cites nothing real is dropped. */
  insights: z.array(z.object({ text: z.string(), cites: z.array(z.string()) })),
  beliefOps: z.array(BeliefOp),
  wants: z.array(ReflectionWantEdit),
  /** A reason, if the plan for today no longer fits what Merge now wants; null otherwise. */
  planNoLongerFits: z.string().nullable(),
  /** Merge's own page (spec 9.7): the whole new `self/page.md`, up to 300 words of plain text, or null to leave it as it is. Code keeps it only if it fits the limits and the day's one change is unused. */
  page: z.string().nullable(),
})
export type ReflectionAnswer = z.infer<typeof ReflectionAnswer>

/**
 * What the sleep rewrite returns (spec 9.4), at sleep time on the Batch API or, if it is late, as a normal call. Plain strings,
 * nulls and arrays, like the reflection: the limits (250 words, 12 slots, 12 wants, at most half of the wants changed) are applied
 * in code. `wants` is the whole list as Merge now wants it: a kept want keeps its id, a new one has a null id.
 */
export const SleepRewriteAnswer = z.object({
  diary: z.object({
    title: z.string(),
    paragraphs: z.array(z.object({ text: z.string(), refs: z.array(z.string()) })),
  }),
  slots: z.array(z.object({ title: z.string(), text: z.string() })),
  beliefOps: z.array(BeliefOp),
  wants: z.array(z.object({ id: z.string().nullable(), kind: z.enum(['question', 'obsession', 'project']), text: z.string(), why: z.string() })),
  /** Merge's own page (spec 9.7): the whole new `self/page.md`, up to 300 words of plain text, or null to leave it as it is. Code keeps it only if it fits the limits and the day's one change is unused. */
  page: z.string().nullable(),
})
export type SleepRewriteAnswer = z.infer<typeof SleepRewriteAnswer>

/**
 * What the weekly review returns (spec 9.5), on Sunday at 20:00. Plain strings, nulls and arrays like the other answers; the
 * limits (300 words, 8 traits, 30% of the lines, 2 renames) are applied in code. `about` is the whole new `self/about.md`, or null
 * to leave it; `aboutChanges` is the reason for each change, kept beside the copy in `self/history/`.
 */
export const LongGoalReview = z.object({ action: z.enum(['continue', 'finish', 'drop', 'change']), text: z.string().nullable(), reason: z.string() })
export type LongGoalReview = z.infer<typeof LongGoalReview>

export const WeeklyReview = z.object({
  about: z.string().nullable(),
  aboutChanges: z.array(z.object({ what: z.string(), why: z.string() })),
  longGoal: LongGoalReview,
  renames: z.array(z.object({ kind: z.enum(['place', 'work']), id: z.string(), name: z.string(), reason: z.string() })),
  /** One optional request to Roman, up to 120 words (spec 9.5), or null. Nothing changes because of it. */
  request: z.string().nullable(),
})
export type WeeklyReview = z.infer<typeof WeeklyReview>
