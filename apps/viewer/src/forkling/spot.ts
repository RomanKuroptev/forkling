import type { Point2 } from '@forkling/sim'

/** Where Merge is drawn on the ground plane and how big (its drawing scale), written by the forkling each frame and read by the player (`keepAway.ts`). */
export const mergeSpot: { position: Point2 | null; scale: number } = { position: null, scale: 1.35 }
