import { z } from 'zod'
import { PlanStep } from '@forkling/schema'

/**
 * What the model returns, for every kind of thinking. Kept to plain strings, numbers and nulls so it fits structured
 * outputs; everything is checked again by the real schemas and the validator before any of it reaches the world.
 */
export const LlmStep = z.object({
  /** One of the nine mind verbs, spelled exactly. */
  verb: z.string(),
  /** A topic, a place id, a name, an idea or a note id, by verb; null for rest. */
  target: z.string().nullable(),
  reason: z.string(),
  minutes: z.number(),
  /** The want this step serves (its id from the wants list); null for a care step or when there are none yet. */
  wantId: z.string().nullable(),
  /** True to think harder about a tend, write, sketch or found request: costs 30 points. */
  deep: z.boolean().nullable(),
  /** For a tinker: a whole work or a sketch. Null for every other verb. */
  size: z.enum(['full', 'sketch']).nullable(),
})
export type LlmStep = z.infer<typeof LlmStep>

export const Decision = z.object({
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
  /** Ask for an object to be designed and built for it (once a day at most), or null. */
  design: z.object({ name: z.string(), purpose: z.string(), contraption: z.boolean().nullish() }).nullish(),
})
export type Decision = z.infer<typeof Decision>

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Cuts text to `max` characters, ending in an ellipsis when it had to. */
export const clampText = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`)

/** A model step as a plan step, with lengths and ranges forced into what the schema allows. Null if it has no content. */
export function planStepFrom(step: LlmStep): PlanStep | null {
  const reason = step.reason.trim()
  const verb = step.verb.trim()
  if (!verb || !reason) return null
  const target = step.target?.trim()
  const wantId = step.wantId?.trim()
  const parsed = PlanStep.safeParse({
    verb,
    ...(target ? { targetId: clampText(target, 120) } : {}),
    reason: clampText(reason, 200),
    ...(wantId ? { wantId: clampText(wantId, 40) } : {}),
    ...(step.deep === true ? { deep: true } : {}),
    ...(step.size ? { size: step.size } : {}),
    minutes: clamp(Math.round(Number.isFinite(step.minutes) ? step.minutes : 10), 1, 240),
  })
  return parsed.success ? parsed.data : null
}
