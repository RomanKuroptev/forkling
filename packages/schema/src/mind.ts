import { z } from 'zod'
import { Timestamp } from './intention.ts'
import { VerbGroup } from './species.ts'

/** Hard monthly ceiling per forkling, in US dollars. */
export const MONTHLY_CAP_USD = 10

/** One designed object (or coded project) a day, and a request that is never answered is given up on after this long. */
export const MAX_BUILDS_PER_DAY = 1
/** Coded Pages projects a week. */
export const MAX_CODE_PER_WEEK = 2
export const BUILD_EXPIRES_HOURS = 72

export const BuildKind = z.enum(['object', 'code'])
export type BuildKind = z.infer<typeof BuildKind>

/** `mind/builds/<id>.json`: what the mind asked the builder for. Its words are the forkling's own and are length-limited. */
export const BuildRequest = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,60}$/, 'lowercase words with dashes'),
  kind: BuildKind,
  name: z.string().min(1).max(60),
  /** What it wants it for, in its voice. */
  purpose: z.string().min(1).max(300),
  /** For a coded project: what a visitor does and sees. */
  howItPlays: z.string().max(300).optional(),
  goalRef: z.string().max(40).optional(),
  /** A mechanism that runs a physics sequence, not a plain object. */
  contraption: z.boolean().default(false),
  requestedAt: Timestamp,
})
export type BuildRequest = z.infer<typeof BuildRequest>

/** At most this many eye-cam frames a day: each costs a render and a vision call. */
export const MAX_PHOTOS_PER_DAY = 12

/** One frame the eye cam should take: where the eye is and what it looks at, in world meters. Rendered after the tick. */
export const PhotoShot = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,60}$/),
  at: Timestamp,
  eye: z.tuple([z.number(), z.number(), z.number()]),
  look: z.tuple([z.number(), z.number(), z.number()]),
  subjectId: z.string().max(60).optional(),
  /** Asked for with the photograph verb, or something new came into view. */
  why: z.enum(['photograph', 'noticed']),
  goalRef: z.string().max(40).optional(),
  /** Its reason, in its voice. */
  reason: z.string().max(200),
})
export type PhotoShot = z.infer<typeof PhotoShot>

/** `mind/state.json`: what the mind has already seen, so it can tell what is new. */
export const MindState = z.object({
  /** Object ids the forkling has met. An id not in here is a novelty. */
  knownObjects: z.array(z.string()).default([]),
  /** Visitor event types it has met. */
  seenEventTypes: z.array(z.string()).default([]),
  /** Local date of the last morning plan. */
  lastPlanDate: z.iso.date().optional(),
  /** When the step whose effect was last applied began, so a step's effect happens once however many ticks follow it. */
  appliedStepAt: Timestamp.optional(),
  /** When the LLM was last asked, so strong needs don't wake it every tick. */
  lastThinkAt: Timestamp.optional(),
  /** After a plan came back empty or was turned down, no new plan is asked for before this time. */
  replanAfter: Timestamp.optional(),
  /** `startedAt` of the step the mind was last asked about because its target was gone, so each step asks once. */
  blockedStep: Timestamp.optional(),
  /** When a call last failed or gave nothing usable, so the mind is not asked again at every tick. */
  thinkFailedAt: Timestamp.optional(),
  /** Why the mind chose to stay up late, in its own words. */
  lateNightReason: z.string().max(200).optional(),
  /** Points of the daily allowance (spec 9.8) in hand, and the local date they were last topped up for. */
  allowance: z.object({ points: z.number().min(0), day: z.iso.date() }).optional(),
  /** Steps it took recently, newest last, for the anti-fixation check. */
  recent: z.array(z.object({ verb: z.string(), targetId: z.string().optional(), at: Timestamp })).max(20).default([]),
  /**
   * A trip that raised an interest by 15 or more is a spark (spec 2.3): `pending` waits for the next decide call, and at most 2
   * sparks a day wake the mind. `count` is the sparks answered on `date`.
   */
  sparked: z.object({ date: z.iso.date(), count: z.number().int().nonnegative(), pending: z.object({ topic: z.string().max(60), gain: z.number() }).nullable() }).optional(),
  /** Local date interests last faded, so they fade once a day. */
  interestsFadedOn: z.iso.date().optional(),
  /** Local date of the last bedtime reflection, so it happens once a day. */
  lastReflectDate: z.iso.date().optional(),
  /** Local date of the last nightly memory rewrite that was sent, so it is sent once a night. */
  lastMemoryDate: z.iso.date().optional(),
  /** The nightly memory rewrite waiting on the Batch API. */
  memoryBatch: z.object({ id: z.string().min(1), date: z.iso.date() }).nullable().default(null),
  /** Reading sessions so far on a local date, for the daily limit; and whether the morning skim of the feeds is done. */
  readings: z.object({ date: z.iso.date(), count: z.number().int().nonnegative(), skimmed: z.boolean().default(false) }).optional(),
  /**
   * Web trips so far on a local date (spec 9.8): the reads they used (at most 40 a day), the trips, and where each started,
   * so the trip-start rail can drop a wander that starts where one already did today.
   */
  trips: z.object({ date: z.iso.date(), reads: z.number().int().nonnegative(), trips: z.number().int().nonnegative(), starts: z.array(z.string().max(300)).max(60) }).optional(),
  /** Things made so far on a local date, for the daily limit. */
  arts: z.object({ date: z.iso.date(), count: z.number().int().nonnegative() }).optional(),
  /** Eye-cam frames taken so far on a local date, for the daily limit, and the shots waiting to be rendered. */
  photos: z.object({ date: z.iso.date(), count: z.number().int().nonnegative(), queue: z.array(PhotoShot).max(MAX_PHOTOS_PER_DAY) }).optional(),
  /** Builds asked for so far on a local date, for the daily limit. */
  builds: z.object({ date: z.iso.date(), count: z.number().int().nonnegative() }).optional(),
  /** Coded projects asked for so far in an ISO week like `2026-W45`, for the weekly limit. */
  codeWeek: z.object({ week: z.string().regex(/^\d{4}-W\d{2}$/), count: z.number().int().nonnegative() }).optional(),
  /** The object build waiting on the builder: it ends when the object turns up in `objects/`, or when the builder says it failed, or after `BUILD_EXPIRES_HOURS`. */
  openBuild: z.object({ id: z.string().min(1), kind: BuildKind, requestedAt: Timestamp }).nullable().default(null),
  /**
   * The coded project waiting on the builder and then on a person. It is separate so that a pull request waiting to be
   * read does not block object builds, and it does not expire while that pull request is open.
   */
  openCode: z.object({ id: z.string().min(1), kind: BuildKind, requestedAt: Timestamp }).nullable().default(null),
  /** Times the body broke off a plan step to look after a need since the mind last decided, for its next prompt. Newest last. */
  brokenOff: z.array(z.object({ step: z.string().max(40), verb: z.string().max(40), need: z.string().max(20), at: Timestamp })).max(30).default([]),
  /** Web hosts paused after a 429 or a 403, with when each pause ends (spec 6.1). Nothing is fetched from one until then. */
  pausedHosts: z.record(z.string(), Timestamp).default({}),
  /** Why the validator last turned a plan down, newest last.*/
  rejections: z.array(z.object({ at: Timestamp, reasons: z.array(z.string()) })).max(10).default([]),
})
export type MindState = z.infer<typeof MindState>

