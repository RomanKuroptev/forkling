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
  /** Lights up at night (a window's glass, a lamp): the draw adds a warm glow to it while it is dark. */
  glow?: boolean
  /** Lit trim: an accent band, a title bar or a window frame, which glows a little in its own colour at night (look.md rule 8). */
  trim?: boolean
  /** Part of the inside of a place: under a roof, it gets less of the sky's light (issue 358). */
  inside?: boolean
  /** Mixed this far towards white by day, not at night (the lining of a room with a dark palette trim, `dayLift`). */
  dayLift?: number
  /** Tinted, see-through glass: drawn apart from the rest, with some opacity (only boxes). */
  glass?: boolean
}

/** How tall one floor of a place is: its tallest room (the 12 meter limit of 5.2 is floors times this). */
export const floorHeight = (place: Place): number => Math.max(2.4, ...place.rooms.map((r) => r.size[2]))
