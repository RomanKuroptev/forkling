/**
 * Plain box measures for the audit harness's world checks (docs/spec/audit/spec.md 7.2): numbers in, numbers out. The harness
 * reads the boxes from the viewer; nothing here knows about the viewer, the browser or the files.
 */
export type Vec3 = [number, number, number]

export interface Box {
  min: Vec3
  max: Vec3
}

const overlap1 = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))

/** The ground area (square meters) two boxes share seen from above. */
export const footprintOverlap = (a: Box, b: Box): number => overlap1(a.min[0], a.max[0], b.min[0], b.max[0]) * overlap1(a.min[2], a.max[2], b.min[2], b.max[2])

/** The volume (cubic meters) two boxes share. */
export const volumeOverlap = (a: Box, b: Box): number =>
  overlap1(a.min[0], a.max[0], b.min[0], b.max[0]) * overlap1(a.min[1], a.max[1], b.min[1], b.max[1]) * overlap1(a.min[2], a.max[2], b.min[2], b.max[2])

/** The shortest distance between two boxes; 0 when they touch or overlap. */
export function boxGap(a: Box, b: Box): number {
  const d = [0, 1, 2].map((k) => Math.max(0, a.min[k]! - b.max[k]!, b.min[k]! - a.max[k]!))
  return Math.hypot(d[0]!, d[1]!, d[2]!)
}

/**
 * Whether a point is inside the view of a camera at `eye`, turned `yaw` (0 looks along +z, as the sim counts headings) and
 * `pitch` up, with a vertical field of view of `fovYDeg` degrees and the picture's width over height.
 */
export function inView(eye: Vec3, yaw: number, pitch: number, fovYDeg: number, aspect: number, point: Vec3): boolean {
  const dx = point[0] - eye[0]
  const dy = point[1] - eye[1]
  const dz = point[2] - eye[2]
  // Into the camera's frame: forward along the heading, right, up.
  const cy = Math.cos(yaw)
  const sy = Math.sin(yaw)
  const fwdFlat = dx * sy + dz * cy
  const right = -(dx * cy - dz * sy)
  const cp = Math.cos(pitch)
  const sp = Math.sin(pitch)
  const forward = fwdFlat * cp + dy * sp
  const up = dy * cp - fwdFlat * sp
  if (forward <= 0) return false
  const tanY = Math.tan(((fovYDeg / 2) * Math.PI) / 180)
  return Math.abs(up / forward) <= tanY && Math.abs(right / forward) <= tanY * aspect
}
