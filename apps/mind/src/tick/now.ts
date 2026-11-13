import type { NowJson } from '@forkling/schema'
import { moodWords, placesRev } from '@forkling/sim'
import type { Tick } from './context.ts'

/** `now.json` as the tick leaves the world: the step in progress, the last thought line and the mood in words. */
export function buildNow(t: Tick): NowJson {
  const now = t.goals.now
  const step = now ? t.goals.today?.steps[now.index] : undefined
  return {
    updatedAt: t.nowIso,
    asleep: t.asleep,
    step: now && step ? { verb: step.verb, target: step.targetId ?? null, reason: step.reason, until: now.until } : null,
    thought: t.mind.thought?.recent.at(-1) ?? null,
    mood: moodWords({ mood: t.mood, energy: t.energy }),
    placesRev: placesRev(t.places),
  }
}
