import { z } from 'zod'
import { Timestamp } from './intention.ts'
import { Material } from './properties.ts'

/**
 * One step of a plan. `verb` is a verb id from the species pack. The target is an object id, a spot kind
 * (`sunbeam`), `visitor`, or a position, never several. A step that makes something names it and the materials.
 */
export const PlanStep = z
  .object({
    verb: z.string().min(1),
    targetId: z.string().min(1).optional(),
    /** `[x, z]` in meters, for wandering to a place that has no object. */
    position: z.tuple([z.number().finite(), z.number().finite()]).optional(),
    /** Materials a making or cooking step uses. Untrusted choice: code checks the forkling has them. */
    materials: z.array(Material).max(4).optional(),
    /** What is being made, in the forkling's words. Untrusted text. */
    makes: z.string().min(1).max(40).optional(),
    /** One sentence in the forkling's voice. */
    reason: z.string().min(1).max(200),
    /** Beliefs (`memory/beliefs.json` ids) this step follows from, so a change of mind can be traced to a changed choice. */
    because: z.array(z.string().regex(/^b\d+$/)).max(3).optional(),
    minutes: z.number().int().min(1).max(240),
  })
  .refine((s) => !(s.targetId !== undefined && s.position !== undefined), { message: 'a step has a targetId or a position, not both' })
export type PlanStep = z.infer<typeof PlanStep>

/** `mind/goals.json`: a long goal, today's plan and the step being played. Written by the mind, never chosen by code. */
export const Goals = z.object({
  long: z
    .object({
      text: z.string().min(1).max(300),
      reason: z.string().min(1).max(200),
      setAt: Timestamp,
      reviewedAt: Timestamp,
    })
    .optional(),
  today: z
    .object({
      /** Local date the plan was made for, `YYYY-MM-DD`. */
      date: z.iso.date(),
      steps: z.array(PlanStep).min(1).max(12),
      reason: z.string().min(1).max(200),
    })
    .optional(),
  now: z
    .object({
      /** Index into `today.steps`. */
      index: z.number().int().nonnegative(),
      startedAt: Timestamp,
      until: Timestamp,
    })
    .optional(),
})
export type Goals = z.infer<typeof Goals>
