import { readSelfRequests } from '../self-requests.ts'
import { clampText } from '../decision.ts'
import type { Tick } from './context.ts'
import { rememberScored } from './importance.ts'

/**
 * Spec v4 8: Roman answers a request by setting its status in `self/requests/<date>.md`. A status that changed since the last look
 * is one stream event of importance 6, so Merge may react to it. Code only, no call. The first look just records what is there, a
 * new request is not a change, and nothing is written to the mind's state unless a status or a request changed. His words are not in the event: they reach
 * the next review as data.
 */
export function requestStatusStep(t: Tick): void {
  const before = t.mind.requestStatuses
  const now: Record<string, string> = {}
  for (const r of readSelfRequests(t.dir).slice(0, 52)) {
    now[r.date] = r.status
    const was = before?.[r.date]
    if (before && was !== undefined && was !== r.status) {
      const title = r.title ? `"${clampText(r.title, 60)}"` : `of ${r.date}`
      rememberScored(t, { at: t.nowIso, kind: 'event', text: `Roman set my request ${title} to ${r.status}.` }, 'requestAnswered')
      t.parts.push('Roman answered a request')
    }
  }
  if (JSON.stringify(before ?? null) !== JSON.stringify(now)) t.mind.requestStatuses = now
}
