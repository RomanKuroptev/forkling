import { applyMoodEvent, wakeMood, type MoodEvent } from '@forkling/sim'
import type { Tick } from './context.ts'

/** How it feels now: waking resets energy and eases mood back, then each event of this tick moves them (spec 3.2). */
export function feel(t: Tick): void {
  let state = { mood: t.mood, energy: t.energy }
  if (!t.asleep && t.forkling.asleep) state = wakeMood(state)
  const counts = new Map<MoodEvent, number>()
  for (const event of t.moodEvents) counts.set(event, (counts.get(event) ?? 0) + 1)
  for (const [event, count] of counts) state = applyMoodEvent(state, event, count)
  t.mood = state.mood
  t.energy = state.energy
}
