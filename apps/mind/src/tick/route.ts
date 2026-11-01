import { canSpend } from '../budget.ts'
import type { Tick } from './context.ts'
import { startStep, thinkKindFor } from './plan.ts'

/** After a call fails or gives nothing usable, the mind is left alone this long, except for a new day and bedtime. */
export const FAILED_COOLDOWN_MS = 30 * 60_000
/** Less than any call costs, only to tell a spent budget from a working one. */
const SMALLEST_CALL_USD = 0.001

/**
 * Following its own plan is routine: no need to think when one step ends and another waits, and that holds just as
 * well when the model cannot be asked. Otherwise a trigger picks the kind of thought.
 */
export function route(t: Tick): void {
  const { triggers, goals, mind, nowMs } = t
  t.nextIndex = goals.now ? goals.now.index + 1 : 0
  t.moreSteps = goals.today ? t.nextIndex < goals.today.steps.length : false
  t.thinkKind = null

  const failedRecently = !!mind.thinkFailedAt && nowMs - Date.parse(mind.thinkFailedAt) < FAILED_COOLDOWN_MS
  const wake = failedRecently ? triggers.filter((x) => x.kind === 'newDay' || x.kind === 'bedtime' || x.kind === 'stepDone') : triggers
  const reasons = wake.filter((x) => x.kind !== 'stepDone')
  const stepDone = wake.length > reasons.length
  const canThink = !!t.deps.dryRun || (!!t.deps.llm && canSpend(t.budget, SMALLEST_CALL_USD))

  if (stepDone && t.moreSteps && (reasons.length === 0 || !canThink)) {
    startStep(t, t.nextIndex)
  } else if (reasons.length > 0) {
    t.thinkKind = thinkKindFor(reasons)
    if (failedRecently) t.notes.push('a call failed a short while ago: waiting before asking again')
  } else {
    t.notes.push(t.asleep ? 'asleep: no thinking' : failedRecently && triggers.length > 0 ? 'a call failed a short while ago: not asking again yet' : 'no trigger, no call')
  }
}
