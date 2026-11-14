import type { Note, NotesHidden } from '@forkling/schema'
import { addWakingMs, type SleepOptions } from './sleep.ts'

/** Spec 10.1: a note nobody found is found by itself after 6 waking hours, so none waits for ever. */
export const NOTE_AUTO_FIND_WAKING_MS = 6 * 3_600_000
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
export function visibleNotes<N extends Pick<Note, 'id'>>(notes: readonly N[], hidden: NotesHidden): N[] {
  const gone = new Set(hidden.hidden)
  return notes.filter((n) => !gone.has(n.id))
}

export function noteTriggerDue(a: { foundCount: number; lastMs: number | null; nowMs: number }): boolean {
  return a.foundCount > 0 && (a.lastMs === null || a.nowMs - a.lastMs >= NOTE_TRIGGER_GAP_MS)
}
