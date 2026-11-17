import { Note } from '@forkling/schema'
import { describe, expect, it } from 'vitest'
import { CLOSED_THREAD_TEXT, threadView } from '../src/ui/threadView.ts'

const NOW = Date.parse('2026-11-17T12:00:00Z')
const note = (id: string, at: string, over: Record<string, unknown> = {}) =>
  Note.parse({ id, name: 'Ann', message: `message ${id}`, placeId: 'home', at, topics: [], status: 'new', ...over })
const replied = (id: string, at: string, over: Record<string, unknown> = {}) => note(id, at, { status: 'replied', foundAt: '2026-11-16T20:00:00Z', reply: `reply to ${id}`, ...over })

describe('the thread in the note panel', () => {
  it('shows the notes of a thread oldest first, and says which one answers', () => {
    const first = replied('n-1', '2026-11-16T09:00:00Z')
    const second = replied('n-2', '2026-11-17T09:00:00Z', { thread: 'n-1', replyTo: 'n-1' })
    const other = note('n-3', '2026-11-17T10:00:00Z')
    const v = threadView([second, other, first], first, NOW)
    expect(v.items.map((i) => i.note.id)).toEqual(['n-1', 'n-2'])
    expect(v.items.map((i) => i.verb)).toEqual(['left this', 'answered'])
    expect(v.items[0]!.fate.lead).toBe('Merge replied:')
  })

  it('offers "Answer" under the newest reply of an open thread, and nowhere else', () => {
    const first = replied('n-1', '2026-11-16T09:00:00Z')
    const second = replied('n-2', '2026-11-17T09:00:00Z', { thread: 'n-1', replyTo: 'n-1' })
    expect(threadView([first, second], first, NOW).answerTo).toBe('n-2')
    expect(threadView([first], first, NOW).answerTo).toBe('n-1')
    // Merge has not replied yet: nothing to answer.
    expect(threadView([note('n-9', '2026-11-17T09:00:00Z')], note('n-9', '2026-11-17T09:00:00Z'), NOW).answerTo).toBeNull()
    const waiting = note('n-4', '2026-11-17T09:30:00Z', { thread: 'n-1', replyTo: 'n-2' })
    expect(threadView([first, second, waiting], first, NOW).answerTo).toBeNull()
  })

  it('says a thread is closed after the third reply or fourteen idle days', () => {
    const a = replied('n-1', '2026-11-10T09:00:00Z')
    const b = replied('n-2', '2026-11-11T09:00:00Z', { thread: 'n-1', replyTo: 'n-1' })
    const c = replied('n-3', '2026-11-12T09:00:00Z', { thread: 'n-1', replyTo: 'n-2' })
    const v = threadView([a, b, c], a, NOW)
    expect(v.answerTo).toBeNull()
    expect(v.closed).toBe(true)
    const old = replied('n-5', '2026-10-01T09:00:00Z', { foundAt: '2026-10-02T09:00:00Z' })
    expect(threadView([old], old, NOW).closed).toBe(true)
    expect(CLOSED_THREAD_TEXT).toMatch(/closed/)
  })

  it('shows a lone old note as a thread of one', () => {
    const lone = note('n-7', '2026-11-17T09:00:00Z')
    const v = threadView([lone], lone, NOW)
    expect(v.items).toHaveLength(1)
    expect(v.closed).toBe(false)
  })
})
