import type { NeedId, SpeciesAction, SpeciesPack } from '@forkling/schema'

/** Current need values, 0 (empty) to 100 (satisfied). Only the needs the species declares are present. */
export type Needs = Partial<Record<NeedId, number>>

const clamp = (v: number) => Math.min(100, Math.max(0, v))

export function initialNeeds(pack: SpeciesPack): Needs {
  const needs: Needs = {}
  for (const [id, def] of Object.entries(pack.needs)) needs[id as NeedId] = def.initial
  return needs
}

/** In bed needs fall at this share of their speed, so a night does not empty a body that cannot eat in its sleep. */
export const ASLEEP_DECAY = 0.25

/** Time only ever lowers needs. `factor` slows it, as sleep does. */
export function decayNeeds(needs: Needs, pack: SpeciesPack, dtSec: number, factor = 1): Needs {
  const next: Needs = {}
  for (const [id, value] of Object.entries(needs)) {
    const rate = pack.needs[id as NeedId]?.decayPerHour ?? 0
    next[id as NeedId] = clamp(value - (rate * factor * dtSec) / 3600)
  }
  return next
}

/**
 * Apply `fraction` (0 to 1) of an action's `satisfies`. This is the only way a need rises, which is
 * what makes rules like "a need rises only through an action that satisfies it" hold.
 */
export function applyAction(needs: Needs, action: SpeciesAction, fraction: number): Needs {
  const next: Needs = { ...needs }
  for (const [id, amount] of Object.entries(action.satisfies)) {
    const current = next[id as NeedId]
    if (current !== undefined) next[id as NeedId] = clamp(current + amount * fraction)
  }
  return next
}
