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
  /** By day it is drawn in this colour instead, giving off some of it (the lining of a room: `dayInteriorWall`); at night in `color`. */
  dayColor?: string
  /** Tinted, see-through glass: drawn apart from the rest, with some opacity (only boxes). */
  glass?: boolean
  /** The kit part it is a primitive of, as placed (`<room>/<index>`): the audit's check for surfaces that fight leaves one part's own primitives to its maker. */
  group?: string
}

/** How tall one floor of a place is: its tallest room (the 12 meter limit of 5.2 is floors times this). */
export const floorHeight = (place: Place): number => Math.max(2.4, ...place.rooms.map((r) => r.size[2]))

/** The top of a floor over its storey's line, and how far it reaches under the line (meters). */
export const FLOOR_TOP = 0.14
export const FLOOR_BELOW = 0.03
/** How far in from the footprint's edge a floor stops, on every side (1 cm short of the line where the walls' corner pieces end). */
export const FLOOR_INSET = 0.51
