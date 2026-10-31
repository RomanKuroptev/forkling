import type { Forkling, Goals, MindState, NeedId, VisitorEvent, WorldObject } from '@forkling/schema'
import { localDate, sleepWindow } from './sleep.ts'

export type TriggerKind = 'novelty' | 'blocked' | 'need' | 'stepDone' | 'newDay' | 'weekly'

/** A reason to wake the LLM. Anything the sim can tell on its own stays with the utility AI. */
export interface Trigger {
  kind: TriggerKind
  /** 0 to 1: how pressing it is. Triggers come back highest first. */
  score: number
  /** One line of plain facts for the prompt. Built only from ids and numbers, never from visitor text. */
  detail: string
}

export interface SurpriseInput {
  forkling: Forkling
  goals: Goals
  mindState: MindState
  objects: readonly WorldObject[]
  /** Visitor events waiting in the inbox. */
  events: readonly VisitorEvent[]
  nowMs: number
  asleep: boolean
  /** Ids and kinds the world can currently offer as a target (see `collectSpots`). */
  spotKinds: ReadonlySet<string>
}

/** A need below this many points is strong enough to think about. */
export const STRONG_NEED = 15
const WEEK_MS = 7 * 24 * 3_600_000

/**
 * What, if anything, is surprising right now: new things, a blocked step, a strong need, a step that ran out, a new
 * day, a long goal due for review. Pure and deterministic. Empty means no LLM call. Never wakes the mind in bed.
 */
export function scoreSurprise(input: SurpriseInput): Trigger[] {
  const { forkling, goals, mindState, objects, events, nowMs, asleep, spotKinds } = input
  if (asleep) return []
  const found: Trigger[] = []

  const knownObjects = new Set(mindState.knownObjects)
  const newObjects = objects.filter((o) => !knownObjects.has(o.id)).map((o) => o.id)
  const seen = new Set(mindState.seenEventTypes)
  const newEvents = [...new Set(events.map((e) => e.type))].filter((t) => !seen.has(t))
  if (newObjects.length > 0 || newEvents.length > 0) {
    const parts = [
      ...(newObjects.length > 0 ? [`new objects: ${newObjects.join(', ')}`] : []),
      ...(newEvents.length > 0 ? [`new kinds of visitor event: ${newEvents.join(', ')}`] : []),
    ]
    found.push({ kind: 'novelty', score: 0.7, detail: parts.join('; ') })
  }

  const step = goals.now ? goals.today?.steps[goals.now.index] : undefined
  if (step?.targetId && step.targetId !== 'visitor' && !spotKinds.has(step.targetId)) {
    found.push({ kind: 'blocked', score: 0.9, detail: `step "${step.verb}" targets "${step.targetId}", which is not in the world` })
  }

  let weakest: { id: string; value: number } | null = null
  for (const [id, value] of Object.entries(forkling.needs) as [NeedId, number][]) {
    if (value < STRONG_NEED && (!weakest || value < weakest.value)) weakest = { id, value }
  }
  if (weakest) {
    found.push({ kind: 'need', score: 0.5 + (STRONG_NEED - weakest.value) / (2 * STRONG_NEED), detail: `${weakest.id} is at ${Math.round(weakest.value)} of 100` })
  }

  if (goals.now && nowMs >= Date.parse(goals.now.until)) {
    found.push({ kind: 'stepDone', score: 0.4, detail: `step ${goals.now.index + 1} of today's plan has run its time` })
  }

  const today = localDate(forkling.timezone, nowMs)
  // A new day starts when the forkling wakes, not at midnight, so a late night doesn't get a morning plan at 00:00.
  const awakeToday = sleepWindow(today, forkling.seed, forkling.timezone).wakeMs <= nowMs
  if (mindState.lastPlanDate !== today && awakeToday) {
    found.push({ kind: 'newDay', score: 1, detail: `it is ${today} and no plan has been made for it` })
  }

  if (goals.long && nowMs - Date.parse(goals.long.reviewedAt) >= WEEK_MS) {
    found.push({ kind: 'weekly', score: 0.6, detail: `the long goal was last reviewed ${goals.long.reviewedAt.slice(0, 10)}` })
  }

  return found.sort((a, b) => b.score - a.score)
}
