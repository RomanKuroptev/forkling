import { BUILD_EXPIRES_HOURS, MAX_BUILDS_PER_DAY, type MindState } from '@forkling/schema'
import { uniqueId } from './art.ts'

export type BuildCheck = { ok: true } | { ok: false; reason: string }

/** Whether the mind may ask for a build now: one a day, none while another waits, never asleep, never past the budget. */
export function checkBuildRequest(input: { state: MindState; today: string; asleep: boolean; canAfford: boolean }): BuildCheck {
  const { state, today, asleep, canAfford } = input
  if (asleep) return { ok: false, reason: 'it is asleep' }
  if (state.openBuild) return { ok: false, reason: `"${state.openBuild.id}" is still waiting to be built` }
  if ((state.builds?.date === today ? state.builds.count : 0) >= MAX_BUILDS_PER_DAY) return { ok: false, reason: 'only one build a day (one a day)' }
  if (!canAfford) return { ok: false, reason: 'the monthly budget would not cover it' }
  return { ok: true }
}

/**
 * What became of the build it is waiting on: it arrived (its object is in `objects/`), it expired, or it is still
 * waiting. The mind never asks GitHub: the world's own files are the answer.
 */
export function settleOpenBuild(
  state: MindState,
  objectIds: ReadonlySet<string>,
  nowMs: number,
): { outcome: 'arrived' | 'expired' | 'waiting' | null; openBuild: MindState['openBuild'] } {
  const open = state.openBuild
  if (!open) return { outcome: null, openBuild: null }
  if (objectIds.has(open.id)) return { outcome: 'arrived', openBuild: null }
  if (nowMs - Date.parse(open.requestedAt) > BUILD_EXPIRES_HOURS * 3_600_000) return { outcome: 'expired', openBuild: null }
  return { outcome: 'waiting', openBuild: open }
}

/** A file-name id for something to be built, different from every object and request already there. */
export function buildIdFor(name: string, taken: ReadonlySet<string>): string {
  return uniqueId(name, 'object', taken)
}
