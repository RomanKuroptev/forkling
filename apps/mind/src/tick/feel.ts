import { appraise, moodLabel } from '@forkling/sim'
import type { Tick } from './context.ts'
import { round } from './util.ts'

/** How it feels now, from what happened, its taste and its quirks. */
export function feel(t: Tick): void {
  const { temperament, deps } = t
  if (temperament && deps.pools) {
    const felt = appraise(t.feelings, t.appraisals, temperament, deps.pools)
    // Stored to two places, so the label always matches what the file says.
    t.feelings = { valence: round(felt.valence, 2), arousal: round(felt.arousal, 2) }
    t.mood = moodLabel(t.feelings)
  }
}
