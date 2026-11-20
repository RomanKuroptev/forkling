import type { Point2 } from '@forkling/sim'

/**
 * Where Merge is drawn on the ground plane, how big (its drawing scale) and the way it faces (radians, 0 along +z), written by the
 * forkling each frame and read by the player (`keepAway.ts`) and the audit harness (`__qa.merge()`).
 */
export const mergeSpot: { position: Point2 | null; scale: number; heading: number } = { position: null, scale: 1.35, heading: 0 }
