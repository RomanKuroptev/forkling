import { useEffect, useState } from 'react'
import { notesStore, useNotes, useOpenedNote } from '../world/notesStore.ts'
import { useWorld } from '../world/WorldContext.tsx'
import { NoteForm, config } from './NoteForm.tsx'
import { Win } from './Win.tsx'
import { CLOSED_THREAD_TEXT, threadView } from './threadView.ts'

/**
 * A paper note opened by a click, as a window: its whole thread, oldest note first, each with who left it, what it says and what became
 * of it, in the same words as the site's notes page. Under the newest reply of an open thread there is an Answer button that opens
 * the answer box; a closed thread says so. Everything is plain text.
 */
export function NotePanel() {
  const note = useOpenedNote()
  const notes = useNotes()
  const { clock } = useWorld()
  const [answering, setAnswering] = useState<string | null>(null)
  useEffect(() => setAnswering(null), [note?.id])
  useEffect(() => {
    if (!note) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && notesStore.close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [note])
  if (!note) return null
  const view = threadView(notes, note, clock.now())
  const canPost = Boolean(config.endpoint && config.siteKey)
  return (
    <Win title="note.txt" label="A note" onClose={() => notesStore.close()}>
      <ul className="win-thread">
        {view.items.map(({ note: n, verb, fate }) => (
          <li key={n.id}>
            <p className="win-quiet">
              <strong>{n.name.trim() || 'A visitor'}</strong> {verb} on {n.at.slice(0, 10)}.
            </p>
            <p style={{ whiteSpace: 'pre-wrap' }}>{n.message}</p>
            <p>
              {fate.lead}
              {fate.detail ? <blockquote>{fate.detail}</blockquote> : null}
            </p>
          </li>
        ))}
      </ul>
      {view.answerTo && canPost && answering !== view.answerTo && (
        <button type="button" className="win-btn" onClick={() => setAnswering(view.answerTo)}>
          Answer
        </button>
      )}
      {view.closed && <p className="win-quiet">{CLOSED_THREAD_TEXT}</p>}
      {answering && config.endpoint && config.siteKey && (
        <NoteForm endpoint={config.endpoint} siteKey={config.siteKey} replyTo={answering} placeId={note.placeId} inline onClose={() => setAnswering(null)} />
      )}
    </Win>
  )
}
