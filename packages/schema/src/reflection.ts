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
})
export type ReflectionAnswer = z.infer<typeof ReflectionAnswer>
