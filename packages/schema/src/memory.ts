import { z } from 'zod'
import { Timestamp } from './intention.ts'

/** Where the forkling's own words about its life are capped, so a file in the repo never grows without bound. */
export const MAX_ACTIVE_BELIEFS = 30
export const MEMORY_SLOTS = 12

export const StreamKind = z.enum(['step', 'made', 'event', 'visitor', 'thought', 'trigger', 'rejected', 'sleep', 'wake', 'reading', 'seen'])
export type StreamKind = z.infer<typeof StreamKind>

/** `YYYY-MM-DD#n`: the local day and the entry's place in it. Reflection cites entries by this id. */
export const StreamId = z.string().regex(/^\d{4}-\d{2}-\d{2}#\d+$/, 'like 2026-11-03#12')

/** One line of `memory/stream/YYYY-MM-DD.jsonl`: something that happened, written by code from sim events. No LLM. */
export const StreamEntry = z.object({
  id: StreamId,
  at: Timestamp,
  kind: StreamKind,
  text: z.string().min(1).max(300),
  verb: z.string().optional(),
  objectId: z.string().optional(),
  goalRef: z.string().optional(),
  /** Beliefs the mind said it was acting on. */
  beliefRefs: z.array(z.string()).optional(),
})
export type StreamEntry = z.infer<typeof StreamEntry>

/** One line of `memory/timeline/YYYY-MM-DD.jsonl`, kept for good: a step it started and why. Feeds the "why?" timeline. */
export const TimelineEntry = z.object({
  at: Timestamp,
  verb: z.string(),
  targetId: z.string().optional(),
  reason: z.string().max(200),
  goalRef: z.string().optional(),
  beliefRefs: z.array(z.string()).optional(),
})
export type TimelineEntry = z.infer<typeof TimelineEntry>

export const BeliefStatus = z.enum(['active', 'revised', 'dropped'])

export const Belief = z.object({
  id: z.string().regex(/^b\d+$/, 'like b3'),
  statement: z.string().min(1).max(200),
  /** 0 to 1. Beliefs are allowed to be wrong, so this moves with evidence. */
  confidence: z.number().min(0).max(1),
  /** Stream entries that support it. */
  evidence: z.array(StreamId).max(12),
  formedAt: Timestamp,
  revisedAt: Timestamp.optional(),
  status: BeliefStatus.default('active'),
  history: z.array(z.object({ at: Timestamp, statement: z.string(), confidence: z.number().min(0).max(1), why: z.string().max(200) })).default([]),
})
export type Belief = z.infer<typeof Belief>

/** `memory/beliefs.json`. */
export const Beliefs = z.array(Belief)
export type Beliefs = z.infer<typeof Beliefs>

export const BeliefOp = z.object({
  op: z.enum(['new', 'strengthen', 'weaken', 'revise', 'drop']),
  /** Which belief, for everything but `new`. */
  beliefId: z.string().nullable(),
  /** The wording, for `new` and `revise`. */
  statement: z.string().nullable(),
  confidence: z.number().nullable(),
  evidence: z.array(z.string()),
  why: z.string(),
})
export type BeliefOp = z.infer<typeof BeliefOp>

/** What the bedtime call returns. Structured-output friendly: plain strings, numbers, nulls and arrays. */
export const Reflection = z.object({
  journal: z.object({
    title: z.string(),
    paragraphs: z.array(z.object({ text: z.string(), refs: z.array(z.string()) })),
  }),
  beliefOps: z.array(BeliefOp),
})
export type Reflection = z.infer<typeof Reflection>

/** What the nightly batch returns: long-term memory in a fixed number of slots, so memories compete for space. */
export const MemorySlots = z.object({
  slots: z.array(z.object({ title: z.string(), text: z.string() })),
})
export type MemorySlots = z.infer<typeof MemorySlots>

/** Where an interest came from: a feed item or a page it read. The first source of a topic is its origin. */
export const InterestSource = z.object({
  /** Like `hn:12345` or `wiki:Moon`. */
  id: z.string().min(1).max(80),
  title: z.string().max(200),
  url: z.string().max(300),
  at: Timestamp,
})
export type InterestSource = z.infer<typeof InterestSource>

export const Topic = z.object({
  /** 0 to 1. Rises when fed, fades daily. */
  weight: z.number().min(0).max(1),
  firstSeen: Timestamp,
  lastFed: Timestamp,
  /** The first is the origin; later ones are the latest few. */
  sources: z.array(InterestSource).max(5).default([]),
})
export type Topic = z.infer<typeof Topic>

/** An interest that spiked: it biases goals and art until it burns out. */
export const Obsession = z.object({
  topic: z.string().min(1).max(60),
  startedAt: Timestamp,
  origin: InterestSource,
})
export type Obsession = z.infer<typeof Obsession>

/** `brain/interests.json`: topics with weights that rise when fed and fade daily, and the obsession phases they cause. */
export const Interests = z.object({
  topics: z.record(z.string(), Topic).default({}),
  current: Obsession.nullable().default(null),
  past: z.array(Obsession.extend({ endedAt: Timestamp })).max(30).default([]),
})
export type Interests = z.infer<typeof Interests>

/** What a reading session returns: a note for its notebook and how it moved its interests. */
export const ReadingNote = z.object({
  note: z.object({ title: z.string(), text: z.string() }),
  interests: z.array(
    z.object({
      topic: z.string(),
      /** -1 to 1: how much this fed (or bored) it. */
      delta: z.number(),
      why: z.string(),
      /** The id of the item or page that caused it, as listed in the data. */
      sourceId: z.string().nullable(),
    }),
  ),
})
export type ReadingNote = z.infer<typeof ReadingNote>
