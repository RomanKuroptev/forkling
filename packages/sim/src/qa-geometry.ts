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

/**
 * Whether the straight line from `a` to `b` passes through a box (the slab test). A box that only touches the line at `b` itself
 * (within `endGap` meters of it) does not count, so a board does not hide itself. Used to tell whether something stands between an
 * eye and what it looks at.
 */
export function segmentHitsBox(a: Vec3, b: Vec3, box: Box, endGap = 0.02): boolean {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  if (length === 0) return false
  let t0 = 0
  let t1 = 1 - endGap / length
  for (let k = 0; k < 3; k++) {
    const d = b[k]! - a[k]!
    if (Math.abs(d) < 1e-12) {
      if (a[k]! < box.min[k]! || a[k]! > box.max[k]!) return false
      continue
    }
    let ta = (box.min[k]! - a[k]!) / d
    let tb = (box.max[k]! - a[k]!) / d
    if (ta > tb) [ta, tb] = [tb, ta]
    t0 = Math.max(t0, ta)
    t1 = Math.min(t1, tb)
    if (t0 > t1) return false
  }
  return true
}

/**
 * How much of a sign board is hidden from a camera straight in front of it, at eye height, `distance` meters out (+z is the board's
 * front): the share of a 5 by 3 grid of points on the board whose line to the eye passes through one of `blockers`.
 */
export function boardHiddenShare(board: Box, groundY: number, blockers: readonly Box[], distance = 6, eyeHeight = 1.6): number {
  const cx = (board.min[0] + board.max[0]) / 2
  const z = board.max[2]
  const eye: Vec3 = [cx, groundY + eyeHeight, z + distance]
  let hidden = 0
  let total = 0
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 3; j++) {
      const x = board.min[0] + ((board.max[0] - board.min[0]) * (i + 0.5)) / 5
      const y = board.min[1] + ((board.max[1] - board.min[1]) * (j + 0.5)) / 3
      total++
      if (blockers.some((b) => segmentHitsBox(eye, [x, y, z], b))) hidden++
    }
  }
  return hidden / total
}
