/**
 * Where the sun stands and what its shadow box covers. The sun's shadows are drawn in a box `SUN_SHADOW.half` meters to each side
 * around the point the sun looks at; a room outside that box gets no shadow from its own roof, so the sun lights its floor as if it
 * stood in the open (issue 429: the floor of Grown Place 10, 67 m from the middle of the world, blown out to white). The box follows
 * the visitor, in steps, so the shadows do not crawl as they walk.
 */
export const SUN_SHADOW = {
  /** Half the width of the shadow box (meters). */
  half: 55,
  /** How far the sun stands from the point it looks at (meters). */
  distance: 80,
  /** The point the sun looks at moves in steps this big (meters). */
  step: 8,
} as const

type V3 = [number, number, number]

/** The sun's position and the point it looks at, for a sun in direction `dir` (`sunDirection`) and a visitor at `at` (or none). */
export function sunPose(dir: readonly number[], at: { x: number; z: number } | null): { position: V3; target: V3 } {
  const snap = (v: number) => Math.round(v / SUN_SHADOW.step) * SUN_SHADOW.step
  const tx = at ? snap(at.x) : 0
  const tz = at ? snap(at.z) : 0
  const d = SUN_SHADOW.distance
  return { position: [tx + dir[0]! * d, Math.max(dir[1]!, 0.25) * d, tz + dir[2]! * d], target: [tx, 0, tz] }
}
