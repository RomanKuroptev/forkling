import { dropFailedWants, MAX_WANT_ATTEMPTS, recordWantAttempt } from '@forkling/sim'
import { clampText } from '../decision.ts'
import type { Tick } from './context.ts'

/**
 * A step that ended unfinished, or a build that failed, counts against the want it served (spec 9.4). At 4 the want is dropped by
 * code, with a line in the stream that says so, and the plan is not touched: a step that named it no longer has a want to name.
 */
export function failWant(t: Pick<Tick, 'wants' | 'nowIso' | 'remember'>, wantId: string | null | undefined): void {
  if (!wantId) return
  const counted = recordWantAttempt(t.wants, wantId, t.nowIso)
  const { wants, dropped } = dropFailedWants(counted)
  t.wants = wants
  for (const w of dropped) {
    t.remember.push({ at: t.nowIso, kind: 'event', text: clampText(`I gave up on "${w.text}" after ${MAX_WANT_ATTEMPTS} attempts that did not work out.`, 300) })
  }
}

/** Keeps which want an open build was asked for, so a failed result can be counted against it. */
export function rememberJobWant(t: Pick<Tick, 'mind'>, jobId: string, wantId: string | undefined): void {
  if (!wantId) return
  t.mind.jobWants = { ...t.mind.jobWants, [jobId]: wantId }
}
