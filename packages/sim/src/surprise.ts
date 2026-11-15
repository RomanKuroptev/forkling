import type { Forkling, Goals, MindState } from '@forkling/schema'
import { noteTriggerDue } from './notes-find.ts'
import { localDate, sleepWindow } from './sleep.ts'

export type TriggerKind = 'sparked' | 'stepDone' | 'replan' | 'newDay' | 'buildResult' | 'reflected' | 'note'

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
  nowMs: number
  asleep: boolean
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
/** A trip that raises an interest by this much wakes the mind (spec 2.3). */
export const SPARK_GAIN = 15
export const MAX_SPARKS_PER_DAY = 2
/** No new plan is asked for this close to bed: the evening is for winding down, and the sleep rewrite comes at bedtime. */
export const REPLAN_BEFORE_BED_MS = 45 * 60_000

/**
 * What, if anything, is surprising right now: a step that ran out, a new
 * day, bedtime, a long goal due for review. Pure and deterministic. Empty means no LLM call. Never wakes the mind in bed.
 */
export function scoreSurprise(input: SurpriseInput): Trigger[] {
  const { forkling, goals, mindState, nowMs, asleep } = input
  if (asleep) return []
  const found: Trigger[] = []

  // A trip raised an interest by 15 or more (spec 2.3): at most 2 a day.
  const sparked = mindState.sparked
  if (sparked?.pending && (sparked.date !== localDate(forkling.timezone, nowMs) || sparked.count < MAX_SPARKS_PER_DAY)) {
    found.push({ kind: 'sparked', score: 0.7, detail: `a trip raised "${sparked.pending.topic}" by ${Math.round(sparked.pending.gain)}` })
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
  // The build worker finished something (spec 2.3). One trigger however many, until a decide call has seen them.
  const pendingResults = mindState.jobs?.pending ?? []
  if (pendingResults.length > 0) found.push({ kind: 'buildResult', score: 0.65, detail: pendingResults.map((r) => r.text).join(' | ') })
  // Notes were found and no decide call has seen them (spec 2.3): once every 30 minutes. The detail is a count, never a word a visitor wrote.
  const waiting = mindState.notesWaiting ?? []
  if (noteTriggerDue({ foundCount: waiting.length, lastMs: mindState.lastNoteTriggerAt ? Date.parse(mindState.lastNoteTriggerAt) : null, nowMs })) {
    found.push({ kind: 'note', score: 0.6, detail: waiting.length === 1 ? 'a new note was found' : `${waiting.length} new notes were found` })
  }
  // A reflection changed the wants list or said the plan no longer fits (spec 2.3). Each reflection once: a decide call answers it.
  const reflected = mindState.reflect?.pending
  if (reflected) found.push({ kind: 'reflected', score: 0.55, detail: reflected.reason })
  // A thought tick said the plan no longer fits (spec 2.3). It stays until a decide call answers it.
  const asked = mindState.thought?.replanRequest
  if (asked && !found.some((x) => x.kind === 'replan')) {
    found.push({ kind: 'replan', score: 0.5, detail: `a thought said the plan no longer fits: ${asked.reason}` })
  }
  // A new day starts when the forkling wakes, not at midnight, so a late night doesn't get a morning plan at 00:00.
  const awakeToday = sleepWindow(today, forkling.seed, forkling.timezone).wakeMs <= nowMs
  if (mindState.lastPlanDate !== today && awakeToday) {
    found.push({ kind: 'newDay', score: 1, detail: `it is ${today} and no plan has been made for it` })
  }



  return found.sort((a, b) => b.score - a.score)
}
