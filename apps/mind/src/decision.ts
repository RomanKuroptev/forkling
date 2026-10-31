import { z } from 'zod'
import { PlanStep } from '@forkling/schema'

/**
 * What the model returns, for every kind of thinking. Kept to plain strings, numbers and nulls so it fits structured
 * outputs; everything is checked again by the real schemas and the validator before any of it reaches the world.
 */
export const LlmStep = z.object({
  verb: z.string(),
  /** An object id or a spot kind, or null. */
  target: z.string().nullable(),
  /** A place in meters, for wandering verbs; null otherwise. */
  x: z.number().nullable(),
  z: z.number().nullable(),
  reason: z.string(),
  minutes: z.number(),
})
export type LlmStep = z.infer<typeof LlmStep>

export const Decision = z.object({
  /** One or two words for how it feels now. */
  mood: z.string(),
  /** One sentence in its own voice: why it does what it does next. */
  thought: z.string(),
  /** Set or replace the long goal. Null leaves it as it is. */
  longGoal: z.object({ text: z.string(), reason: z.string() }).nullable(),
  dropLongGoal: z.boolean(),
  /** Replace the rest of today's plan; the first step starts now. Null keeps the plan. */
  plan: z.array(LlmStep).nullable(),
  planReason: z.string().nullable(),
  /** A reason to stay up late tonight, or null. */
  stayUpLate: z.string().nullable(),
})
export type Decision = z.infer<typeof Decision>

/** The island is about 100 m across around the origin. */
const MAX_COORD = 45

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Cuts text to `max` characters, ending in an ellipsis when it had to. */
export const clampText = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`)

/** A model step as a plan step, with lengths and ranges forced into what the schema allows. Null if it has no content. */
export function planStepFrom(step: LlmStep): PlanStep | null {
  const reason = step.reason.trim()
  const verb = step.verb.trim()
  if (!verb || !reason) return null
  const target = step.target?.trim()
  const place = step.x !== null && step.z !== null && Number.isFinite(step.x) && Number.isFinite(step.z)
  const parsed = PlanStep.safeParse({
    verb,
    ...(target ? { targetId: target } : {}),
    ...(place && !target ? { position: [clamp(step.x!, -MAX_COORD, MAX_COORD), clamp(step.z!, -MAX_COORD, MAX_COORD)] } : {}),
    reason: clampText(reason, 200),
    minutes: clamp(Math.round(Number.isFinite(step.minutes) ? step.minutes : 10), 1, 240),
  })
  return parsed.success ? parsed.data : null
}
