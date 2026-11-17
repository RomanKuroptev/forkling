import { describe, expect, it } from 'vitest'
import type { Note } from '@forkling/schema'
import { inspiredByFrom, NOTE_AUTO_FIND_WAKING_MS, NOTE_REPLY_OVERDUE_MS, NOTE_TRIGGER_GAP_MS, findReason, noteTriggerDue, overdueNotes, visibleNotes } from '../src/notes-find.ts'
import { sleepWindow } from '../src/sleep.ts'

const opts = { seed: 7, timezone: 'Europe/Stockholm' }
const day = '2026-11-16'
const window = sleepWindow(day, opts.seed, opts.timezone)
const wake = window.wakeMs
const HOUR = 3_600_000

const note = (over: Partial<Note> = {}): Note => ({ id: 'n1', name: '', message: 'hello', placeId: 'workshop', at: new Date(wake + HOUR).toISOString(), topics: [], status: 'new', foundAt: null, reply: null, declineReason: null, position: null, ...over })
const ctx = (over: object = {}) => ({ nowMs: wake + HOUR + 30 * 60_000, stepPlaceId: null, thoughtPlaceId: null, justWoke: false, sleep: opts, ...over })

describe('findReason (spec 10.1, decision 1: within 10 m is the same place)', () => {
  it('a note is not found by itself', () => expect(findReason(note(), ctx())).toBeNull())
  it('found when the current step is at its place', () => expect(findReason(note(), ctx({ stepPlaceId: 'workshop' }))).toBe('step'))
  it('not found when the step is somewhere else', () => expect(findReason(note(), ctx({ stepPlaceId: 'home' }))).toBeNull())
  it('found when a thought tick happens in its place', () => expect(findReason(note(), ctx({ thoughtPlaceId: 'workshop' }))).toBe('thought'))
  it('found at wake if it is at home', () => {
    expect(findReason(note({ placeId: 'home' }), ctx({ justWoke: true }))).toBe('wake')
    expect(findReason(note({ placeId: 'workshop' }), ctx({ justWoke: true }))).toBeNull()
  })
  it('found by itself after 1 waking hour (spec 16: found and answered or marked within 1 waking hour; it was 6, and a note at Home waited from 10:28 to 15:48)', () => {
    expect(NOTE_AUTO_FIND_WAKING_MS).toBe(HOUR)
    const n = note({ at: new Date(wake).toISOString() })
    expect(findReason(n, ctx({ nowMs: wake + HOUR - 1 }))).toBeNull()
    expect(findReason(n, ctx({ nowMs: wake + HOUR }))).toBe('timeout')
  })
  it('the night does not count toward the hour', () => {
    const n = note({ at: new Date(window.bedMs - HOUR / 2).toISOString() })
    expect(findReason(n, ctx({ nowMs: window.bedMs + 8 * HOUR }))).toBeNull()
    expect(findReason(n, ctx({ nowMs: window.wakeMs + 24 * HOUR + 2 * HOUR }))).toBe('timeout')
  })
  it('a note already found is not found again', () => {
    expect(findReason(note({ status: 'found', foundAt: new Date(wake).toISOString() }), ctx({ stepPlaceId: 'workshop' }))).toBeNull()
  })
})

describe('overdueNotes (a found note waits at most 3 hours for its reply step before a plan must make room for it)', () => {
  const found = (id: string, hoursAgo: number, over: Partial<Note> = {}) => note({ id, status: 'found', foundAt: new Date(wake + 10 * HOUR - hoursAgo * HOUR).toISOString(), ...over })
  const now = wake + 10 * HOUR

  it('lists the found notes that have waited 3 hours or more, oldest first', () => {
    expect(NOTE_REPLY_OVERDUE_MS).toBe(3 * HOUR)
    expect(overdueNotes([found('new', 1), found('old', 5), found('edge', 3)], now)).toEqual(['old', 'edge'])
  })

  it('leaves out notes already answered, declined or kept, and notes that were never found', () => {
    expect(overdueNotes([found('a', 9, { status: 'replied' }), found('b', 9, { status: 'declined' }), found('c', 9, { status: 'kept' }), note({ id: 'd' }), found('e', 9, { foundAt: null })], now)).toEqual([])
  })
})

describe('visibleNotes (a hidden note disappears, spec 10.1)', () => {
  it('removes every id in the hidden list', () => {
    const notes = [note({ id: 'a' }), note({ id: 'b' }), note({ id: 'c' })]
    expect(visibleNotes(notes, { hidden: ['b'] }).map((n) => n.id)).toEqual(['a', 'c'])
    expect(visibleNotes(notes, { hidden: [] })).toHaveLength(3)
  })
})

describe('noteTriggerDue (spec 2.3: once every 30 minutes)', () => {
  it('needs a found note, and 30 minutes since the last one', () => {
    expect(NOTE_TRIGGER_GAP_MS).toBe(30 * 60_000)
    expect(noteTriggerDue({ foundCount: 0, lastMs: null, nowMs: 1e9 })).toBe(false)
    expect(noteTriggerDue({ foundCount: 1, lastMs: null, nowMs: 1e9 })).toBe(true)
    expect(noteTriggerDue({ foundCount: 2, lastMs: 1e9 - NOTE_TRIGGER_GAP_MS + 1, nowMs: 1e9 })).toBe(false)
    expect(noteTriggerDue({ foundCount: 2, lastMs: 1e9 - NOTE_TRIGGER_GAP_MS, nowMs: 1e9 })).toBe(true)
  })
})

describe('inspiredByFrom (spec v4 7)', () => {
  const notes = [note({ id: 'n-2026-11-16-aaaaaa', name: 'Anna' }), note({ id: 'n-2026-11-16-bbbbbb', name: '' })]
  it('credits the visible note a reason names, with its name', () => {
    expect(inspiredByFrom('Anna asked about fog in n-2026-11-16-aaaaaa, so I made a fog thing.', notes)).toEqual({ noteId: 'n-2026-11-16-aaaaaa', name: 'Anna' })
  })
  it('keeps an empty name', () => expect(inspiredByFrom('after n-2026-11-16-bbbbbb', notes)).toEqual({ noteId: 'n-2026-11-16-bbbbbb', name: '' }))
  it('credits nothing for an id that is not a visible note, or for no id', () => {
    expect(inspiredByFrom('after n-2026-11-16-cccccc', notes)).toBeNull()
    expect(inspiredByFrom('I just felt like it', notes)).toBeNull()
  })
})
