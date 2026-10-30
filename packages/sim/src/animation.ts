import type { AnimationSlot } from '@forkling/schema'

/** What to try, in order, when a pack lacks a slot. A slot absent from this table has no fallback. */
const FALLBACKS: Record<AnimationSlot, AnimationSlot[]> = {
  idle: [],
  walk: ['idle'],
  run: ['walk', 'idle'],
  sit: ['idle'],
  sleep: ['sit', 'idle'],
  jump: ['idle'],
  happy: ['idle'],
  eat: ['idle'],
  groom: ['sit', 'idle'],
  stretch: ['idle'],
  knead: ['idle'],
  // No fallback: a species can't climb until a skill adds the clip.
  climb: [],
}

/** The slot to actually play: the requested one if the pack has it, else the first available fallback, else null. */
export function resolveSlot(slot: AnimationSlot, available: ReadonlySet<AnimationSlot>): AnimationSlot | null {
  if (available.has(slot)) return slot
  return FALLBACKS[slot].find((s) => available.has(s)) ?? null
}
