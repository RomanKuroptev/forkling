import { z } from 'zod'
import { Timestamp } from './intention.ts'
import { BudgetCall } from './mind.ts'

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
  /** Why it failed, or why a finished work is in the scrap bin. */
  reason: z.string().max(300).optional(),
  /** For a work (spec 10.2): which one, its title, whether it is on the shelf or in the scrap bin, and the pull request that carries it. */
  workId: JobId.optional(),
  title: z.string().max(40).optional(),
  workStatus: z.enum(['shelf', 'scrap']).optional(),
  prUrl: z.url().max(300).optional(),
  /** What the worker spent, for the mind to book once. The worker never writes the ledger. */
  calls: z.array(BudgetCall).default([]),
  at: Timestamp,
})
export type JobResult = z.infer<typeof JobResult>

/** A full work the mind asks the worker for (spec 2.4, 10.2): the idea and the reason are Merge's own words. */
export const TinkerJob = JobRequest.extend({
  kind: z.literal('tinker'),
  idea: z.string().min(1).max(120),
  reason: z.string().min(1).max(200),
  /** An earlier work to remix (spec 7.5). */
  remixOf: JobId.nullable().default(null),
})
export type TinkerJob = z.infer<typeof TinkerJob>
