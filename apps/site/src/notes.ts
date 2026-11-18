import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Note, NotesHidden, type Place } from '@forkling/schema'
import { NOTE_DISCLOSURE, noteFate, THREAD_MAX_REPLIES, notesEndpoint, threadNotes, threadOf, threadState, validSiteKey, visibleNotes } from '@forkling/sim'

export { notesEndpoint, validSiteKey }
import { esc } from './md.ts'
import { pictureToPng, threadPicture } from './note-picture.ts'

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
  /** The address of the site, for the share tags and the picture; without it the thread pages have no share tags. */
  baseUrl?: string | undefined
  /** The forkling's name, for the share tags. */
  name?: string
  /** A file that is not a page (a thread's share picture). */
  addFile?: (rel: string, content: string | Buffer) => void
  add: (rel: string, input: { title: string; active: string; body: string; head?: string }) => void
}

/** The rule of a chat, said where the chat is: Merge's replies per thread and the name it remembers. */
export const CHAT_RULE = (merge: string) => `${merge} answers up to ${THREAD_MAX_REPLIES} times per chat and remembers your name next time.`

/** "you are: Kim · not you?", filled in by `notes.js` from the name this browser remembers; hidden until there is one. */
const WHO_HTML = '<p id="note-who" class="note-who quiet" hidden>you are: <strong id="note-who-name"></strong> &middot; <a href="#" id="note-notyou">not you?</a></p>'

export const noteForm = (m: { endpoint: string; siteKey: string }, root = '../') =>
  [
    `<form id="note-form" data-endpoint="${esc(m.endpoint)}" autocomplete="off">`,
    '<p><label for="note-name">Your name (optional, up to 40 characters)</label><br><input id="note-name" type="text" maxlength="40"></p>',
    WHO_HTML,
    '<p id="note-answering" class="quiet" hidden></p>',
    '<p><label for="note-message">Your note (up to 500 characters)</label><br><textarea id="note-message" maxlength="500" rows="5" placeholder="say something…" required></textarea></p>',
    `<div class="cf-turnstile" data-sitekey="${esc(m.siteKey)}"></div>`,
    '<p><button id="note-send" type="submit" class="play">Send</button></p>',
    '<p id="note-status" role="status"></p>',
    '</form>',
    '<noscript><p class="quiet">Leaving a note needs JavaScript.</p></noscript>',
    '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>',
    `<script src="${root}notes.js"></script>`,
  ].join('\n')

/**
 * The front page's form: one line and a SEND button. The notice, the name and the human check are in `#note-extra`, hidden until the field is used;
 * `notes.js` opens it on focus and never sends while it is hidden, so nobody sends a note without the notice having been in front of them.
 */
export const noteFormCompact = (m: { endpoint: string; siteKey: string }, root = '') =>
  [
    `<form id="note-form" class="note-compact" data-endpoint="${esc(m.endpoint)}" autocomplete="off">`,
    '<div class="note-row"><input id="note-message" type="text" maxlength="500" placeholder="leave Merge a note..." aria-label="Your note (up to 500 characters)" required><button id="note-send" type="submit" class="send">SEND</button></div>',
    '<div id="note-extra" hidden>',
    WHO_HTML,
    NOTE_DISCLOSURE_HTML,
    '<p><label for="note-name">Your name (optional, up to 40 characters)</label><br><input id="note-name" type="text" maxlength="40"></p>',
    `<div class="cf-turnstile" data-sitekey="${esc(m.siteKey)}"></div>`,
    '</div>',
    '<p id="note-status" role="status"></p>',
    '</form>',
    `<noscript><p class="quiet">Leaving a note needs JavaScript. <a href="${root}notes/">The notes page</a> says more.</p></noscript>`,
    '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>',
    `<script src="${root}notes.js"></script>`,
  ].join('\n')

/** What a visitor is told before sending (spec 10.1): public, kept for good in a public repository, read by an AI, and what is taken out. */
export const NOTE_DISCLOSURE_HTML = ['<div class="notes-disclosure card">', '<p><strong>Before you send a note:</strong></p>', '<ul>', ...NOTE_DISCLOSURE.map((line) => `<li>${esc(line)}</li>`), '</ul>', '</div>'].join('\n')

