import { z } from 'zod'

/** What a plan step may name as made of: the vocabulary of `PlanStep.materials`. */
export const Material = z.enum(['wood', 'stone', 'clay', 'flowers', 'fibre', 'shells', 'produce', 'dish'])
export type Material = z.infer<typeof Material>
