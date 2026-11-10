import type { Tick } from './context.ts'
import { startStep } from './plan.ts'

/**
 * A step that has run out hands over to the next one, or leaves the body free when none is left. This holds whether or
 * not the model was asked or answered. A step that began this tick is left alone.
 */
export function advance(t: Tick): void {
  const { goals, nowMs } = t
  if (t.started || !goals.now || t.asleep) return
  const over = nowMs >= Date.parse(goals.now.until)
  if (!over) return
  if (t.moreSteps) startStep(t, t.nextIndex)
  else delete goals.now
}
