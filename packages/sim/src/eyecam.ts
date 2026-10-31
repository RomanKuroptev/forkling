import type { IslandConfig, SpeciesPack } from '@forkling/schema'
import { heightAt } from './island.ts'

export type Vec3 = [number, number, number]

/** Where the eye cam sits and what it looks at, in world meters. The viewer turns this into a 512 px frame. */
export interface EyeShot {
  eye: Vec3
  look: Vec3
}

export interface EyeShotInput {
  pos: { x: number; z: number }
  /** Yaw in radians, 0 facing +z (the body's convention). */
  heading: number
  pack: SpeciesPack
  island: IslandConfig
  /** What it is photographing: a position on the ground and the longest dimension of the thing. */
  target?: { position: Vec3; size: number }
}

/** How far ahead it looks when nothing in particular is the subject. */
const LOOK_AHEAD = 6
/** It never aims higher than this above a tall thing's base, so a tree is framed by its trunk and not its top. */
const MAX_AIM = 1.5

/**
 * The eye is at the species' eye height above the ground under the forkling. It looks at the middle of its subject, or
 * straight ahead along its heading. Pure and deterministic, so the same moment always frames the same picture.
 */
export function eyeShot({ pos, heading, pack, island, target }: EyeShotInput): EyeShot {
  const eye: Vec3 = [pos.x, heightAt(pos.x, pos.z, island) + pack.perception.eyeHeight, pos.z]
  if (target) {
    const [tx, , tz] = target.position
    const aim = Math.min(Math.max(target.size, 0) / 2, MAX_AIM)
    if (Math.hypot(tx - eye[0], tz - eye[2]) > 0.1) return { eye, look: [tx, heightAt(tx, tz, island) + aim, tz] }
  }
  return { eye, look: [eye[0] + Math.sin(heading) * LOOK_AHEAD, eye[1], eye[2] + Math.cos(heading) * LOOK_AHEAD] }
}
