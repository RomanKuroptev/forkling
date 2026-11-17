import { useEffect, useRef, useState } from 'react'
import { NOTE_DISCLOSURE, NOTE_MESSAGE_MAX, NOTE_NAME_MAX, placeAt } from '@forkling/sim'
import { visitor } from '../visitor.ts'
import { checkNoteInput, noteConfig, sendNote } from '../world/notesClient.ts'
import { siteBase } from '../world/panelContent.ts'
import { useWorld } from '../world/WorldContext.tsx'
import { mountTurnstile } from './turnstile.ts'
import { Win } from './Win.tsx'

export const config = noteConfig(location.search, { mind: import.meta.env.VITE_MIND_URL as string | undefined, siteKey: import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined })

/** The "Leave a note" button and its form (spec 10.1). It is there only when the build knows the server and the Turnstile site key. */
export function NoteButton() {
  const [open, setOpen] = useState(false)
  if (!config.endpoint || !config.siteKey) return null
  return open ? (
    <NoteForm endpoint={config.endpoint} siteKey={config.siteKey} onClose={() => setOpen(false)} />
  ) : (
    <button className="hud note-btn" style={{ left: 'auto', right: 16, bottom: 'calc(var(--taskbar-h) + 12px)', pointerEvents: 'auto' }} onClick={() => setOpen(true)}>
      Leave a note
    </button>
  )
}

/** The form of a new note, or, with `replyTo`, of an answer to Merge's reply in a thread (`placeId` is the thread's place). */
export function NoteForm({ endpoint, siteKey, onClose, replyTo, placeId: threadPlace, inline }: { endpoint: string; siteKey: string; onClose: () => void; replyTo?: string; placeId?: string; inline?: boolean }) {
  const { world } = useWorld()
  const base = siteBase(world.ref)
  const notesPage = base ? `${base}notes/` : null
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => (box.current ? mountTurnstile(box.current, siteKey, setToken, () => setResult({ ok: false, text: 'The human check could not load. Try again later.' })) : undefined), [siteKey])

  const submit = async () => {
    const problem = checkNoteInput({ message, token })
    if (problem) return setResult({ ok: false, text: problem })
    setBusy(true)
    const here = visitor.position ? ([visitor.position.x, visitor.position.z] as [number, number]) : null
    const placeId = threadPlace ?? (here ? placeAt(here, world.places)?.id : null) ?? 'home'
    const r = await sendNote({ fetch: (u, i) => fetch(u, i), endpoint }, { name: name.trim(), message: message.trim(), token, position: here, placeId, ...(replyTo ? { replyTo } : {}) })
    setBusy(false)
    setResult(r)
    if (r.ok) setMessage('')
  }

  // Typing must not walk the avatar: keep keys inside the form.
  const keep = (e: { stopPropagation: () => void }) => e.stopPropagation()
  const body = (
      <div onKeyDown={keep} onKeyUp={keep}>
      <h3>{replyTo ? 'Answer Merge' : 'Leave a note for Merge'}</h3>
      <ul style={{ paddingLeft: 18, margin: '0 0 8px' }}>
        <li>
          Notes are public. Anyone can read them on{' '}
          {notesPage ? (
            <a href={notesPage} target="_blank" rel="noopener noreferrer">
              Merge&apos;s notes page
            </a>
          ) : (
            "Merge's notes page"
          )}
          .
        </li>
        {NOTE_DISCLOSURE.slice(1).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <input value={name} maxLength={NOTE_NAME_MAX} onChange={(e) => setName(e.target.value)} placeholder="Your name (optional)" aria-label="Your name (optional)" style={{ width: '100%', boxSizing: 'border-box', marginBottom: 6 }} />
      <textarea value={message} maxLength={NOTE_MESSAGE_MAX} onChange={(e) => setMessage(e.target.value)} placeholder="Your note" aria-label="Your note" rows={4} style={{ width: '100%', boxSizing: 'border-box' }} />
      <small>
        {message.length}/{NOTE_MESSAGE_MAX}
      </small>
      <div ref={box} style={{ margin: '6px 0' }} />
      <button onClick={() => void submit()} disabled={busy}>
        {busy ? 'Sending…' : 'Send note'}
      </button>
      {result && (
        <p role="status" style={{ margin: '8px 0 0' }}>
          {result.text}
        </p>
      )}
      </div>
  )
  return inline ? body : (
    <Win title={replyTo ? 'answer.txt' : 'note.txt'} label={replyTo ? 'Answer Merge' : 'Leave a note'} onClose={onClose} className="win-form">
      {body}
    </Win>
  )
}
