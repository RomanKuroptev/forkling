import { Note } from '@forkling/schema'
import { feedTopic, findReason, foldName, hiddenVisitor, recordVisitor, threadNotes, threadOf, threadState } from '@forkling/sim'
import { creativeModel } from '../budget.ts'
import { clampText } from '../decision.ts'
import { claimsHuman } from '../honesty.ts'
import { buildReplyUser, REPLY_MAX_TOKENS, ReplyAnswer } from '../prompts/reply.ts'
import type { Tick } from './context.ts'
import { rememberScored } from './importance.ts'
import { placeIds } from './plan.ts'
import { failWant } from './wants.ts'

const MAX_WAITING = 20
const MAX_REPLY_CHARS = 600
const MAX_DECLINE_CHARS = 80
const RECENT_REPLIES = 3
const MAX_ABOUT_CHARS = 200

const placeName = (t: Pick<Tick, 'places'>, id: string): string => t.places.find((p) => p.id === id)?.name ?? id

/**
 * Finds the notes Merge comes upon (spec 10.1): a note is found when its current step is at the note's place, when a thought
 * tick happens in the same place, at wake for a note at Home, or by itself after 6 waking hours. Finding is code only, never a
 * model call, and never while asleep. A found note is a note that happened: it goes in the stream at importance 4, it moves one
 * of its topics by +6 (once, spec 3.1), and it waits for a decide call to be shown it (the `note` trigger, spec 2.3). The note's
 * text is never anything but data: this step has no way to be told what to do by it.
 */
export function findNotes(t: Tick, opts: { thought?: boolean } = {}): void {
  if (t.asleep || t.visitorNotes.length === 0) return
  const here = new Set(placeIds(t))
  const target = t.goals.now ? t.goals.today?.steps[t.goals.now.index]?.targetId : undefined
  const stepPlaceId = target && here.has(target) ? target : null
  const justWoke = t.forkling.asleep && !t.asleep
  for (const note of t.visitorNotes) {
    const reason = findReason(note, { nowMs: t.nowMs, stepPlaceId, thoughtPlaceId: opts.thought ? stepPlaceId : null, justWoke, sleep: t.sleepOpts })
    if (!reason) continue
    const updated = Note.parse({ ...note, status: 'found', foundAt: t.nowIso })
    t.noteUpdates.push(updated)
    t.visitorNotes = t.visitorNotes.map((n) => (n.id === note.id ? updated : n))
    // Spec v4 7: a note with a name is remembered by that name; one with none is not.
    t.visitors = recordVisitor(t.visitors, { name: note.name, at: t.nowIso })
    rememberScored(t, { at: t.nowIso, kind: 'note', text: clampText(`Found a note at ${placeName(t, note.placeId)}: "${note.message}"`, 300) }, 'noteFound')
    const topic = note.topics[0]
    if (topic) {
      t.interests = feedTopic(t.interests, { topic, event: 'note', trail: `note:${note.id}`, source: { id: `note:${note.id}`, title: 'a note from a visitor', url: '', at: t.nowIso }, nowIso: t.nowIso })
    }
    t.mind.notesWaiting = [...(t.mind.notesWaiting ?? []), note.id].slice(-MAX_WAITING)
    t.parts.push('found a note')
  }
}

/**
 * A reply step has run its time (spec 10.1, 9.9): one Sonnet call (Haiku when the month is nearly spent) reads the note, as data, and Merge writes back once, declines with
 * a reason of up to 80 characters, or keeps it. Code keeps what is allowed: only a note that was found and not answered can be
 * answered, a reply is up to 600 characters and never claims to be human, and a decline needs a reason. Nothing it reads can
 * change what code does with the answer. A call that fails leaves the note found, for another time.
 */
