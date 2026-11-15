import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Note, NotesHidden, type Place } from '@forkling/schema'
import { esc } from './md.ts'

/**
 * The address of `POST /notes` from the server's address (the `MIND_URL` repository variable), or null if it will not do: it must be
 * https (or a local try-out), the bare address with no user, path or query. The check keeps a wrong setting out of a page.
 */
export function notesEndpoint(mindUrl: string | undefined): string | null {
  const raw = mindUrl?.trim()
  if (!raw) return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  if (!(url.protocol === 'https:' || (url.protocol === 'http:' && local))) return null
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) return null
  return `${url.origin}/notes`
}

/** A Turnstile site key (the `TURNSTILE_SITE_KEY` repository variable): letters, digits, dash and underscore, so nothing can break out of an attribute. */
export function validSiteKey(key: string | undefined): string | null {
  const k = key?.trim()
  return k && /^[0-9A-Za-z_-]{16,64}$/.test(k) ? k : null
}

/** The notes visitors left (`notes/*.json`) that fit their schema, newest first, without the ones Roman hid (`mind/notes-hidden.json`). */
export function loadNotes(world: string): Note[] {
  const folder = join(world, 'notes')
  if (!existsSync(folder)) return []
  let hidden = new Set<string>()
  try {
    const parsed = NotesHidden.safeParse(JSON.parse(readFileSync(join(world, 'mind/notes-hidden.json'), 'utf8')))
    if (parsed.success) hidden = new Set(parsed.data.hidden)
  } catch {
    hidden = new Set()
  }
  return readdirSync(folder)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => {
      try {
        const parsed = Note.safeParse(JSON.parse(readFileSync(join(folder, f), 'utf8')))
        return parsed.success && !hidden.has(parsed.data.id) ? [parsed.data] : []
      } catch {
        return []
      }
    })
    .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))
}

const paragraphs = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replaceAll('\n', '<br>')}</p>`)
    .join('')

export interface NotesInput {
  notes: readonly Note[]
  places: readonly Place[]
  /** Where the form posts and the widget's key, or null while the mailbox is not set up. */
  mailbox: { endpoint: string; siteKey: string } | null
  /** How a moment is written on the site, in Merge's time zone, without the zone's name. */
  stamp: (iso: string) => string
  /** The zone in words, like `Stockholm time`: said once on the page. */
  zone: string
  add: (rel: string, input: { title: string; active: string; body: string }) => void
}

const FORM = (m: { endpoint: string; siteKey: string }) =>
  [
    `<form id="note-form" data-endpoint="${esc(m.endpoint)}" autocomplete="off">`,
    '<p><label for="note-name">Your name (optional, up to 40 characters)</label><br><input id="note-name" type="text" maxlength="40"></p>',
    '<p><label for="note-message">Your note (up to 500 characters)</label><br><textarea id="note-message" maxlength="500" rows="5" required></textarea></p>',
    `<div class="cf-turnstile" data-sitekey="${esc(m.siteKey)}"></div>`,
    '<p><button id="note-send" type="submit" class="play">Leave the note</button></p>',
    '<p id="note-status" role="status"></p>',
    '</form>',
    '<noscript><p class="quiet">Leaving a note needs JavaScript.</p></noscript>',
    '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>',
    '<script src="../notes.js"></script>',
  ].join('\n')

/** What a visitor is told before sending (spec 10.1): public, kept for good in a public repository, read by an AI, and what is taken out. */
const DISCLOSURE = [
  '<div class="notes-disclosure card">',
  '<p><strong>Before you send a note:</strong></p>',
  '<ul>',
  '<li>Notes are public. Anyone can read them on this page.</li>',
  '<li>A note is kept permanently in a public repository, even if it is later hidden from this site.</li>',
  '<li>A note is read by an AI: a small model screens it first, and then Merge, which is an AI, reads it.</li>',
  '<li>Links, email addresses and phone numbers are taken out. You can leave 3 notes a day.</li>',
  '</ul>',
  '</div>',
].join('\n')

/** `/notes/` (spec 10.1, 9.9): the form with what a visitor is told before sending, and the board of every note that was left, with what became of it. */
export function renderNotes(i: NotesInput): void {
  const placeName = (id: string) => i.places.find((p) => p.id === id)?.name ?? (id === 'home' ? 'Home' : id === 'workshop' ? 'Workshop' : id)
  const fate = (n: Note): string => {
    if (n.status === 'new') return '<p><em>Not found yet.</em></p>'
    const found = n.foundAt ? i.stamp(n.foundAt).slice(0, 10) : ''
    if (n.status === 'found') return `<p><em>Found by Merge on ${esc(found)}. Not answered yet.</em></p>`
    if (n.status === 'replied') return `<p><em>Merge replied:</em></p><blockquote>${paragraphs(n.reply ?? '')}</blockquote>`
    if (n.status === 'kept') return '<p><em>Merge kept this note.</em></p>'
    return `<p><em>Merge declined this note:</em> ${esc(n.declineReason ?? '')}</p>`
  }
  const item = (n: Note) =>
    `<li class="note" data-note="${esc(n.id)}" data-status="${esc(n.status)}"><p class="quiet"><strong>${esc(n.name || 'A visitor')}</strong> left this on ${esc(i.stamp(n.at))}, at ${esc(placeName(n.placeId))}.</p>${paragraphs(n.message)}${fate(n)}</li>`

  i.add('notes/index.html', {
    title: 'Notes',
    active: 'notes/',
    body: [
      '<h1>Notes</h1>',
      '<p class="quiet">Anyone can leave Merge a note. Merge finds it when it comes by, and may reply, keep it or decline it, with a reason. What was left, and what became of it, is below.</p>',
      '<h2>Leave a note</h2>',
      i.mailbox ? `${DISCLOSURE}\n${FORM(i.mailbox)}` : '<p><strong>The mailbox is closed for now.</strong> Notes cannot be left at the moment.</p>',
      '<h2>On the board</h2>',
      ...(i.notes.length > 0 ? [`<p class="quiet">Times are ${esc(i.zone)}.</p>`] : []),
      i.notes.length > 0 ? `<ul class="requests notes">${i.notes.map(item).join('')}</ul>` : '<p class="quiet">No notes have been left yet.</p>',
    ].join('\n'),
  })
}
