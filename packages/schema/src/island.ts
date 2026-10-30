import { z } from 'zod'

/** Parameters for the procedurally generated starter island. Lengths in meters. */
export const IslandConfig = z
  .object({
    seed: z.number().int(),
    size: z.number().positive().default(100),
    resolution: z.number().int().min(8).max(512).default(128),
    maxHeight: z.number().positive().default(9),
    waterLevel: z.number().default(0),
  })
  .refine((c) => c.waterLevel < c.maxHeight, { message: 'waterLevel must be below maxHeight' })
export type IslandConfig = z.infer<typeof IslandConfig>