export async function replyStep(t: Tick): Promise<void> {
  const pending = t.pendingReply
  if (!pending) return
  const { step } = pending
  const note = t.visitorNotes.find((n) => n.id === step.targetId && n.status === 'found')
  if (!note) {
    t.notes.push(`reply: there is no note to answer (${step.targetId ?? 'no target'}), so it rested`)
    t.remember.push({ at: t.nowIso, kind: 'event', text: 'There was no note to answer, so I rested.', verb: 'reply', engine: true })
    return
  }
  // Spec v4 7: a thread closes after Merge's 3rd reply. Intake never lets such an answer in, so this is only a plain skip, not a plan check.
  if (!threadState(t.visitorNotes, threadOf(note), t.nowMs).open) {
    t.notes.push(`reply: the thread is closed (${note.id}), so it rested`)
    t.remember.push({ at: t.nowIso, kind: 'event', text: 'That note belongs to a thread that is closed, so I rested.', verb: 'reply', engine: true })
    return
  }
  const recent = t.visitorNotes
    .filter((n) => n.status === 'replied' && n.reply)
    .slice(-RECENT_REPLIES)
    .map((n) => clampText(n.reply!, 120))
  const key = foldName(note.name)
  const entry = key && !hiddenVisitor(key, t.w.notesHidden) ? t.visitors.visitors[key] : undefined
  const before = threadNotes(t.visitorNotes, threadOf(note)).filter((n) => n.id !== note.id && n.at < note.at)
  const user = buildReplyUser({
    note: { id: note.id, place: placeName(t, note.placeId), name: note.name, message: note.message },
    reason: clampText(step.reason, 200),
    recent,
    visitor: entry ? { name: entry.name, notes: entry.notes, firstSeen: entry.firstSeen, about: entry.about } : null,
    thread: before.map((n) => ({ name: n.name, message: clampText(n.message, 500), reply: n.reply ? clampText(n.reply, MAX_REPLY_CHARS) : null })),
    threadReplies: before.filter((n) => n.status === 'replied').length,
  })
  const result = await t.ask('reply', creativeModel(t.budget), user, ReplyAnswer, REPLY_MAX_TOKENS)
  const answer = ReplyAnswer.safeParse(result?.parsed)
  if (!result || !answer.success) {
    t.notes.push('reply: no usable answer, so the note stays to answer another time')
    failWant(t, step.wantId)
    return
  }

  const a = answer.data
  let updated: Note
  let line: string
  if (a.action === 'reply') {
    const text = a.reply?.trim() ?? ''
    if (!text) return void t.notes.push('reply: the reply was empty, so the note stays')
    if (claimsHuman(text)) return void t.notes.push('claim dropped, reply: it claimed to be human, so the note stays')
    updated = Note.parse({ ...note, status: 'replied', reply: clampText(text, MAX_REPLY_CHARS) })
    // Merge's own line about the visitor (spec v4 7), kept with the entry; text that claims to be human is dropped.
    const about = a.about?.trim() ?? ''
    if (about && key && t.visitors.visitors[key] && !claimsHuman(about)) {
      t.visitors = { visitors: { ...t.visitors.visitors, [key]: { ...t.visitors.visitors[key]!, about: clampText(about, MAX_ABOUT_CHARS) } } }
    }
    line = `Replied to a note at ${placeName(t, note.placeId)}.`
  } else if (a.action === 'decline') {
    const why = a.reason?.trim() ?? ''
    if (!why) return void t.notes.push('reply: a decline needs a reason, so the note stays')
    if (claimsHuman(why)) return void t.notes.push('claim dropped, decline reason: it claimed to be human, so the note stays')
    updated = Note.parse({ ...note, status: 'declined', declineReason: clampText(why, MAX_DECLINE_CHARS) })
    line = `Declined a note at ${placeName(t, note.placeId)}: ${updated.declineReason}`
  } else {
    updated = Note.parse({ ...note, status: 'kept' })
    line = `Kept a note at ${placeName(t, note.placeId)}.`
  }

  t.noteUpdates.push(updated)
  t.visitorNotes = t.visitorNotes.map((n) => (n.id === note.id ? updated : n))
  t.mind.replies = { date: t.today, count: (t.mind.replies?.date === t.today ? t.mind.replies.count : 0) + 1 }
  t.remember.push({ at: t.nowIso, kind: 'made', text: clampText(line, 300), verb: 'reply', goalRef: `today:${pending.index}` })
  t.parts.push(a.action === 'reply' ? 'replied to a note' : a.action === 'decline' ? 'declined a note' : 'kept a note')
}