export const BudgetCall = z.object({
  at: Timestamp,
  kind: z.string().min(1),
  model: z.string().min(1),
  input: z.number().int().nonnegative(),
  cacheRead: z.number().int().nonnegative(),
  cacheWrite: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
  usd: z.number().nonnegative(),
})
export type BudgetCall = z.infer<typeof BudgetCall>

/** `brain/budget.json`: this month's spend. The guard stops all LLM calls once `spentUsd` reaches `capUsd`. */
export const BudgetLedger = z.object({
  /** `YYYY-MM` in the forkling's time zone. */
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'like 2026-11'),
  capUsd: z.number().positive().max(MONTHLY_CAP_USD).default(MONTHLY_CAP_USD),
  spentUsd: z.number().nonnegative().default(0),
  calls: z.array(BudgetCall).default([]),
  /** Totals of earlier months, kept after the call list is reset. */
  history: z.array(z.object({ month: z.string(), spentUsd: z.number().nonnegative(), calls: z.number().int().nonnegative() })).default([]),
})
export type BudgetLedger = z.infer<typeof BudgetLedger>

/** `brain/skills.json`: practice per verb group. Level only rises with use, and sets how good the things it makes are. */
export const Skills = z.partialRecord(VerbGroup, z.object({ xp: z.number().nonnegative(), level: z.number().int().min(0).max(10) }))
export type Skills = z.infer<typeof Skills>

/**
 * `mind/builds/<id>.result.json`: what the builder reports back. The builder writes only this (and the object or project
 * itself, by pull request); the mind reads it and does its own bookkeeping, so the two never write the same files.
 */
export const BuildResult = z.object({
  id: z.string().min(1),
  kind: BuildKind,
  /**
   * `designed`: an object was drawn up and its pull request is on its way. `pr-open`: a project passed its checks and its
   * pull request waits for a person. `failed`: nothing could be built. `closed`: the pull request was closed without
   * merging. `merged`: it was merged.
   */
  status: z.enum(['designed', 'pr-open', 'failed', 'closed', 'merged']),
  /** Why it failed or was closed. */
  reason: z.string().max(300).optional(),
  /** What the builder spent, for the mind to book once. */
  calls: z.array(BudgetCall).default([]),
  at: Timestamp,
})
export type BuildResult = z.infer<typeof BuildResult>
