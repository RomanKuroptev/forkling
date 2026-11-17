import type { Note } from '@forkling/schema'
import { canAnswer, noteFate, threadNotes, threadOf, threadState } from '@forkling/sim'

export interface ThreadItem {
  note: Note
  /** "left this" for a first note, "answered" for a note that answers one of Merge's replies. */
  verb: 'left this' | 'answered'
  fate: { lead: string; detail: string | null }
}

export interface ThreadView {
  items: ThreadItem[]
  /** The note an "Answer" button under the thread would answer: the newest note, when Merge replied to it and the thread is open. Else none. */
  answerTo: string | null
  /** The thread has a reply from Merge but is closed (after the third reply or 14 idle days). */
  closed: boolean
}

/** What the viewer's note panel shows for an opened note: its whole thread, oldest note first, with the rules of the site's notes page. Pure. */
export function threadView(notes: readonly Note[], opened: Note, nowMs: number): ThreadView {
  const id = threadOf(opened)
  const inThread = threadNotes(notes, id)
  const list = inThread.length > 0 ? inThread : [opened]
  const items = list.map<ThreadItem>((note) => ({ note, verb: note.replyTo ? 'answered' : 'left this', fate: noteFate(note, note.foundAt?.slice(0, 10) ?? '') }))
  const newest = list[list.length - 1]!
  if (newest.status !== 'replied') return { items, answerTo: null, closed: false }
  const check = canAnswer(notes, newest.id, nowMs)
  return { items, answerTo: check.ok ? newest.id : null, closed: !check.ok && !threadState(notes, id, nowMs).open }
}

export const CLOSED_THREAD_TEXT = 'This thread is closed. Leave a new note.'
