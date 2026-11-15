import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Note, NotesHidden } from '@forkling/schema'

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
