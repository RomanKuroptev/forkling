import type { Place } from '@forkling/schema'
import { storeyHeight } from '@forkling/sim'
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
export const floorHeight = (place: Place): number => storeyHeight(place)

/** The top of a floor over its storey's line, and how far it reaches under the line (meters). */
export const FLOOR_TOP = 0.14
export const FLOOR_BELOW = 0.03
/**
 * A part thinner than the floor, set on its storey's line or on board floors under the floor's top (a rug), would lie under the
 * floor's top and not show, or with its top in the floor's plane and fight it: jagged shards (issue 432, a rug at 0.1 m on boards
 * 0.1 m thick). It is drawn lifted so its underside is this far under the floor's top: it lies on the floor, its top clear.
 */
export const FLOOR_SINK = 0.01

/**
 * How far up a part is drawn so it lies on the floor: a part that is not structure, thinner than the floor, whose foot is under the
 * floor's top, is lifted until its foot is `FLOOR_SINK` under that top. Anything else stays where it was put (0).
 */
export function floorLift(part: { category: string; size: readonly number[] }, y: number): number {
  const foot = FLOOR_TOP - FLOOR_SINK
  return floorCovering(part) && y < foot ? foot - y : 0
}

/**
 * A part that covers the floor (a rug): not structure, and thinner than the floor. It is drawn as lit trim, so its colours hold at
 * night instead of an orange rug turning brown in the dark (look.md rule 3).
 */
export const floorCovering = (part: { category: string; size: readonly number[] }): boolean => part.category !== 'structure' && part.size[1]! < FLOOR_TOP

/** How far in from the footprint's edge a floor stops, on every side (1 cm short of the line where the walls' corner pieces end). */
export const FLOOR_INSET = 0.51
