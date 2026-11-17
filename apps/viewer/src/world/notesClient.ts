import { NotesResponse, type Note } from '@forkling/schema'
import { notesEndpoint, validSiteKey } from '@forkling/sim'
import { mindUrlFrom } from './liveSync.ts'

/** The server's `/notes.json`, or null when it does not fit the schema (at most 100 notes). */
export function readNotesResponse(json: unknown): Note[] | null {
  const parsed = NotesResponse.safeParse(json)
  return parsed.success ? parsed.data.notes : null
}

export interface NotesSyncDeps {
  mindUrl: string | null
  intervalMs: number
  fetch: typeof fetch
  setTimer: (run: () => void, ms: number) => unknown
  clearTimer: (id: unknown) => void
  onNotes: (notes: Note[]) => void
}

/**
 * Keeps the paper notes current (spec 10.1): reads `/notes.json` at once and then every `intervalMs`. A server that is down, or an
 * answer that does not fit, leaves what is on show as it is, and the next poll tries again. Returns a function that stops it.
 */
export function startNotesSync(deps: NotesSyncDeps): () => void {
  if (!deps.mindUrl) return () => {}
  const url = `${deps.mindUrl.replace(/\/+$/, '')}/notes.json`
  let stopped = false
  let timer: unknown = null

  const poll = async () => {
    try {
      const res = await deps.fetch(url, { cache: 'no-store' })
      const notes = readNotesResponse(await res.json())
      if (notes && !stopped) deps.onNotes(notes)
    } catch {
      // The server is down or slow: keep what is on show.
    }
    if (stopped) return
    if (timer !== null) deps.clearTimer(timer)
    timer = deps.setTimer(() => void poll(), deps.intervalMs)
  }

  void poll()
  return () => {
    stopped = true
    if (timer !== null) deps.clearTimer(timer)
  }
}

export interface NoteInput {
  name: string
  message: string
  token: string
  position: [number, number] | null
  placeId: string
  /** Spec v4 7: the id of the note this one answers; none for a new note. */
  replyTo?: string
}

export type SendResult = { ok: true; text: string } | { ok: false; text: string }

const THANKS = 'Thank you. Your note is in the mailbox. Merge will find it when it comes by.'
const centimetres = (n: number) => Number(n.toFixed(2))

/** Posts a note to the server and turns what comes back into words for the visitor. The server's own words are shown when it turns a note away. */
export async function sendNote(deps: { fetch: typeof fetch; endpoint: string }, input: NoteInput): Promise<SendResult> {
  const body: Record<string, unknown> = { name: input.name, message: input.message, placeId: input.placeId, token: input.token }
  if (input.replyTo) body.replyTo = input.replyTo
  if (input.position) body.position = [centimetres(input.position[0]), centimetres(input.position[1])]
  let res: Response
  try {
    res = await deps.fetch(deps.endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    return { ok: false, text: 'Could not reach Merge. Try again in a moment.' }
  }
  let json: unknown
  try {
    json = await res.json()
  } catch {
    return { ok: false, text: 'Something went wrong. Try again in a moment.' }
  }
  const answer = (json ?? {}) as { ok?: unknown; error?: unknown }
  if (res.status >= 200 && res.status < 300 && answer.ok === true) return { ok: true, text: THANKS }
  if (typeof answer.error === 'string' && answer.error) return { ok: false, text: answer.error.slice(0, 200) }
  return { ok: false, text: 'Something went wrong. Try again in a moment.' }
}

/** What is wrong with the form before anything is sent, in words, or null. */
export function checkNoteInput(input: { message: string; token: string }): string | null {
  if (!input.message.trim()) return 'Write something first.'
  if (!input.token) return 'Please complete the check first.'
  return null
}

/** Where notes go and the Turnstile site key: `?mind=` and `?sitekey=` on the page address win over the build's settings. Either may be none. */
export function noteConfig(search: string, env: { mind?: string; siteKey?: string }): { endpoint: string | null; siteKey: string | null } {
  const params = new URLSearchParams(search)
  const mind = mindUrlFrom(params.get('mind'), env.mind)
  return { endpoint: notesEndpoint(mind ?? undefined), siteKey: validSiteKey(params.get('sitekey') ?? undefined) ?? validSiteKey(env.siteKey) }
}
