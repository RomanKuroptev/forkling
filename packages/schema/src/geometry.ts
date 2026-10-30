import { z } from 'zod'

/** A point or vector in meters, `[x, y, z]`, y up. */
export const Vec3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()])
export type Vec3 = z.infer<typeof Vec3>
