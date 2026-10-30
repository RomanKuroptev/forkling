import type { NeedId, SpeciesAction, SpeciesPack } from '@forkling/schema'
import type { Needs } from './needs.ts'
import type { Prng } from './prng.ts'
import { isDusk, isNight } from './time.ts'

export interface ScoreContext {
  /** Distance in meters to the visitor, or null when there is none. */
  visitorDistance: number | null
  /** Hours since midnight, 0 to 24. */
  timeOfDay: number
  /** Kinds of spots the world can currently offer, e.g. `food`, `sunbeam`, `perch`. */
  spotKinds: ReadonlySet<string>
}

export interface ScoredAction {
  action: SpeciesAction
  score: number
}

/** Keeps every eligible action possible, so a forkling is never locked into one behavior. */
const BASELINE = 0.08
/** How strongly an empty need amplifies actions that address it. */
const URGENCY = 2.5
/** Softmax temperature relative to the best score, so variety stays similar however urgent the top need is. */
const TEMPERATURE = 0.35

function eligible(action: SpeciesAction, pack: SpeciesPack, ctx: ScoreContext): boolean {
  const nearby = ctx.visitorDistance !== null && ctx.visitorDistance <= pack.perception.noticeRadius
  for (const req of action.requires) {
    if (req === 'visitorNearby' && !nearby) return false
    if (req === 'night' && !isNight(ctx.timeOfDay)) return false
    if (req === 'day' && isNight(ctx.timeOfDay)) return false
    if (req === 'dusk' && !isDusk(ctx.timeOfDay)) return false
  }
  if (action.target.type === 'visitor' && !nearby) return false
  if (action.target.type === 'spot' && !ctx.spotKinds.has(action.target.kind)) return false
  return true
}

/** Utility of each eligible action: how much it helps the needs that are most empty, times the pack's weight. */
export function scoreActions(needs: Needs, pack: SpeciesPack, ctx: ScoreContext): ScoredAction[] {
  const scored: ScoredAction[] = []
  for (const action of pack.actions) {
    if (!eligible(action, pack, ctx)) continue
    let benefit = 0
    for (const [id, amount] of Object.entries(action.satisfies)) {
      const value = needs[id as NeedId]
      if (value === undefined) continue
      const deficit = (100 - value) / 100
      // Gains can't exceed the room left in the need. Costs hurt more as the need runs low.
      const effective = amount > 0 ? Math.min(amount, 100 - value) : amount
      benefit += (effective / 100) * (1 + URGENCY * deficit)
    }
    const weight = pack.weights[action.id] ?? 1
    scored.push({ action, score: Math.max(0.001, BASELINE + benefit) * weight })
  }
  return scored
}

/** Softmax draw using the seeded PRNG, so choices follow the scores but aren't robotic. */
export function pickAction(scored: ScoredAction[], rng: Prng): SpeciesAction {
  if (scored.length === 0) throw new Error('no eligible actions')
  const best = Math.max(...scored.map((s) => s.score))
  const weights = scored.map((s) => Math.exp((s.score - best) / (TEMPERATURE * best)))
  let roll = rng.next() * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < scored.length; i++) {
    roll -= weights[i]!
    if (roll <= 0) return scored[i]!.action
  }
  return scored[scored.length - 1]!.action
}
