import type { PlanStep } from '@forkling/schema'
import { hourInZone, isAsleepAt, validatePlan, type Trigger } from '@forkling/sim'
import { MAX_ARTIFACTS_PER_DAY } from '../art.ts'
import { codeSlotsLeft } from '../builds.ts'
import { clampText, planStepFrom, type LlmStep } from '../decision.ts'
import { photosLeft } from '../photos.ts'
import { MAX_READINGS_PER_DAY } from '../reading.ts'
import type { ThinkKind } from '../prompts.ts'
import type { Tick } from './context.ts'
import { intentionSeed } from './util.ts'

const MAX_RECENT = 20

export function thinkKindFor(triggers: readonly Trigger[]): ThinkKind | 'bedtime' {
  if (triggers.some((t) => t.kind === 'newDay')) return 'morning'
  if (triggers.some((t) => t.kind === 'bedtime')) return 'bedtime'
  if (triggers.some((t) => t.kind === 'weekly')) return 'weekly'
  return 'decide'
}

/** The plan as plan steps, and whether the body could really carry it out, played out from what it holds now. */
export function checkPlan(t: Tick, plan: LlmStep[]) {
  const steps = plan.map((s) => planStepFrom(s, t.beliefIds))
  const usable = steps.filter((s): s is PlanStep => s !== null)
  const check =
    usable.length !== steps.length
      ? ({ ok: false, reasons: ['a step was missing its verb or its reason'] } as const)
      : validatePlan(usable, {
          pack: t.pack,
          spotKinds: new Set([...t.spotKeys].filter((k) => !t.objectIds.has(k))),
          objects: t.objects,
          startMs: t.nowMs,
          asleepAt: (ms) => isAsleepAt(ms, t.sleepOpts),
          hourAt: (ms) => hourInZone(t.tz, ms),
          recent: t.mind.recent,
          holding: t.holding,
          stored: t.stored,
          position: { x: t.body.pos.x, z: t.body.pos.z },
          skills: t.skills,
          codeLeft: codeSlotsLeft(t.mind, t.today),
          creativeLeft: Math.max(0, MAX_ARTIFACTS_PER_DAY - (t.mind.arts?.date === t.today ? t.mind.arts.count : 0)),
          readingsLeft: Math.max(0, MAX_READINGS_PER_DAY - t.readings.count),
          photosLeft: photosLeft(t.mind, t.today),
          seed: intentionSeed(t.forkling.seed, t.nowMs),
        })
  return { usable, check }
}

/** Begins step `index` of today's plan: a focus window for the body, and an intention that says why. */
export function startStep(t: Tick, index: number, reason?: string): void {
  const step = t.goals.today?.steps[index]
  if (!step) return
  t.goals.now = { index, startedAt: t.nowIso, until: new Date(t.nowMs + step.minutes * 60_000).toISOString() }
  const started = {
    type: step.verb,
    ...(step.targetId ? { targetId: step.targetId } : {}),
    startedAt: t.nowIso,
    seed: intentionSeed(t.forkling.seed, t.nowMs),
    reason: clampText(reason?.trim() || step.reason, 200),
    goalRef: `today:${index}`,
  }
  t.started = started
  t.mind.recent = [...t.mind.recent, { verb: step.verb, ...(step.targetId ? { targetId: step.targetId } : {}), at: t.nowIso }].slice(-MAX_RECENT)
  const goalRef = `today:${index}`
  const heldBeliefs = step.because && step.because.length > 0 ? { beliefRefs: step.because } : {}
  const targetName = step.targetId ? (t.objects.find((o) => o.id === step.targetId)?.name ?? step.targetId) : ''
  t.remember.push({
    at: t.nowIso,
    kind: 'step',
    text: `Started ${step.verb}${targetName ? ` (${targetName})` : ''}: ${started.reason}`,
    verb: step.verb,
    ...(step.targetId && t.objectIds.has(step.targetId) ? { objectId: step.targetId } : {}),
    goalRef,
    ...heldBeliefs,
  })
  t.steps.push({ at: t.nowIso, verb: step.verb, ...(step.targetId ? { targetId: step.targetId } : {}), reason: started.reason, goalRef, ...heldBeliefs })
  t.parts.push(`step ${index + 1}/${t.goals.today!.steps.length}: ${step.verb}`)
}
