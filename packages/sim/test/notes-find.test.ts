import { describe, expect, it } from 'vitest'
import type { Note } from '@forkling/schema'
import { NOTE_AUTO_FIND_WAKING_MS, NOTE_TRIGGER_GAP_MS, findReason, noteTriggerDue, visibleNotes } from '../src/notes-find.ts'
import { sleepWindow } from '../src/sleep.ts'

const opts = { seed: 7, timezone: 'Europe/Stockholm' }
const day = '2026-11-16'
const window = sleepWindow(day, opts.seed, opts.timezone)
const wake = window.wakeMs
const HOUR = 3_600_000

const note = (over: Partial<Note> = {}): Note => ({ id: 'n1', name: '', message: 'hello', placeId: 'workshop', at: new Date(wake + HOUR).toISOString(), topics: [], status: 'new', foundAt: null, reply: null, declineReason: null, ...over })
const ctx = (over: object = {}) => ({ nowMs: wake + 2 * HOUR, stepPlaceId: null, thoughtPlaceId: null, justWoke: false, sleep: opts, ...over })

describe('findReason (spec 10.1, decision 1: within 10 m is the same place)', () => {
  it('a note is not found by itself', () => expect(findReason(note(), ctx())).toBeNull())
  it('found when the current step is at its place', () => expect(findReason(note(), ctx({ stepPlaceId: 'workshop' }))).toBe('step'))
  it('not found when the step is somewhere else', () => expect(findReason(note(), ctx({ stepPlaceId: 'home' }))).toBeNull())
  it('found when a thought tick happens in its place', () => expect(findReason(note(), ctx({ thoughtPlaceId: 'workshop' }))).toBe('thought'))
  it('found at wake if it is at home', () => {
    expect(findReason(note({ placeId: 'home' }), ctx({ justWoke: true }))).toBe('wake')
    expect(findReason(note({ placeId: 'workshop' }), ctx({ justWoke: true }))).toBeNull()
  })
  it('found by itself after 6 waking hours', () => {
    expect(NOTE_AUTO_FIND_WAKING_MS).toBe(6 * HOUR)
    const n = note({ at: new Date(wake).toISOString() })
    expect(findReason(n, ctx({ nowMs: wake + 6 * HOUR - 1 }))).toBeNull()
    expect(findReason(n, ctx({ nowMs: wake + 6 * HOUR }))).toBe('timeout')
  })
  it('the night does not count toward the 6 hours', () => {
    const n = note({ at: new Date(window.bedMs - HOUR).toISOString() })
    expect(findReason(n, ctx({ nowMs: window.bedMs + 8 * HOUR }))).toBeNull()
  })
  it('a note already found is not found again', () => {
    expect(findReason(note({ status: 'found', foundAt: new Date(wake).toISOString() }), ctx({ stepPlaceId: 'workshop' }))).toBeNull()
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
