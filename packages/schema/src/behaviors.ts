import type { AnimationSlot } from './species.ts'

/** The part of a bone a procedural pose may write. Structurally compatible with three's `Bone`. */
export interface PoseBone {
  rotation: { x: number; y: number; z: number }
}

export interface PoseContext {
  /** Bones by name, as authored in the species model. A behavior must tolerate missing bones. */
  bones: Record<string, PoseBone | undefined>
  /** Seconds since the behavior started. */
  t: number
  /** 0 to 1 over the behavior's duration. */
  progress: number
}

export type BehaviorMoment = 'idle' | 'beforeSleep' | 'afterWake' | 'dusk'

/**
 * A signature micro-behavior (cat: groom, knead, zoomies). Code, so it lives in the pack's
 * `behaviors.ts` rather than its JSON. Must be pure: no randomness beyond what the sim passes in.
 */
export interface MicroBehavior {
  id: string
  when: BehaviorMoment
  /** Chance per opportunity, 0 to 1. */
  chance: number
  durationSec: number
  /** Animation slot to play while it runs. */
  slot?: AnimationSlot
  /** Procedural pose applied after the animation mixer, e.g. a tail flick. */
  animate?: (ctx: PoseContext) => void
}
