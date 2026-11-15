import { useEffect } from 'react'
import { noteFate } from '@forkling/sim'
import { notesStore, useOpenedNote } from '../world/notesStore.ts'

/** A paper note opened by a click: who left it, what it says, and what became of it, in the same words as the site's notes page. Everything is plain text. */
export function NotePanel() {
  const note = useOpenedNote()
  useEffect(() => {
    if (!note) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && notesStore.close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [note])
  if (!note) return null
  const fate = noteFate(note, note.foundAt?.slice(0, 10) ?? '')
  return (
    <div className="hud" role="dialog" aria-label="A note" style={{ top: 16, bottom: 'auto', left: '50%', transform: 'translateX(-50%)', width: 'min(560px, 94vw)', maxHeight: '84vh', overflow: 'auto', pointerEvents: 'auto', zIndex: 20, background: 'rgb(20 24 20 / 88%)' }}>
      <button onClick={() => notesStore.close()} style={{ float: 'right' }} aria-label="Close">
        ×
      </button>
      <h3 style={{ margin: '0 0 8px' }}>A note from {note.name.trim() || 'a visitor'}</h3>
      <p style={{ whiteSpace: 'pre-wrap', margin: '0 0 8px' }}>{note.message}</p>
      <p style={{ margin: '0 0 4px' }}>
        <small>Left on {note.at.slice(0, 10)}.</small>
      </p>
      <p style={{ margin: 0 }}>
        {fate.lead}
        {fate.detail ? <blockquote style={{ margin: '6px 0 0' }}>{fate.detail}</blockquote> : null}
      </p>
    </div>
  )
}
