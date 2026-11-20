import { addVisits } from '../visits.ts'
import type { Tick } from './context.ts'
import { placeIds } from './plan.ts'

/**
 * The real visits counted since the last tick are added to the day (issue #422). Code only, no call and no trigger: the next plan
 * is shown them as data. Nothing is drained in a dry run, so the counts wait for a real tick.
 */
export function visitStep(t: Tick): void {
  if (!t.deps.visits || t.deps.dryRun) return
  const next = addVisits(t.mind.visits, t.deps.visits.drain(), t.today, placeIds(t))
  if (next) t.mind.visits = next
}
