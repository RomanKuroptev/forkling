import { advance } from './tick/advance.ts'
import { applyDecision } from './tick/apply-decision.ts'
import { finishStep } from './tick/apply-step.ts'
import { artStep } from './tick/art.ts'
import { bedtime } from './tick/bedtime.ts'
import { codeStep } from './tick/code.ts'
import type { TickDeps, TickResult } from './tick/context.ts'
import { createTick } from './tick/create.ts'
import { feel } from './tick/feel.ts'
import { memoryStep } from './tick/memory.ts'
import { photoStep } from './tick/photos.ts'
import { readStep } from './tick/reading.ts'
import { route } from './tick/route.ts'
import { settleBuild } from './tick/settle-build.ts'
import { think } from './tick/think.ts'
import { writeWorld } from './tick/write.ts'

export type { TickDeps, TickResult }

/**
 * One tick of a forkling's mind: replay the body to now, see whether anything is surprising, think only if so, check
 * the answer, and write the new state. Pure with respect to everything but the world directory and the injected model.
 * Each step lives in `tick/` and reads and writes the shared `Tick`; the order here is the order things happen.
 */
export async function runTick(dir: string, deps: TickDeps): Promise<TickResult> {
  const t = createTick(dir, deps)
  settleBuild(t)
  finishStep(t)
  route(t)
  await readStep(t)
  await artStep(t)
  await codeStep(t)
  photoStep(t)
  await think(t)
  await bedtime(t)
  await memoryStep(t)
  applyDecision(t)
  advance(t)
  feel(t)
  return writeWorld(t)
}
