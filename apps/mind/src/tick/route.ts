import type { Tick } from './context.ts'
import { startStep, thinkKindFor } from './plan.ts'

/** Following its own plan is routine: no need to think when one step ends and another waits. Otherwise a trigger picks the kind of thought. */
export function route(t: Tick): void {
  const { triggers, goals } = t
  const onlyStepDone = triggers.length === 1 && triggers[0]!.kind === 'stepDone'
  t.nextIndex = goals.now ? goals.now.index + 1 : 0
  t.moreSteps = goals.today ? t.nextIndex < goals.today.steps.length : false
  t.thinkKind = null
  if (onlyStepDone && t.moreSteps) {
    startStep(t, t.nextIndex)
  } else if (triggers.length > 0) {
    t.thinkKind = thinkKindFor(triggers)
  } else {
    t.notes.push(t.asleep ? 'asleep: no thinking' : 'no trigger, no call')
  }
}
