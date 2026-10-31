import { z } from 'zod'

/** What things on the island are made of or give. Verbs and objects share this vocabulary, so a pack never names an activity. */
export const Material = z.enum(['wood', 'stone', 'clay', 'flowers', 'fibre', 'shells', 'produce', 'dish'])
export type Material = z.infer<typeof Material>

/** What an object is like physically. The sim works out what a verb can do with it from these, not from a list of uses. */
export const ObjectProperties = z.object({
  /** Longest dimension in meters. */
  size: z.number().positive().default(1),
  weightKg: z.number().nonnegative().default(10),
  carryable: z.boolean().default(false),
  diggable: z.boolean().default(false),
  /** Something small can get behind or inside it. */
  canHide: z.boolean().default(false),
  edible: z.boolean().default(false),
  soft: z.boolean().default(false),
  /** A good lookout. */
  high: z.boolean().default(false),
  material: Material.optional(),
  /** Things can be put away in it. */
  storage: z.boolean().default(false),
})
export type ObjectProperties = z.infer<typeof ObjectProperties>

const flag = z.boolean().optional()

/** A verb's target filter: every property named here must match. */
export const PropertyFilter = z
  .object({
    carryable: flag,
    diggable: flag,
    canHide: flag,
    edible: flag,
    soft: flag,
    high: flag,
    storage: flag,
    /** True for objects that give a material (`yields`). */
    yields: flag,
    /** True for plants (`grows`). */
    grows: flag,
    material: Material.optional(),
  })
  .strict()
export type PropertyFilter = z.infer<typeof PropertyFilter>
