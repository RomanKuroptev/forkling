/**
 * Pure aiming for the explorer: the visitor's heading counts as the sim does (0 looks along +z, so forward is
 * (sin yaw, cos yaw)), and pitch is up from level.
 */
export type V3 = [number, number, number]

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/** The heading from one ground point to another. */
export const headingTo = (from: { x: number; z: number }, to: { x: number; z: number }): number => wrap(Math.atan2(to.x - from.x, to.z - from.z))

/** The yaw and pitch that look from the eye at a point. */
export function lookAt(eye: V3, target: V3): { yaw: number; pitch: number } {
  const dx = target[0] - eye[0]
  const dy = target[1] - eye[1]
  const dz = target[2] - eye[2]
  return { yaw: wrap(Math.atan2(dx, dz)), pitch: Math.atan2(dy, Math.hypot(dx, dz)) }
}

/** The middle of a box. */
export const centre = (box: { min: V3; max: V3 }): V3 => [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2]

/** Where to stand to see a place's front: `distance` meters out from its door side (+z), at its middle. */
export function frontOf(box: { min: V3; max: V3 }, distance = 6): { x: number; z: number } {
  return { x: (box.min[0] + box.max[0]) / 2, z: box.max[2] + distance }
}

export const degrees = (rad: number) => Math.round((rad * 180) / Math.PI)
export const radians = (deg: number) => (deg * Math.PI) / 180
