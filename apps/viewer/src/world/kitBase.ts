import type { Place } from '@forkling/schema'
import type { Mat4 } from './matrix.ts'

/** The plain shapes every part is made of, and one drawn instance of one of them. Shared by the kit and exhibit geometry. */
export const SHAPES = ['box', 'sphere', 'cylinder', 'cone'] as const
export type Shape = (typeof SHAPES)[number]

export interface Instance {
  shape: Shape
  matrix: Mat4
  /** A hex colour, already looked up in the palette. */
  color: string
}

/** How tall one floor of a place is: its tallest room (the 12 meter limit of 5.2 is floors times this). */
export const floorHeight = (place: Place): number => Math.max(2.4, ...place.rooms.map((r) => r.size[2]))
