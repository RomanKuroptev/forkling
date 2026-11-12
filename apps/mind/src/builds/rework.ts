import { z } from 'zod'
import { clampText } from '../decision.ts'

/** Merge may put away at most this many works in a week (spec 9.9). */
export const MAX_RETIRES_PER_WEEK = 2
export const REWORK_MAX_TOKENS = 400
const WEEK_MS = 7 * 86_400_000

/** What Merge decides to do with an earlier work it chose to spend a tinker step on. */
export const ReworkAnswer = z.object({
  action: z.enum(['remix', 'retire', 'restore']),
  reason: z.string().describe('One sentence, up to 140 characters: why.'),
})
export type ReworkAnswer = z.infer<typeof ReworkAnswer>

/** The retirements of the last 7 days, from a list of timestamps. */
export function retirementsInWeek(list: readonly string[] | undefined, nowMs: number): string[] {
  return (list ?? []).filter((at) => nowMs - Date.parse(at) < WEEK_MS)
}

/**
 * The question a tinker step on an earlier work asks first (spec 7.5, 9.9). A work on the shelf may be remixed or put away; a
 * work that is put away may be remixed or brought back. Only those choices are named, so the answer stays one of them.
 */
export function buildReworkUser(i: { title: string; kind: string; about: string; status: 'shelf' | 'retired'; retireReason?: string | undefined; reason: string }): string {
  const here = i.status === 'shelf'
  return [
    `You chose to do something with your work "${clampText(i.title, 40)}" (${i.kind}): ${clampText(i.about, 200)}`,
    `Why you chose it: ${clampText(i.reason, 200)}`,
    here ? 'It is on the shelf.' : `It is put away${i.retireReason ? `, because: ${clampText(i.retireReason, 140)}` : ''}.`,
    '',
    'What do you want to do?',
    '- remix: make a new work from it. The old one stays as it is.',
    here ? `- retire: put it away. It leaves the shelf and the screens and goes to the retired page, where it can still be opened. You may put away at most ${MAX_RETIRES_PER_WEEK} works in a week.` : '- restore: bring it back to the shelf.',
    '',
    `Answer with the action and one sentence of why, in your own voice${here ? ' (a reason is needed to retire a work)' : ''}.`,
  ].join('\n')
}
