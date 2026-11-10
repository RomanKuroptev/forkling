import { scoreSurprise } from '@forkling/sim'
import type { Tick } from './context.ts'
import { landMindStep, leaveMindStep } from './mind-step.ts'

/**
 * Scores what is surprising, then lands a step whose time is up. A step lands once, when its minutes are up, however
 * many ticks follow it. A mind verb is not the body's work, so there is no share of its minutes to count; a verb from a
 * pet-era plan runs as rest and the record says so.
 */
export function finishStep(t: Tick): void {
  const { forkling, goals, mind, nowMs, asleep } = t
  t.triggers = scoreSurprise({ forkling, goals, mindState: mind, objects: t.objects, events: t.events, nowMs, asleep, spotKinds: t.spotKeys })

  const finishing = goals.now ? goals.today?.steps[goals.now.index] : undefined
  if (finishing && goals.now && t.triggers.some((x) => x.kind === 'stepDone') && mind.appliedStepAt !== goals.now.startedAt && !asleep) {
    mind.appliedStepAt = goals.now.startedAt
    landMindStep(t, finishing, goals.now.index)
  }
}

/** A new plan takes over in the middle of a step: nothing came of it, and that happens once. */
export function leaveStep(t: Tick): void {
  const { goals, mind, asleep, nowMs } = t
  const step = goals.now ? goals.today?.steps[goals.now.index] : undefined
  if (!goals.now || !step || asleep || mind.appliedStepAt === goals.now.startedAt) return
  // A step that ran out was dealt with when it did.
  if (nowMs >= Date.parse(goals.now.until)) return
  mind.appliedStepAt = goals.now.startedAt
  leaveMindStep(t, step)
}
