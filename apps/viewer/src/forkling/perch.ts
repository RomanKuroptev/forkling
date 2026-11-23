import type { Spot } from '@forkling/sim'

/** How near a seat (meters) the body starts to climb onto it; it is fully up when it is there. */
export const PERCH_REACH = 0.25

const smooth = (t: number) => t * t * (3 - 2 * t)

/**
 * How high the body is drawn above the floor for a seat it is on (issue 461): the seat's height at the seat, easing to nothing
 * `PERCH_REACH` away. It counts only for a seat of the spot the body is going to or is at (`targetId`), and, while it walks, for
 * any seat it is stepping off, so it climbs down as it leaves. It follows the position, so every visitor sees the same height.
 */
export function perchLift(spots: Record<string, readonly Spot[]>, body: { targetId?: string; moving: boolean }, at: { x: number; z: number }): number {
  const seats = body.moving ? Object.values(spots).flat() : (body.targetId ? (spots[body.targetId] ?? []) : [])
  let lift = 0
  for (const s of seats) {
    if (s.perch === undefined) continue
    const d = Math.hypot(at.x - s.x, at.z - s.z)
    if (d < PERCH_REACH) lift = Math.max(lift, s.perch * smooth(1 - d / PERCH_REACH))
  }
  return lift
}
