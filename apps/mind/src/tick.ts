import { advance } from './tick/advance.ts'
import { applyDecision } from './tick/apply-decision.ts'
import { finishStep } from './tick/apply-step.ts'
import { bedtime } from './tick/bedtime.ts'
import type { TickDeps, TickResult } from './tick/context.ts'
import { createTick } from './tick/create.ts'
import { feel } from './tick/feel.ts'
import { memoryStep } from './tick/memory.ts'
import { noteStep } from './tick/mind-step.ts'
import { route } from './tick/route.ts'
import { logTick } from './ticklog.ts'
import { think } from './tick/think.ts'
import { morningStep, tripStep } from './tick/wander.ts'
import { writeWorld } from './tick/write.ts'

export type { TickDeps, TickResult }

/**
 * One tick of a forkling's mind: replay the body to now, see whether anything is surprising, think only if so, check
 * the answer, and write the new state. Pure with respect to everything but the world directory and the injected model.
 * Each step lives in `tick/` and reads and writes the shared `Tick`; the order here is the order things happen.
 */
export async function runTick(dir: string, deps: TickDeps): Promise<TickResult> {
  const t = createTick(dir, deps)
  finishStep(t)
  route(t)
  await morningStep(t)
  await tripStep(t)
  await noteStep(t)
  await think(t)
  await bedtime(t)
  await memoryStep(t)
  applyDecision(t)
  advance(t)
  feel(t)
  return logTick(t, writeWorld(t))
}