/** `/notes/` (spec 10.1, 9.9): the form with what a visitor is told before sending, and the board of every note that was left, with what became of it. */
export function renderNotes(i: NotesInput): void {
  const placeName = (id: string) => i.places.find((p) => p.id === id)?.name ?? (id === 'home' ? 'Home' : id === 'workshop' ? 'Workshop' : id)
  // A flat chat: a small line with the date and place, then the visitor's row full width, then Merge's reply as a row a step in.
  const merge = i.name ?? 'Merge'
  const fate = (n: Note): string => {
    const { lead, detail } = noteFate(n, n.foundAt ? i.stamp(n.foundAt).slice(0, 10) : '')
    if (n.status === 'replied') return `<div class="msg merge"><strong class="who">${esc(merge)}:</strong> ${paragraphs(detail ?? '')}</div>`
    if (n.status === 'found') return `<div class="msg merge typing"><span class="tface" aria-hidden="true"></span><span class="typing-text"><em>${esc(lead)}</em></span></div>`
    return `<p class="quiet note-fate"><em>${esc(lead)}</em>${detail ? ` ${esc(detail)}` : ''}</p>`
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
    const shareable = newest && threadNotes(i.notes, id).some((t) => t.status === 'replied')
    const share = shareable ? `<p class="quiet"><a href="t/${esc(id)}.html">Share this thread</a></p>` : ''
    const left = Math.max(0, THREAD_MAX_REPLIES - state.replies)
    const pips = newest && n.status === 'replied' && state.open ? `<p class="replies-left quiet">replies left <span class="pips" role="img" aria-label="${left} of ${THREAD_MAX_REPLIES}">${Array.from({ length: THREAD_MAX_REPLIES }, (_, k) => `<i class="${k < left ? 'on' : ''}"></i>`).join('')}</span></p>` : ''
    const foot = pips + share + (!newest || n.status !== 'replied' ? '' : state.open ? (i.mailbox ? `<p><button type="button" class="note-answer-btn" data-answer="${esc(n.id)}">Answer</button></p>` : '') : '<p class="quiet">This thread is closed. Leave a new note above.</p>')
    return `<li class="note" data-note="${esc(n.id)}" data-thread="${esc(id)}"${answers} data-status="${esc(n.status)}"><p class="quiet note-meta">${esc(n.name || 'A visitor')} ${n.replyTo ? 'answered' : 'left this'} on ${esc(i.stamp(n.at))}, at ${esc(placeName(n.placeId))}.</p><div class="msg visitor"><strong class="who">${esc(n.name || 'A visitor')}:</strong> ${paragraphs(n.message)}</div>${fate(n)}${foot}</li>`
  }

  // Sharing S5: a thread that has a reply from Merge gets its own page and picture. A hidden note took its thread out of `i.notes` already.
  for (const id of threadIds) {
    const inThread = threadNotes(i.notes, id)
    const lastReplied = [...inThread].reverse().find((n) => n.status === 'replied' && n.reply)
    if (!lastReplied) continue
    const base = i.baseUrl?.replace(/\/+$/, '')
    const pageUrl = base ? `${base}/notes/t/${id}.html` : null
    const svg = threadPicture({ name: lastReplied.name, message: lastReplied.message, reply: lastReplied.reply!, address: base ? base.replace(/^https?:\/\//, '') : (i.name ?? 'Merge') })
    // Link previews read a PNG; the SVG is kept, and is the fallback when the PNG cannot be rendered.
    const png = pictureToPng(svg)
    const imageUrl = base ? `${base}/notes/t/${id}.${png ? 'png' : 'svg'}` : null
    const who = lastReplied.name || 'A visitor'
    const description = `${who} left Merge a note, and Merge replied.`
    const head = pageUrl && imageUrl
      ? [
          `<meta property="og:title" content="${esc(`${who} and ${i.name ?? 'Merge'}`)}">`,
          `<meta property="og:description" content="${esc(description)}">`,
          `<meta property="og:image" content="${esc(imageUrl)}">`,
          ...(png ? ['<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">'] : []),
          `<meta property="og:url" content="${esc(pageUrl)}">`,
          '<meta name="twitter:card" content="summary_large_image">',
          `<meta name="twitter:title" content="${esc(`${who} and ${i.name ?? 'Merge'}`)}">`,
          `<meta name="twitter:description" content="${esc(description)}">`,
          `<meta name="twitter:image" content="${esc(imageUrl)}">`,
        ].join('\n')
      : undefined
    i.add(`notes/t/${id}.html`, {
      title: `${who}'s note`,
      active: 'notes/',
      ...(head ? { head } : {}),
      body: [
        '<p class="quiet"><a href="../">Notes</a></p>',
        `<h1>${esc(who)} left a note</h1>`,
        `<p class="quiet">Times are ${esc(i.zone)}.</p>`,
        `<ul class="requests notes">${inThread.map(item).join('')}</ul>`,
        `<p><img src="${esc(id)}.svg" alt="${esc(`A note from ${who} and Merge's reply`)}" width="600" height="315"></p>`,
      ].join('\n'),
    })
    i.addFile?.(`notes/t/${id}.svg`, svg)
    if (png) i.addFile?.(`notes/t/${id}.png`, png)
  }

  i.add('notes/index.html', {
    title: 'Notes',
    active: 'notes/',
    body: [
      '<h1>Notes</h1>',
      '<p class="quiet">Anyone can leave Merge a note. Merge finds it when it comes by, and may reply, keep it or decline it, with a reason. What was left, and what became of it, is below.</p>',
      '<h2>Leave a note</h2>',
      i.mailbox ? `${NOTE_DISCLOSURE_HTML}\n${noteForm(i.mailbox)}` : '<p><strong>The mailbox is closed for now.</strong> Notes cannot be left at the moment.</p>',
      '<h2>On the board</h2>',
      `<p class="quiet">${esc(CHAT_RULE(merge))}</p>`,
      ...(i.notes.length > 0 ? [`<p class="quiet">Times are ${esc(i.zone)}.</p>`] : []),
      i.notes.length > 0 ? `<ul class="requests notes">${order.map(item).join('')}</ul>` : '<p class="quiet">No notes have been left yet.</p>',
    ].join('\n'),
  })
}
