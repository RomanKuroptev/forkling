import type { Note, NotesHidden } from '@forkling/schema'
import { addWakingMs, type SleepOptions } from './sleep.ts'

/** Spec 10.1 and 16: a note nobody found is found by itself after 1 waking hour, so none waits for ever. It was 6: a note left at Home at 10:28 was found at 14:48. */
export const NOTE_AUTO_FIND_WAKING_MS = 3_600_000
/** A found note that has waited this long without its reply step makes the next plan include one (it may reply, decline or keep it). */
export const NOTE_REPLY_OVERDUE_MS = 3 * 3_600_000
/** Spec 2.3: the `note` trigger fires at most once every 30 minutes. */
export const NOTE_TRIGGER_GAP_MS = 30 * 60_000

export type FindReason = 'step' | 'thought' | 'wake' | 'timeout'

export interface FindContext {
  nowMs: number
  /** The place the current step is at, or null. "Within 10 m" is "the same place" (W7 decision 1): the mind tracks places, not coordinates. */
  stepPlaceId: string | null
  /** The place Merge is in when a thought tick runs, or null. */
  thoughtPlaceId: string | null
  /** The first awake tick of the day. */
  justWoke: boolean
  sleep: SleepOptions
}

/** Why a new note is found now, or null if it is not. Only a `new` note can be found. */
export function findReason(note: Pick<Note, 'status' | 'placeId' | 'at'>, c: FindContext): FindReason | null {
  if (note.status !== 'new') return null
  if (c.stepPlaceId === note.placeId) return 'step'
  if (c.thoughtPlaceId === note.placeId) return 'thought'
  if (c.justWoke && note.placeId === 'home') return 'wake'
  if (addWakingMs(Date.parse(note.at), NOTE_AUTO_FIND_WAKING_MS, c.sleep) <= c.nowMs) return 'timeout'
  return null
}

/** Roman hides a note by adding its id to `mind/notes-hidden.json`; it is gone from the site and from Merge's prompts. */
export function visibleNotes<N extends Pick<Note, 'id'> & { thread?: string | null }>(notes: readonly N[], hidden: Pick<NotesHidden, 'hidden'>): N[] {
  const gone = new Set(hidden.hidden)
  // A hidden note hides the rest of its thread too (spec v4 step 5).
  const goneThreads = new Set(notes.filter((n) => gone.has(n.id)).map((n) => n.thread ?? n.id))
  return notes.filter((n) => !gone.has(n.id) && !goneThreads.has(n.thread ?? n.id))
}

/** The ids of the found notes that have waited 3 hours or more for an answer, the oldest first. Pure. */
export function overdueNotes(notes: readonly Pick<Note, 'id' | 'status' | 'foundAt'>[], nowMs: number): string[] {
  return notes
    .filter((n) => n.status === 'found' && n.foundAt !== null && nowMs - Date.parse(n.foundAt) >= NOTE_REPLY_OVERDUE_MS)
    .sort((a, b) => Date.parse(a.foundAt!) - Date.parse(b.foundAt!))
    .map((n) => n.id)
}

export function noteTriggerDue(a: { foundCount: number; lastMs: number | null; nowMs: number }): boolean {
  return a.foundCount > 0 && (a.lastMs === null || a.nowMs - a.lastMs >= NOTE_TRIGGER_GAP_MS)
}
