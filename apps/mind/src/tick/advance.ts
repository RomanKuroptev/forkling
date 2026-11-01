import type { Tick } from './context.ts'
import { startStep } from './plan.ts'

/**
 * A step that has run out hands over to the next one, or leaves the body free when none is left. This holds whether or
 * not the model was asked or answered. A step whose target is gone, and whose question was answered with "carry on", is
 * skipped the same way. A step that began this tick is left alone.
 */
export function advance(t: Tick): void {
  const { goals, nowMs, nowIso } = t
  if (t.started || !goals.now || t.asleep) return
  const over = nowMs >= Date.parse(goals.now.until)
  const gone = !over && !!t.decision && t.triggers.some((x) => x.kind === 'blocked') && !t.failed
  if (!over && !gone) return
  if (gone) {
    const verb = goals.today?.steps[goals.now.index]?.verb ?? 'the step'
    t.remember.push({ at: nowIso, kind: 'event', text: `Skipped ${verb}: what it needed was gone.`, verb })
    t.parts.push(`skipped ${verb}`)
  }
  if (t.moreSteps) startStep(t, t.nextIndex)
  else delete goals.now
}
