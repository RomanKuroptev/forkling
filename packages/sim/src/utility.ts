import type { SpeciesAction, SpeciesPack } from '@forkling/schema'
import type { Feelings } from './mood.ts'
import type { Prng } from './prng.ts'
import { isDusk, isNight } from './time.ts'

export interface ScoreContext {
  /** Distance in meters to the visitor, or null when there is none. */
  visitorDistance: number | null
  /** Hours since midnight, 0 to 24. */
  timeOfDay: number
  /** Whether it is bedtime by the sleep schedule. When absent, night hours stand in for it. */
  asleep?: boolean
  /** Kinds of spots the world can currently offer, e.g. `food`, `sunbeam`, `perch`, and `for:<verb>` for object verbs. */
  spotKinds: ReadonlySet<string>
  /** The verb the mind has asked for. Verbs that change the world are only ever chosen when they are this one. */
  focusAction?: string
  /** How it feels. Missing means calm and neither glad nor sad, which changes nothing. */
  feelings?: Feelings
  /** Whether its paws hold something. Missing means unknown, and verbs that need empty or full paws are not ruled out. */
  holding?: boolean
}

export interface ScoredAction {
  action: SpeciesAction
  score: number
}

/** Keeps every eligible action possible, so a forkling is never locked into one behavior. */
const BASELINE = 0.08
//** How sharply the draw favours high scores. Scores 10x apart are picked about 100x apart, with no floor for hopeless actions. */
const SHARPNESS = 2

/** Calm, for arousal: a body at this is neither wound up nor drowsy. */
const CALM = 0.3
const MOOD_MIN = 0.7
const MOOD_MAX = 1.4

/**
 * How the mood bends the appeal of a verb, from its own fields and no names: a body that is wound up and glad leans to
 * the energetic (it runs), and one that is low and calm to the restful (it restores energy, or sits or
 * sleeps). It never changes a score by more than 40% either way, so mood tilts a choice and does not make it.
 */
function moodWeight(action: SpeciesAction, feelings: Feelings | undefined): number {
  if (!feelings) return 1
  const energetic = action.gait === 'run'
  const restful = action.slot === 'sit' || action.slot === 'sleep'
  const lift = 0.8 * (feelings.arousal - CALM) + 0.3 * feelings.valence
  const weight = energetic && !restful ? 1 + lift : restful && !energetic ? 1 - lift : 1
  return Math.min(MOOD_MAX, Math.max(MOOD_MIN, weight))
}

/** Whether the time of day and the visitor allow an action. */
export function requirementsMet(action: SpeciesAction, pack: SpeciesPack, ctx: Pick<ScoreContext, 'visitorDistance' | 'timeOfDay' | 'asleep'>): boolean {
  const nearby = ctx.visitorDistance !== null && ctx.visitorDistance <= pack.perception.noticeRadius
  for (const req of action.requires) {
    if (req === 'visitorNearby' && !nearby) return false
    const asleep = ctx.asleep ?? isNight(ctx.timeOfDay)
    if (req === 'night' && !asleep) return false
    if (req === 'day' && asleep) return false
    if (req === 'dusk' && !isDusk(ctx.timeOfDay)) return false
  }
  return true
}

function eligible(action: SpeciesAction, pack: SpeciesPack, ctx: Pick<ScoreContext, 'visitorDistance' | 'timeOfDay' | 'asleep' | 'spotKinds' | 'focusAction' | 'holding'>): boolean {
  if (!requirementsMet(action, pack, ctx)) return false
  // In bed hours only what is for the night is on offer: it does not get up to eat or play while the bubble says zzz.
  if (ctx.asleep === true && !action.requires.includes('night')) return false
  // Drift does not carry with empty paws or put down what it is not holding.
  if (ctx.holding !== undefined && ((action.hands === 'empty' && ctx.holding) || (action.hands === 'full' && !ctx.holding))) return false
  const nearby = ctx.visitorDistance !== null && ctx.visitorDistance <= pack.perception.noticeRadius
  // Drift never builds, plants or gathers: a visitor would see work that left nothing behind. The mind plans those.
  if (action.effect !== 'none' && action.id !== ctx.focusAction) return false
  if (action.target.type === 'visitor' && !nearby) return false
  if (action.target.type === 'spot' && !ctx.spotKinds.has(action.target.kind)) return false
  if (action.target.type === 'object' && !ctx.spotKinds.has(`for:${action.id}`)) return false
  return true
}

/** Utility of each eligible action: a small baseline, times the pack's weight and how the mood bends it. */
export function scoreActions(pack: SpeciesPack, ctx: ScoreContext): ScoredAction[] {
  const scored: ScoredAction[] = []
  for (const action of pack.actions) {
    if (!eligible(action, pack, ctx)) continue
    const weight = (pack.weights[action.id] ?? 1) * moodWeight(action, ctx.feelings)
    scored.push({ action, score: Math.max(0.001, BASELINE) * weight })
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
