import type { WorldObject } from '@forkling/schema'

/** How close a visitor has to be to set a contraption off, and how close the forkling is when it is tinkering with one. */
export const VISITOR_RANGE = 2.5
export const TINKER_RANGE = 4

/** What a part of a contraption is: it moves, or it is fixed in place. A part nobody mentioned is scenery, so fixed. */
export function bodyOf(object: WorldObject, part: number): { body: 'fixed' | 'dynamic'; massKg: number } {
  const spec = object.contraption?.bodies.find((b) => b.part === part)
  return spec ? { body: spec.body, massKg: spec.massKg } : { body: 'fixed', massKg: 1 }
}

export interface RunInput {
  /** A run is going now. */
  running: boolean
  /** The forkling is tinkering with it, and whether it was a moment ago. */
  tinkering: boolean
  wasTinkering: boolean
  visitorPressed: boolean
  visitorDistance: number
}

/** Whether to set the contraption off now: when the forkling starts tinkering, or a visitor nearby asks. Never over a run in progress. */
export function shouldRun(i: RunInput): boolean {
  if (i.running) return false
  if (i.tinkering && !i.wasTinkering) return true
  return i.visitorPressed && i.visitorDistance <= VISITOR_RANGE
}
