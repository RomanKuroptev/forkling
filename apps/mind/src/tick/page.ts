import { checkPage } from '@forkling/sim'
import { claimsHuman } from '../honesty.ts'
import type { Tick } from './context.ts'

/** Every version of the page is kept, named by the moment it was written (UTC, with no colons so every file system takes it). */
export const pageHistoryPath = (at: string): string => `self/page-history/${at.slice(0, 19).replaceAll(':', '-')}Z.md`

/**
 * A reflection or the sleep rewrite may hand back a new `self/page.md` (spec 9.7). Code only keeps it if it fits the limits:
 * up to 300 words, no link and no HTML, nothing that claims to be human, and at most one change a day so the prompt cache stays
 * warm. `null` and a blank answer both mean "leave it as it is": a model that has nothing to say must not wipe its own notes.
 * What goes on the page is Merge's.
 */
export function applyPage(t: Pick<Tick, 'page' | 'pageWrite' | 'mind' | 'today' | 'nowIso' | 'notes' | 'remember' | 'parts'>, proposed: string | null | undefined): void {
  const text = proposed?.trim()
  if (!text) return
  if (claimsHuman(text)) {
    t.notes.push('claim dropped, page: it claimed to be human')
    return
  }
  const check = checkPage(text, { prev: t.page, lastChangeDate: t.mind.pageChangedOn ?? null, today: t.today })
  if (!check.ok) {
    t.notes.push(`page change turned down: ${check.reasons.join('; ')}`)
    return
  }
  if (!check.changed) return
  t.page = text
  t.pageWrite = { text, at: t.nowIso }
  t.mind.pageChangedOn = t.today
  t.remember.push({ at: t.nowIso, kind: 'event', text: 'I rewrote my page.' })
  t.parts.push('rewrote its page')
}
