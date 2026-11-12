import { z } from 'zod'
import { Timestamp } from './intention.ts'

/** A job id is a plain slug, so it is safe as part of a file name. */
export const JobId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,60}$/, 'lowercase words with dashes')

/**
 * `mind/builds/<id>.json` as the build worker sees it (spec 10.2): which job, what kind, and when it was asked for. Any other
 * field belongs to the handler of that kind (tinker in W4, expand and found in W6), so it is kept as it is.
 */
export const JobRequest = z.looseObject({
  id: JobId,
  kind: z.string().min(1).max(30),
  requestedAt: Timestamp,
})
export type JobRequest = z.infer<typeof JobRequest>

/**
 * `mind/builds/<id>.result.json`: the only thing the worker commits straight to `main` (spec 10.2). The mind reads it and
 * does its own bookkeeping. (`BuildResult` in `mind.ts` is the pet-era builder's report and is only read from old files.)
 */
export const JobResult = z.object({
  id: JobId,
  kind: z.string().min(1).max(30),
  status: z.enum(['done', 'failed']),
  /** Why it failed. */
  reason: z.string().max(300).optional(),
  at: Timestamp,
})
export type JobResult = z.infer<typeof JobResult>
