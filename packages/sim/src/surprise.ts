import type { Forkling, Goals, MindState, NeedId, VisitorEvent, WorldObject } from '@forkling/schema'
import { localDate, sleepWindow } from './sleep.ts'

export type TriggerKind = 'novelty' | 'blocked' | 'need' | 'stepDone' | 'replan' | 'newDay' | 'weekly' | 'bedtime'

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
  /** The needs the body can raise by itself right now (see `fixableNeeds`). Those are routine and never wake the mind. Missing means none. */
  fixableNeeds?: ReadonlySet<NeedId>
}

function previousDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
}

/** The local date whose evening it is. Before it has woken, the evening it is still up in belongs to yesterday: a late night can run past midnight. */
export function eveningOf(timezone: string, seed: number, nowMs: number): string {
  const today = localDate(timezone, nowMs)
  return nowMs < sleepWindow(today, seed, timezone).wakeMs ? previousDate(today) : today
}

/** A need below this many points is strong enough to think about. */
export const STRONG_NEED = 15
const WEEK_MS = 7 * 24 * 3_600_000
/** No new plan is asked for this close to bed: the evening is for winding down, and the reflection comes next. */
export const REPLAN_BEFORE_BED_MS = 45 * 60_000
/** The day is reflected on this long before bed, which is a few ticks of room even if GitHub's cron runs late. */
export const REFLECT_BEFORE_BED_MS = 30 * 60_000

/**
 * What, if anything, is surprising right now: new things, a blocked step, a strong need, a step that ran out, a new
 * day, bedtime, a long goal due for review. Pure and deterministic. Empty means no LLM call. Never wakes the mind in bed.
 */
export function scoreSurprise(input: SurpriseInput): Trigger[] {
  const { forkling, goals, mindState, objects, events, nowMs, asleep, spotKinds } = input
  const fixable = input.fixableNeeds ?? new Set<NeedId>()
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
  // Asked once per step: a plan that carries on is still the mind's answer, and asking again would only repeat it.
  if (step?.targetId && step.targetId !== 'visitor' && !spotKinds.has(step.targetId) && mindState.blockedStep !== goals.now?.startedAt) {
    found.push({ kind: 'blocked', score: 0.9, detail: `step "${step.verb}" targets "${step.targetId}", which is not in the world` })
  }

  let weakest: { id: string; value: number } | null = null
  for (const [id, value] of Object.entries(forkling.needs) as [NeedId, number][]) {
    if (value < STRONG_NEED && !fixable.has(id) && (!weakest || value < weakest.value)) weakest = { id, value }
  }
  if (weakest) {
    found.push({ kind: 'need', score: 0.5 + (STRONG_NEED - weakest.value) / (2 * STRONG_NEED), detail: `${weakest.id} is at ${Math.round(weakest.value)} of 100` })
  }

  if (goals.now && nowMs >= Date.parse(goals.now.until)) {
    found.push({ kind: 'stepDone', score: 0.4, detail: `step ${goals.now.index + 1} of today's plan has run its time` })
  }

  const today = localDate(forkling.timezone, nowMs)
  const evening = eveningOf(forkling.timezone, forkling.seed, nowMs)
  const { bedMs } = sleepWindow(evening, forkling.seed, forkling.timezone, forkling.lateNight === evening)
  const lastStepDone = !!goals.now && !!goals.today && goals.now.index >= goals.today.steps.length - 1 && nowMs >= Date.parse(goals.now.until)
  // The plan is a day's, so when it has run out or never came the mind writes the next one. Code only asks.
  if (mindState.lastPlanDate === today && (!goals.now || lastStepDone) && nowMs >= Date.parse(mindState.replanAfter ?? '1970-01-01T00:00:00Z')) {
    if (!(nowMs >= bedMs - REPLAN_BEFORE_BED_MS && nowMs < bedMs)) {
      found.push({ kind: 'replan', score: 0.45, detail: goals.now ? 'the last step of the day\'s plan has run its time' : 'there is no step in progress and nothing planned next' })
    }
  }
  // A new day starts when the forkling wakes, not at midnight, so a late night doesn't get a morning plan at 00:00.
  const awakeToday = sleepWindow(today, forkling.seed, forkling.timezone).wakeMs <= nowMs
  if (mindState.lastPlanDate !== today && awakeToday) {
    found.push({ kind: 'newDay', score: 1, detail: `it is ${today} and no plan has been made for it` })
  }

  if (mindState.lastReflectDate !== evening && nowMs >= bedMs - REFLECT_BEFORE_BED_MS && nowMs < bedMs) {
    found.push({ kind: 'bedtime', score: 0.95, detail: `bedtime is near and ${evening} has not been reflected on` })
  }

  if (goals.long && nowMs - Date.parse(goals.long.reviewedAt) >= WEEK_MS) {
    found.push({ kind: 'weekly', score: 0.6, detail: `the long goal was last reviewed ${goals.long.reviewedAt.slice(0, 10)}` })
  }

  return found.sort((a, b) => b.score - a.score)
}
