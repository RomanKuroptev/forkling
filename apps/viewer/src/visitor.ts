import type { Point2 } from '@forkling/sim'

/** Where the visitor is on the ground plane, written by the player each frame and read by the forkling. */
export const visitor: { position: Point2 | null } = { position: null }
