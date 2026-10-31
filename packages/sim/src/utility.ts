import type { NeedId, SpeciesAction, SpeciesPack } from '@forkling/schema'
import type { Needs } from './needs.ts'
import type { Prng } from './prng.ts'
import { isDusk, isNight } from './time.ts'

export interface ScoreContext {
  /** Distance in meters to the visitor, or null when there is none. */
  visitorDistance: number | null
  /** Hours since midnight, 0 to 24. */
  timeOfDay: number
  /** Whether it is bedtime by the sleep schedule. When absent, night hours stand in for it. */
  asleep?: boolean
  /** Kinds of spots the world can currently offer, e.g. `food`, `sunbeam`, `perch`. */
  spotKinds: ReadonlySet<string>
}

export interface ScoredAction {
  action: SpeciesAction
  score: number
}

/** Keeps every eligible action possible, so a forkling is never locked into one behavior. */
const BASELINE = 0.08
/** A need this close to full (in points) is not worth acting on. A cat that is 85% fed does not go and eat. */
const CONTENT = 20
/** How strongly an empty need amplifies actions that address it. Grows with the square of the deficit, so a small one barely registers. */
const URGENCY = 4
//** How sharply the draw favours high scores. Scores 10x apart are picked about 100x apart, with no floor for hopeless actions. */
const SHARPNESS = 2

function eligible(action: SpeciesAction, pack: SpeciesPack, ctx: ScoreContext): boolean {
  const nearby = ctx.visitorDistance !== null && ctx.visitorDistance <= pack.perception.noticeRadius
  for (const req of action.requires) {
    if (req === 'visitorNearby' && !nearby) return false
    const asleep = ctx.asleep ?? isNight(ctx.timeOfDay)
    if (req === 'night' && !asleep) return false
    if (req === 'day' && asleep) return false
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
    let wanted = 0
    let room = 0
    for (const [id, amount] of Object.entries(action.satisfies)) {
      const value = needs[id as NeedId]
      if (value === undefined) continue
      const deficit = (100 - value) / 100
      // Gains can't exceed the room left below the contented zone. Costs hurt more as the need runs low.
      const effective = amount > 0 ? Math.min(amount, Math.max(0, 100 - CONTENT - value)) : amount
      if (amount > 0) {
        wanted += amount
        room += effective
      }
      benefit += (effective / 100) * (0.5 + URGENCY * deficit * deficit)
    }
    // An action that only raises needs which are already met keeps just its `spontaneous` share of the baseline: a full
    // cat doesn't eat, but still wanders for fun. Actions that raise nothing (idling) keep all of it.
    const usefulness = wanted > 0 ? Math.max(action.spontaneous, Math.min(1, (room / wanted) * 3)) : 1
    const weight = pack.weights[action.id] ?? 1
    scored.push({ action, score: Math.max(0.001, BASELINE * usefulness + benefit) * weight })
  }
  return scored
}

/** Weighted draw using the seeded PRNG, so choices follow the scores but aren't robotic. */
export function pickAction(scored: ScoredAction[], rng: Prng): SpeciesAction {
  if (scored.length === 0) throw new Error('no eligible actions')
  const weights = scored.map((s) => s.score ** SHARPNESS)
  let roll = rng.next() * weights.reduce((a, b) => a + b, 0)
  for (let i = 0; i < scored.length; i++) {
    roll -= weights[i]!
    if (roll <= 0) return scored[i]!.action
  }
  return scored[scored.length - 1]!.action
}
