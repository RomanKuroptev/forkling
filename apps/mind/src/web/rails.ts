import { foldTopic } from '@forkling/sim'

/** What a trip's start is compared by: a URL as it is, any other target by its folded spelling, so "Lighthouses" is "lighthouse". */
export function startKey(target: string): string {
  const t = target.trim()
  return /^https?:\/\//i.test(t) ? t.toLowerCase() : foldTopic(t)
}

/**
 * The trip-start rail (spec 12.2): a wander that starts where a trip already started today, or where an earlier wander of
 * the same plan starts, is removed from the plan and the rest stands. Other verbs and a wander with no target are left alone.
 * `dropped` has the targets that were removed, as written.
 */
export function dropRepeatedStarts<T extends { verb: string; targetId?: string | undefined }>(steps: readonly T[], startedToday: readonly string[]): { steps: T[]; dropped: string[] } {
  const seen = new Set(startedToday)
  const kept: T[] = []
  const dropped: string[] = []
  for (const step of steps) {
    if (step.verb !== 'wander' || !step.targetId?.trim()) {
      kept.push(step)
      continue
    }
    const key = startKey(step.targetId)
    if (seen.has(key)) dropped.push(step.targetId)
    else {
      seen.add(key)
      kept.push(step)
    }
  }
  return { steps: kept, dropped }
}
