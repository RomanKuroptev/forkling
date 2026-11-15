import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Note, NotesHidden, type NotesResponse } from '@forkling/schema'
import { visibleNotes } from '@forkling/sim'

/** Every note in `notes/` that fits its schema, oldest first. A file that is not a note, or is not JSON, is left out (spec 10.1). */
export function readNotes(dir: string): Note[] {
  const folder = join(dir, 'notes')
  if (!existsSync(folder)) return []
  return readdirSync(folder)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => {
      try {
        const parsed = Note.safeParse(JSON.parse(readFileSync(join(folder, f), 'utf8')))
        return parsed.success ? [parsed.data] : []
      } catch {
        return []
      }
    })
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
}

/** `mind/notes-hidden.json`: the notes Roman hid. A missing or broken file hides nothing. */
export function readNotesHidden(dir: string): NotesHidden {
  try {
    const parsed = NotesHidden.safeParse(JSON.parse(readFileSync(join(dir, 'mind/notes-hidden.json'), 'utf8')))
    return parsed.success ? parsed.data : { hidden: [] }
  } catch {
    return { hidden: [] }
  }
}

const PUBLIC_NOTES_TTL_MS = 10_000
const PUBLIC_NOTES_MAX = 100

/**
 * The notes `GET /notes.json` gives the viewer (spec 10.1): every note that fits its schema and is not hidden, newest first, up to
 * 100. The folder is read at most once every 10 seconds, however many visitors ask. They are public already: the site's board shows them.
 */
export function createPublicNotes(dir: string, now: () => number): () => NotesResponse {
  let at = Number.NEGATIVE_INFINITY
  let cached: NotesResponse = { notes: [] }
  return () => {
    if (now() - at >= PUBLIC_NOTES_TTL_MS) {
      at = now()
      cached = { notes: visibleNotes(readNotes(dir), readNotesHidden(dir)).reverse().slice(0, PUBLIC_NOTES_MAX) }
    }
    return cached
  }
}
