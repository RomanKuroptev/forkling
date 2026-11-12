import { z } from 'zod'
import { Timestamp } from './intention.ts'

/** The tick log keeps this many days of `mind/ticks/YYYY-MM-DD.jsonl`. */
export const TICK_KEEP_DAYS = 14

/** The step the body was on at the start or the end of a tick. */
export const TickStep = z.object({
  index: z.number().int().nonnegative(),
  verb: z.string().max(40),
  targetId: z.string().max(60).optional(),
  startedAt: Timestamp,
  until: Timestamp,
})
export type TickStep = z.infer<typeof TickStep>

/** One try at calling a model: what, which, what it cost, and why it did not happen if it did not. */
export const TickCall = z.object({
  kind: z.string().max(30),
  model: z.string().max(40),
  usd: z.number().nonnegative(),
  ok: z.boolean(),
  error: z.string().max(200).optional(),
  /** Why a call that reached the model gave no answer (spec 11.3): the model refused, or the answer ran into its output limit. */
  stop: z.enum(['refusal', 'cut_off']).optional(),
})
export type TickCall = z.infer<typeof TickCall>

/** The body broke off a plan step to look after a need, or the plan lost the draw. Filled in from slice 3. */
export const DriftNote = z.object({ verb: z.string().max(40), need: z.string().max(20), at: Timestamp })
export type DriftNote = z.infer<typeof DriftNote>

/**
 * One line of `mind/ticks/YYYY-MM-DD.jsonl`, written for every tick, including ticks that change nothing. Facts only,
 * written by code: what woke the mind (or why nothing did), what it was asked, what it cost, and where the plan stood.
 */
export const TickLine = z.object({
  at: Timestamp,
  /** The engine ref that ran the tick, so a replay can use the same sim. */
  engine: z.string().max(60),
  asleep: z.boolean(),
  triggers: z.array(z.object({ kind: z.string().max(20), score: z.number() })).max(12),
  /** The kind of thought this tick had, or null when nothing was asked. */
  think: z.enum(['morning', 'decide', 'weekly', 'bedtime']).nullable(),
  calls: z.array(TickCall).max(20),
  notes: z.array(z.string().max(300)).max(30),
  stepBefore: TickStep.nullable(),
  stepAfter: TickStep.nullable(),
  /** `date:hash` of today's plan, which changes when the plan is replaced. Null with no plan. */
  planId: z.string().max(40).nullable(),
  /** Pet-era lines have it; nothing writes it any more. */
  needs: z.record(z.string(), z.number()).default({}),
  mood: z.string().max(30),
  drift: z.array(DriftNote).max(20).default([]),
  /** Web requests this tick made, and how many were refused before the network because the host is not on the allowlist. */
  web: z.object({ requests: z.number().int().nonnegative(), refused: z.number().int().nonnegative() }).default({ requests: 0, refused: 0 }),
  /** World files this tick wrote, not counting the log itself. */
  wrote: z.array(z.string().max(120)).max(60),
  summary: z.string().max(300),
})
export type TickLine = z.infer<typeof TickLine>

const Quota = z.object({ used: z.number().int().nonnegative(), max: z.number().int().positive() })

/**
 * `mind/health.json`: a rolling summary that a person or Claude Code can read in one call to answer "is it stuck?".
 * Rebuilt from the previous health and the latest tick line, so it never needs the history.
 */
export const Health = z.object({
  updatedAt: Timestamp,
  engine: z.string().max(60),
  /** The local date the day counters below belong to. */
  date: z.iso.date(),
  lastTick: z.object({
    at: Timestamp,
    asleep: z.boolean(),
    summary: z.string().max(300),
    think: z.string().nullable(),
    triggers: z.array(z.string()),
    callsFailed: z.number().int().nonnegative(),
  }),
  plan: z.object({
    planId: z.string().nullable(),
    stepsLeft: z.number().int().nonnegative(),
    current: z.object({ index: z.number().int().nonnegative(), verb: z.string(), targetId: z.string().optional(), until: Timestamp, overdueMinutes: z.number().int().nonnegative() }).nullable(),
    /** When the plan last changed, from the tick log. */
    lastReplanAt: Timestamp.nullable(),
    /** Minutes awake with no step in progress, as of the last tick. */
    idleMinutes: z.number().int().nonnegative(),
  }),
  today: z.object({
    ticks: z.number().int().nonnegative(),
    decideCalls: z.number().int().nonnegative(),
    callsByKind: z.record(z.string(), z.number().int().nonnegative()),
    triggersByKind: z.record(z.string(), z.number().int().nonnegative()),
    failures: z.number().int().nonnegative(),
    rejections: z.number().int().nonnegative(),
    /** Calls the model declined (`stop_reason` refusal), and answers cut off at their output limit (spec 11.3). Both are also in `failures`. */
    refusals: z.number().int().nonnegative().default(0),
    cutOff: z.number().int().nonnegative().default(0),
    /** Steps started today, by `verb target`. */
    stepsStarted: z.record(z.string(), z.number().int().nonnegative()),
    /** The longest wait between two awake ticks today, in minutes. Ticks should come every 10. */
    longestGapMinutes: z.number().int().nonnegative(),
  }),
  /** What is left of the limits that still exist. The pet-era quotas (creative, photos, builds, code) are only read from old files. */
  quotas: z.object({ readings: Quota, creative: Quota.optional(), photos: Quota.optional(), builds: Quota.optional(), codeThisWeek: Quota.optional() }),
  /** Points of the daily allowance in hand (spec 9.8), and the most that can be held. */
  allowance: z.object({ points: z.number().nonnegative(), max: z.number().positive() }).default({ points: 0, max: 450 }),
  /** Hosts paused after a 429 or a 403 (spec 6.1), and the host that gave most of this week's reads (spec 12.3, "one host"). */
  web: z.object({ pausedHosts: z.record(z.string(), Timestamp).default({}), topHost: z.object({ host: z.string(), share: z.number() }).nullable().default(null) }).default({ pausedHosts: {}, topHost: null }),
  /** Pet-era health files have it; nothing writes it any more. */
  needsCritical: z.record(z.string(), z.number().int().nonnegative()).default({}),
  mood: z.object({ label: z.string(), minutes: z.number().int().nonnegative() }),
  spend: z.object({ monthUsd: z.number(), capUsd: z.number(), paceUsd: z.number() }),
  openBuild: z.object({ id: z.string(), kind: z.string(), ageHours: z.number().nonnegative() }).nullable(),
  /** What looks wrong, in plain words. Empty means nothing does. */
  warnings: z.array(z.string().max(200)).max(20),
})
export type Health = z.infer<typeof Health>
