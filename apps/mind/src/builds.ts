import { BUILD_EXPIRES_HOURS, MAX_BUILDS_PER_DAY, MAX_CODE_PER_WEEK, type BuildKind, type MindState } from '@forkling/schema'
import { uniqueId } from './art.ts'

export type BuildCheck = { ok: true } | { ok: false; reason: string }

/** The ISO week of a local date, like `2026-W45`. The week belongs to the year its Thursday falls in. */
export function weekOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - day)
  const year = d.getUTCFullYear()
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7)
  return `${year}-W${String(week).padStart(2, '0')}`
}

/** How many more coded projects it may ask for in the week of `date`: two a week, and none while a build is waiting. */
export function codeSlotsLeft(state: MindState, date: string): number {
  if (state.openCode) return 0
  return Math.max(0, MAX_CODE_PER_WEEK - (state.codeWeek?.week === weekOf(date) ? state.codeWeek.count : 0))
}

/**
 * Whether the mind may ask for a build now. An object is one a day, a coded project two a week; neither while another
 * build waits, never asleep, never past the budget.
 */
export function checkBuildRequest(input: { state: MindState; today: string; asleep: boolean; canAfford: boolean; kind?: BuildKind }): BuildCheck {
  const { state, today, asleep, canAfford, kind = 'object' } = input
  if (asleep) return { ok: false, reason: 'it is asleep' }
  // An object and a coded project are separate: a project waiting for a person to read it does not stop an object.
  const waiting = kind === 'code' ? state.openCode : state.openBuild
  if (waiting) return { ok: false, reason: `"${waiting.id}" is still waiting to be built` }
  if (kind === 'code') {
    if (codeSlotsLeft(state, today) === 0) return { ok: false, reason: `only two a week of coded projects (${MAX_CODE_PER_WEEK} a week)` }
  } else if ((state.builds?.date === today ? state.builds.count : 0) >= MAX_BUILDS_PER_DAY) {
    return { ok: false, reason: 'only one build a day (one a day)' }
  }
  if (!canAfford) return { ok: false, reason: 'the monthly budget would not cover it' }
  return { ok: true }
}

/**
 * What became of the build it is waiting on: it arrived (what it asked for is in the world: its object in `objects/`, or
 * its artifact in `art/`, whichever the caller passes), it expired, or it is still waiting. The mind never asks GitHub:
 * the world's own files are the answer.
 */
export function settleOpenBuild(
  state: MindState,
  presentIds: ReadonlySet<string>,
  nowMs: number,
): { outcome: 'arrived' | 'expired' | 'waiting' | null; openBuild: MindState['openBuild'] } {
  const open = state.openBuild
  if (!open) return { outcome: null, openBuild: null }
  if (presentIds.has(open.id)) return { outcome: 'arrived', openBuild: null }
  if (nowMs - Date.parse(open.requestedAt) > BUILD_EXPIRES_HOURS * 3_600_000) return { outcome: 'expired', openBuild: null }
  return { outcome: 'waiting', openBuild: open }
}

/**
 * What became of the coded project it is waiting on. Like an object build, it ends when what it asked for is in the world
 * (its artifact in `art/`, which comes with the merged pull request). Unlike one, it does not expire while its pull request
 * waits for a person (`prOpen`): reading it can take days, and the merge is noticed whenever it happens.
 */
export function settleOpenCode(
  state: MindState,
  presentIds: ReadonlySet<string>,
  nowMs: number,
  prOpen: boolean,
): { outcome: 'arrived' | 'expired' | 'waiting' | null; openCode: MindState['openCode'] } {
  const open = state.openCode
  if (!open) return { outcome: null, openCode: null }
  if (presentIds.has(open.id)) return { outcome: 'arrived', openCode: null }
  if (!prOpen && nowMs - Date.parse(open.requestedAt) > BUILD_EXPIRES_HOURS * 3_600_000) return { outcome: 'expired', openCode: null }
  return { outcome: 'waiting', openCode: open }
}

/** A file-name id for something to be built, different from every object and request already there. */
export function buildIdFor(name: string, taken: ReadonlySet<string>): string {
  return uniqueId(name, 'object', taken)
}
