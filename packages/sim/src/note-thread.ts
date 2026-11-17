import type { Note } from '@forkling/schema'

/** Spec v4 7: Merge replies at most 3 times in one thread; a thread with nothing new for 14 days is closed too. */
export const THREAD_MAX_REPLIES = 3
export const THREAD_IDLE_DAYS = 14

/** The id of a note's thread: the first note's id. An old note (no `thread`) is its own thread. */
export const threadOf = (n: Pick<Note, 'id'> & { thread?: string | null }): string => n.thread ?? n.id

type ThreadNote = Pick<Note, 'id' | 'at' | 'foundAt' | 'status'> & { thread?: string | null }

export interface ThreadState {
  open: boolean
  replies: number
  /** The newest note of the thread by when it was written, or null when there is none. */
  newestId: string | null
  closedBy: 'replies' | 'idle' | 'none' | null
}

/** The notes of one thread, oldest first. */
export function threadNotes<N extends ThreadNote>(notes: readonly N[], threadId: string): N[] {
  return notes.filter((n) => threadOf(n) === threadId).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
}

/** Whether a thread is open (spec v4 7): closed after Merge's 3rd reply, or 14 days after its newest note (or Merge's finding of it). Pure. */
export function threadState(notes: readonly ThreadNote[], threadId: string, nowMs: number): ThreadState {
  const inThread = threadNotes(notes, threadId)
  if (inThread.length === 0) return { open: false, replies: 0, newestId: null, closedBy: 'none' }
  const replies = inThread.filter((n) => n.status === 'replied').length
  const newest = inThread[inThread.length - 1]!
  const lastMs = Math.max(...inThread.map((n) => Math.max(Date.parse(n.at), n.foundAt ? Date.parse(n.foundAt) : 0)))
  const closedBy = replies >= THREAD_MAX_REPLIES ? 'replies' : nowMs - lastMs >= THREAD_IDLE_DAYS * 86_400_000 ? 'idle' : null
  return { open: closedBy === null, replies, newestId: newest.id, closedBy }
}

export type AnswerCheck = { ok: true; thread: string } | { ok: false; reason: string }

/** Whether a visitor may answer note `replyTo`: it exists, Merge replied to it, it is the newest note of its thread, and the thread is open. */
export function canAnswer(notes: readonly ThreadNote[], replyTo: string, nowMs: number): AnswerCheck {
  const target = notes.find((n) => n.id === replyTo)
  if (!target) return { ok: false, reason: 'That note is not there to answer.' }
  if (target.status !== 'replied') return { ok: false, reason: 'Merge has not replied to that note yet.' }
  const thread = threadOf(target)
  const state = threadState(notes, thread, nowMs)
  if (state.newestId !== target.id) return { ok: false, reason: 'That is not the newest note of its thread.' }
  if (!state.open) return { ok: false, reason: 'That thread is closed. Leave a new note.' }
  return { ok: true, thread }
}
