import { z } from 'zod'
import { Material, PlanStep } from '@forkling/schema'

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
  /** What a making, planting or cooking step uses, up to four; null otherwise. */
  materials: z.array(z.string()).nullable(),
  /** A few words for what the step makes; null otherwise. */
  makes: z.string().nullable(),
  /** What a read or study step is about, in a few words; null otherwise. */
  topic: z.string().nullable(),
  /** Ids of beliefs this step follows from (from the beliefs list), up to three; null if none. */
  because: z.array(z.string()).nullable(),
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
  design: z.object({ name: z.string(), purpose: z.string() }).nullish(),
})
export type Decision = z.infer<typeof Decision>

/** The island is about 100 m across around the origin. */
const MAX_COORD = 45

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Cuts text to `max` characters, ending in an ellipsis when it had to. */
export const clampText = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`)

/** A model step as a plan step, with lengths and ranges forced into what the schema allows. Null if it has no content. */
export function planStepFrom(step: LlmStep, beliefIds: ReadonlySet<string> = new Set()): PlanStep | null {
  const reason = step.reason.trim()
  const verb = step.verb.trim()
  if (!verb || !reason) return null
  const target = step.target?.trim()
  const materials = (step.materials ?? []).flatMap((m) => {
    const parsed = Material.safeParse(m.trim().toLowerCase())
    return parsed.success ? [parsed.data] : []
  })
  const makes = step.makes?.trim()
  const topic = step.topic?.trim()
  // Only beliefs it really holds count; a made-up id is dropped, not trusted.
  const because = [...new Set((step.because ?? []).map((b) => b.trim()))].filter((b) => beliefIds.has(b)).slice(0, 3)
  const place = step.x !== null && step.z !== null && Number.isFinite(step.x) && Number.isFinite(step.z)
  const parsed = PlanStep.safeParse({
    verb,
    ...(target ? { targetId: target } : {}),
    ...(place && !target ? { position: [clamp(step.x!, -MAX_COORD, MAX_COORD), clamp(step.z!, -MAX_COORD, MAX_COORD)] } : {}),
    ...(materials.length > 0 ? { materials: materials.slice(0, 4) } : {}),
    ...(makes ? { makes: clampText(makes, 40) } : {}),
    reason: clampText(reason, 200),
    ...(topic ? { topic: clampText(topic, 80) } : {}),
    ...(because.length > 0 ? { because } : {}),
    minutes: clamp(Math.round(Number.isFinite(step.minutes) ? step.minutes : 10), 1, 240),
  })
  return parsed.success ? parsed.data : null
}
