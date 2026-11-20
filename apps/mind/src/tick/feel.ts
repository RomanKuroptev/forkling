import { applyMoodEvent, wakeMood, type MoodEvent } from '@forkling/sim'
import type { Tick } from './context.ts'

/**
 * Waking resets energy and eases mood back (spec 3.2). It runs before the morning plan is made, so the plan, its prompt
 * and the tired limits all see the rested energy and not last night's.
 */
export function wake(t: Tick): void {
  if (t.asleep || !t.forkling.asleep) return
  const state = wakeMood({ mood: t.mood, energy: t.energy })
  t.mood = state.mood
  t.energy = state.energy
}

/** How it feels now: each event of this tick moves mood and energy (spec 3.2). The wake reset was done by `wake`. */
export function feel(t: Tick): void {
  let state = { mood: t.mood, energy: t.energy }
  const counts = new Map<MoodEvent, number>()
  for (const event of t.moodEvents) counts.set(event, (counts.get(event) ?? 0) + 1)
  for (const [event, count] of counts) state = applyMoodEvent(state, event, count)
  t.mood = state.mood
  t.energy = state.energy
}
