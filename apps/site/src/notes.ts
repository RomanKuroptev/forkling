import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Note, NotesHidden, type Place } from '@forkling/schema'
import { NOTE_DISCLOSURE, noteFate, notesEndpoint, threadNotes, threadOf, threadState, validSiteKey, visibleNotes } from '@forkling/sim'

export { notesEndpoint, validSiteKey }
import { esc } from './md.ts'

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
  const all = readdirSync(folder)
    .filter((f) => f.endsWith('.json'))
    .flatMap((f) => {
      try {
        const parsed = Note.safeParse(JSON.parse(readFileSync(join(folder, f), 'utf8')))
        return parsed.success ? [parsed.data] : []
      } catch {
        return []
      }
    })
  // A hidden note hides the rest of its thread too (spec v4 step 5).
  return visibleNotes(all, { hidden: [...hidden] })
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
  /** The time the page is built at, to tell whether a thread is still open. */
  nowMs?: number
  add: (rel: string, input: { title: string; active: string; body: string }) => void
}

const FORM = (m: { endpoint: string; siteKey: string }) =>
  [
    `<form id="note-form" data-endpoint="${esc(m.endpoint)}" autocomplete="off">`,
    '<p><label for="note-name">Your name (optional, up to 40 characters)</label><br><input id="note-name" type="text" maxlength="40"></p>',
    '<p id="note-answering" class="quiet" hidden></p>',
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
const DISCLOSURE = ['<div class="notes-disclosure card">', '<p><strong>Before you send a note:</strong></p>', '<ul>', ...NOTE_DISCLOSURE.map((line) => `<li>${esc(line)}</li>`), '</ul>', '</div>'].join('\n')

/** `/notes/` (spec 10.1, 9.9): the form with what a visitor is told before sending, and the board of every note that was left, with what became of it. */
export function renderNotes(i: NotesInput): void {
  const placeName = (id: string) => i.places.find((p) => p.id === id)?.name ?? (id === 'home' ? 'Home' : id === 'workshop' ? 'Workshop' : id)
  const fate = (n: Note): string => {
    const { lead, detail } = noteFate(n, n.foundAt ? i.stamp(n.foundAt).slice(0, 10) : '')
    if (n.status === 'replied') return `<p><em>${esc(lead)}</em></p><blockquote>${paragraphs(detail ?? '')}</blockquote>`
    return `<p><em>${esc(lead)}</em>${detail ? ` ${esc(detail)}` : ''}</p>`
  }
  const nowMs = i.nowMs ?? Date.now()
  // Threads (spec v4 7): the notes of a thread sit together, oldest first; threads go newest first (a lone note is a thread of one).
  const threadIds = [...new Set(i.notes.map(threadOf))]
  const order: Note[] = threadIds.flatMap((id) => threadNotes(i.notes, id))
  const item = (n: Note) => {
    const id = threadOf(n)
    const state = threadState(i.notes, id, nowMs)
    const newest = state.newestId === n.id
    const answers = n.replyTo ? ` data-reply-to="${esc(n.replyTo)}"` : ''
    const foot = !newest || n.status !== 'replied' ? '' : state.open ? (i.mailbox ? `<p><button type="button" class="note-answer-btn" data-answer="${esc(n.id)}">Answer</button></p>` : '') : '<p class="quiet">This thread is closed. Leave a new note above.</p>'
    return `<li class="note" data-note="${esc(n.id)}" data-thread="${esc(id)}"${answers} data-status="${esc(n.status)}"><p class="quiet"><strong>${esc(n.name || 'A visitor')}</strong> ${n.replyTo ? 'answered' : 'left this'} on ${esc(i.stamp(n.at))}, at ${esc(placeName(n.placeId))}.</p>${paragraphs(n.message)}${fate(n)}${foot}</li>`
  }

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
      i.notes.length > 0 ? `<ul class="requests notes">${order.map(item).join('')}</ul>` : '<p class="quiet">No notes have been left yet.</p>',
    ].join('\n'),
  })
}
