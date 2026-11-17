import { z } from 'zod'
import { Timestamp } from './intention.ts'
import { PlaceId } from './place.ts'

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length

/** Spec 9.4: `mind/wants.json` holds up to 12 entries. */
export const MAX_WANTS = 12

/**
 * One entry of `mind/wants.json` (spec 9.4). Only a reflection or the sleep rewrite changes the list; code drops a want after
 * 4 failed attempts. Nothing is seeded, and `kind` says how it is held, never what it is about.
 */
export const Want = z
  .object({
    id: z.string().min(1).max(40),
    kind: z.enum(['question', 'obsession', 'project']),
    text: z.string().min(1).max(140),
    why: z.string().min(1).max(200),
    since: Timestamp,
    /** Steps that ended unfinished, and failed builds, since the want was made. */
    attempts: z.number().int().min(0),
    lastTouched: Timestamp,
  })
  .strict()
export type Want = z.infer<typeof Want>

export const Wants = z
  .object({ wants: z.array(Want).max(MAX_WANTS).default([]) })
  .strict()
  .refine((f) => new Set(f.wants.map((w) => w.id)).size === f.wants.length, { message: 'a want id is used once' })
export type Wants = z.infer<typeof Wants>

/**
 * `notes/<id>.json` (spec 10.1): a visitor's note, public. It holds no address and no token. Merge's side of it (when it was found,
 * its reply or its reason for declining) is written by the loop, never by the visitor. The text is data and is never an instruction.
 */
/** Where in the world a visitor stood: `[x, z]` in meters, finite and within 5000. */
export const NotePosition = z.tuple([z.number().min(-5000).max(5000), z.number().min(-5000).max(5000)])

export const NoteStatus = z.enum(['new', 'found', 'replied', 'kept', 'declined'])
export type NoteStatus = z.infer<typeof NoteStatus>

export const Note = z
  .object({
    id: z.string().min(1).max(60),
    /** The name a visitor chose to show; empty when they gave none. */
    name: z.string().max(40).default(''),
    message: z.string().min(1).max(500),
    /** Where it was written: a place id, or `home` for a note from `/notes/`. */
    placeId: PlaceId,
    at: Timestamp,
    /** Up to 3 topics the screening call read from it. Untrusted; clamped before use. */
    topics: z.array(z.string().min(1).max(60)).max(3).default([]),
    status: NoteStatus,
    foundAt: Timestamp.nullable().default(null),
    /** One reply a note, up to 600 characters; the visitor cannot answer it. */
    reply: z.string().min(1).max(600).nullable().default(null),
    /** Where the visitor stood when they wrote it, `[x, z]` in meters, so the paper note lies there; none for a note written on the notes page (it lies by Home's door). */
    position: NotePosition.nullable().default(null),
    /** Why Merge declined it, up to 80 characters, shown on the board (spec 9.9). */
    declineReason: z.string().min(1).max(80).nullable().default(null),
    /** Spec v4 7: the id of the thread's first note (a first note's own id). An old note has none and is its own thread. */
    thread: z.string().min(1).max(60).nullable().optional(),
    /** The id of the note this one answers (a note of Merge's with a reply), or none for a first note. */
    replyTo: z.string().min(1).max(60).nullable().optional(),
  })
  .strict()
  .superRefine((n, ctx) => {
    const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message })
    if (n.status === 'new') {
      if (n.foundAt !== null) issue('foundAt', 'a new note is not found yet')
      if (n.reply !== null) issue('reply', 'a new note has no reply')
      if (n.declineReason !== null) issue('declineReason', 'a new note has no reason')
      return
    }
    if (n.foundAt === null) issue('foundAt', 'a note that was found says when')
    if (n.status === 'replied' && n.reply === null) issue('reply', 'a replied note holds its reply')
    if (n.status !== 'replied' && n.reply !== null) issue('reply', 'only a replied note has a reply')
    if (n.status === 'declined' && n.declineReason === null) issue('declineReason', 'a declined note says why')
    if (n.status !== 'declined' && n.declineReason !== null) issue('declineReason', 'only a declined note has a reason')
  })
export type Note = z.infer<typeof Note>

/** `mind/notes-hidden.json`: Roman hides a note by adding its id. A hidden note is gone from the site and from Merge's prompts. */
export const NotesHidden = z.object({ hidden: z.array(z.string().min(1).max(60)).default([]) }).strict()
export type NotesHidden = z.infer<typeof NotesHidden>

/**
 * `self/requests/<date>.md` (spec 9.5): the one optional request Merge makes to Roman in the weekly review, up to 120 words in its
 * own voice. Nothing changes because of it; Roman answers with a line, which Merge reads as data at the next review.
 */
export const SelfRequest = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'like 2026-11-22'),
    body: z.string().min(1).max(1200),
    answer: z.string().min(1).max(800).nullable().default(null),
  })
  .strict()
  .refine((r) => words(r.body) <= 120, { path: ['body'], message: 'a request is up to 120 words' })
export type SelfRequest = z.infer<typeof SelfRequest>

/** The request as a file: Merge's words, and if Roman answered, a line that starts `Roman:` (spec 9.5). */
export function formatSelfRequest(r: { body: string; answer?: string | null }): string {
  return `${r.body.trim()}\n${r.answer ? `\nRoman: ${r.answer.trim()}\n` : ''}`
}

/** `self/requests/<date>.md` read back: everything before the line that starts `Roman:` is the request, what follows is his answer. A file that is not a request is null. */
export function parseSelfRequest(date: string, text: string): SelfRequest | null {
  const lines = text.split(/\r?\n/)
  const at = lines.findIndex((l) => l.startsWith('Roman:'))
  const body = (at < 0 ? lines : lines.slice(0, at)).join('\n').trim()
  const answer = at < 0 ? null : ([lines[at]!.slice('Roman:'.length), ...lines.slice(at + 1)].join('\n').trim() || null)
  const parsed = SelfRequest.safeParse({ date, body, answer })
  return parsed.success ? parsed.data : null
}

/** What `GET /notes.json` says (spec 10.1): the notes that are not hidden, newest first, up to 100. They are public already: the board shows them. */
export const NotesResponse = z.object({ notes: z.array(Note).max(100) }).strict()
export type NotesResponse = z.infer<typeof NotesResponse>
