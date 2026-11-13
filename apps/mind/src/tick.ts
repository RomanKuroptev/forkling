import { thoughtDue } from '@forkling/sim'
import { paceAhead } from './budget.ts'
import { advance } from './tick/advance.ts'
import { applyDecision } from './tick/apply-decision.ts'
import { finishStep } from './tick/apply-step.ts'
import { bedtime } from './tick/bedtime.ts'
import type { TickDeps, TickOutcome, TickResult } from './tick/context.ts'
import { createTick } from './tick/create.ts'
import { feel } from './tick/feel.ts'
import { memoryStep } from './tick/memory.ts'
import { buildNow } from './tick/now.ts'
import { settleJobs } from './tick/jobs.ts'
import { thoughtTick } from './tick/thought.ts'
import { workStep } from './tick/work.ts'
import { installStep } from './tick/install.ts'
import { revisitStep } from './tick/revisit.ts'
import { tendStep } from './tick/tend.ts'
import { noteStep } from './tick/mind-step.ts'
import { route } from './tick/route.ts'
import { logTick } from './ticklog.ts'
import { think } from './tick/think.ts'
import { morningStep, tripStep } from './tick/wander.ts'
import { writeWorld } from './tick/write.ts'

export type { TickDeps, TickOutcome, TickResult }

/**
 * One tick of a forkling's mind: replay the body to now, see whether anything is surprising, think only if so, check
 * the answer, and write the new state. Pure with respect to everything but the world directory and the injected model.
 * Each step lives in `tick/` and reads and writes the shared `Tick`; the order here is the order things happen.
 */
export async function runTick(dir: string, deps: TickDeps): Promise<TickOutcome> {
  const t = createTick(dir, deps)
  settleJobs(t)
  finishStep(t)
  route(t)
  await morningStep(t)
  await tripStep(t)
  await noteStep(t)
  await workStep(t)
  await tendStep(t)
  await revisitStep(t)
  installStep(t)
  // The loop's own thought tick (spec 2.2); the Actions tick has none. It writes only to the stream.
  if (deps.thoughts && thoughtDue({ timezone: t.tz, nowMs: t.nowMs, asleep: t.asleep, paceAhead: paceAhead(t.budget, t.today), thought: t.mind.thought })) await thoughtTick(t)
  await think(t)
  await bedtime(t)
  await memoryStep(t)
  applyDecision(t)
  advance(t)
  feel(t)
  const result = logTick(t, writeWorld(t))
  return { ...result, now: buildNow(t), places: t.places }
}
