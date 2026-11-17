import { useEffect, useRef, useState } from 'react'
import { NOTE_DISCLOSURE, NOTE_MESSAGE_MAX, NOTE_NAME_MAX, placeAt } from '@forkling/sim'
import { visitor } from '../visitor.ts'
import { checkNoteInput, noteConfig, sendNote } from '../world/notesClient.ts'
import { siteBase } from '../world/panelContent.ts'
import { useWorld } from '../world/WorldContext.tsx'
import { mountTurnstile } from './turnstile.ts'

const config = noteConfig(location.search, { mind: import.meta.env.VITE_MIND_URL as string | undefined, siteKey: import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined })

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

function NoteForm({ endpoint, siteKey, onClose }: { endpoint: string; siteKey: string; onClose: () => void }) {
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
    const placeId = (here ? placeAt(here, world.places)?.id : null) ?? 'home'
    const r = await sendNote({ fetch: (u, i) => fetch(u, i), endpoint }, { name: name.trim(), message: message.trim(), token, position: here, placeId })
    setBusy(false)
    setResult(r)
    if (r.ok) setMessage('')
  }

  // Typing must not walk the avatar: keep keys inside the form.
  const keep = (e: { stopPropagation: () => void }) => e.stopPropagation()
  return (
    <div className="hud note-ui" role="dialog" aria-label="Leave a note" onKeyDown={keep} onKeyUp={keep} style={{ top: 16, bottom: 'auto', left: '50%', transform: 'translateX(-50%)', width: 'min(520px, 94vw)', maxHeight: '88vh', overflow: 'auto', pointerEvents: 'auto', zIndex: 20, background: 'rgb(20 24 20 / 88%)' }}>
      <button onClick={onClose} style={{ float: 'right' }} aria-label="Close">
        ×
      </button>
      <h3 style={{ margin: '0 0 8px' }}>Leave a note for Merge</h3>
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
}
