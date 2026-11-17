import { describe, expect, it } from 'vitest'
import type { Note } from '@forkling/schema'
import { THREAD_IDLE_DAYS, THREAD_MAX_REPLIES, canAnswer, threadOf, threadState } from '../src/note-thread.ts'
import { visibleNotes } from '../src/notes-find.ts'

const DAY = 86_400_000
const t0 = Date.parse('2026-11-16T10:00:00Z')
const iso = (ms: number) => new Date(ms).toISOString()
const note = (id: string, over: Partial<Note> = {}): Note => ({ id, name: '', message: 'hi', placeId: 'home', at: iso(t0), topics: [], status: 'new', foundAt: null, reply: null, declineReason: null, position: null, ...over })
const replied = (id: string, at: number, over: Partial<Note> = {}) => note(id, { at: iso(at), status: 'replied', foundAt: iso(at + 60_000), reply: 'ok', ...over })

describe('threadOf', () => {
  it('an old note is its own thread', () => expect(threadOf(note('a'))).toBe('a'))
  it('an answer carries its thread', () => expect(threadOf(note('b', { thread: 'a', replyTo: 'a' }))).toBe('a'))
})

describe('threadState', () => {
  it('a fresh note with no reply is open with 0 replies', () => {
    expect(threadState([note('a')], 'a', t0 + 1000)).toMatchObject({ open: true, replies: 0, newestId: 'a' })
  })
  it('counts replies and finds the newest note', () => {
    const notes = [replied('a', t0), replied('b', t0 + DAY, { thread: 'a', replyTo: 'a' })]
    expect(threadState(notes, 'a', t0 + 2 * DAY)).toMatchObject({ open: true, replies: 2, newestId: 'b' })
  })
  it('closes after the 3rd reply', () => {
    expect(THREAD_MAX_REPLIES).toBe(3)
    const notes = [replied('a', t0), replied('b', t0 + DAY, { thread: 'a', replyTo: 'a' }), replied('c', t0 + 2 * DAY, { thread: 'a', replyTo: 'b' })]
    expect(threadState(notes, 'a', t0 + 2 * DAY + 1000)).toMatchObject({ open: false, closedBy: 'replies' })
  })
  it('closes 14 days after the newest note, not before', () => {
    expect(THREAD_IDLE_DAYS).toBe(14)
    const notes = [replied('a', t0)]
    expect(threadState(notes, 'a', t0 + 13 * DAY).open).toBe(true)
    expect(threadState(notes, 'a', t0 + 15 * DAY)).toMatchObject({ open: false, closedBy: 'idle' })
  })
  it('an unknown thread is closed', () => expect(threadState([], 'zz', t0).open).toBe(false))
})

describe('canAnswer (what POST /notes checks)', () => {
  const a = replied('a', t0)
  it('accepts an answer to the newest replied note of an open thread', () => expect(canAnswer([a], 'a', t0 + DAY)).toEqual({ ok: true, thread: 'a' }))
  it('refuses a note that does not exist', () => expect(canAnswer([a], 'nope', t0)).toMatchObject({ ok: false }))
  it('refuses a note Merge has not replied to', () => expect(canAnswer([note('a')], 'a', t0)).toMatchObject({ ok: false }))
  it('refuses a note that is not the newest in its thread', () => {
    const notes = [a, replied('b', t0 + DAY, { thread: 'a', replyTo: 'a' })]
    expect(canAnswer(notes, 'a', t0 + 2 * DAY)).toMatchObject({ ok: false })
  })
  it('refuses a closed thread', () => expect(canAnswer([a], 'a', t0 + 20 * DAY)).toMatchObject({ ok: false }))
})

describe('a hidden note hides its thread', () => {
  it('the rest of the thread goes with it', () => {
    const notes = [replied('a', t0), replied('b', t0 + DAY, { thread: 'a', replyTo: 'a' }), note('z')]
    expect(visibleNotes(notes, { hidden: ['b'] }).map((n) => n.id)).toEqual(['z'])
  })
})
