import { describe, expect, it } from 'vitest'
import type { Belief, Reflection, StreamEntry } from '@forkling/schema'
import { buildMemoryUser, buildReflectionUser, renderJournal, renderSummary, MAX_STREAM_LINES } from '../src/reflect.ts'

const entry = (n: number, over: Partial<StreamEntry> = {}): StreamEntry => ({
  id: `2026-11-03#${n}`,
  at: '2026-11-03T09:00:00Z',
  kind: 'step',
  text: `thing ${n}`,
  ...over,
})

const belief: Belief = {
  id: 'b1',
  statement: 'The pond is calm.',
  confidence: 0.6,
  evidence: ['2026-11-02#3'],
  formedAt: '2026-11-02T20:00:00Z',
  status: 'active',
  history: [],
}

const base = {
  name: 'Merge',
  date: '2026-11-03',
  localTime: 'Tuesday 2026-11-03 22:35',
  timeZone: 'Europe/Stockholm',
  goals: { long: { text: 'Make the sunny rock mine.', reason: 'Warm.', setAt: '2026-11-03T06:00:00Z', reviewedAt: '2026-11-03T06:00:00Z' } },
  beliefs: [belief],
  summary: '## Running jokes\nThe tall rock is my enemy.',
  stream: [entry(1), entry(2, { kind: 'made', text: 'Finished a clay cup.' })],
}

describe('buildReflectionUser', () => {
  const user = buildReflectionUser(base)

  it('lists the day by id, local clock time and kind, so a paragraph can cite it', () => {
    expect(user).toContain('2026-11-03#2')
    expect(user).toContain('[made] Finished a clay cup.')
    expect(user).toMatch(/2026-11-03#1 10:00 \[step\] thing 1/)
  })

  it('shows its beliefs with ids and how sure it is, and its memory', () => {
    expect(user).toContain('b1 (0.6): The pond is calm.')
    expect(user).toContain('The tall rock is my enemy.')
  })

  it('leaves out beliefs it has dropped', () => {
    expect(buildReflectionUser({ ...base, beliefs: [{ ...belief, status: 'dropped' }] })).not.toContain('The pond is calm.')
  })

  it('asks for citations and honesty in the task', () => {
    expect(user).toMatch(/refs/)
    expect(user).toMatch(/only what the stream/i)
  })

  it('keeps only the latest lines of a very long day', () => {
    const long = Array.from({ length: MAX_STREAM_LINES + 50 }, (_, i) => entry(i + 1))
    const out = buildReflectionUser({ ...base, stream: long })
    expect(out).not.toContain('2026-11-03#1 ')
    expect(out).toContain(`2026-11-03#${MAX_STREAM_LINES + 50} `)
  })

  it('says so when the day was empty', () => {
    expect(buildReflectionUser({ ...base, stream: [] })).toMatch(/nothing was recorded/i)
  })

  it('adds the reasons an earlier try was turned down', () => {
    expect(buildReflectionUser({ ...base, turnedDown: ['journal: "I flew" cites nothing'] })).toContain('I flew')
  })
})

describe('renderJournal', () => {
  const reflection: Reflection = {
    journal: { title: 'A clay day', paragraphs: [{ text: 'I made a cup.', refs: ['2026-11-03#2'] }, { text: 'It was warm.', refs: ['2026-11-03#1'] }] },
    beliefOps: [],
  }

  it('is a dated heading and one paragraph per claim', () => {
    expect(renderJournal('2026-11-03', reflection)).toBe('# A clay day\n\n*2026-11-03*\n\nI made a cup.\n\nIt was warm.\n')
  })

  it('does not cite stream ids in the text, which readers do not need', () => {
    expect(renderJournal('2026-11-03', reflection)).not.toContain('#2')
  })

  it('returns null when no paragraph survived', () => {
    expect(renderJournal('2026-11-03', { journal: { title: 'x', paragraphs: [] }, beliefOps: [] })).toBeNull()
  })
})

describe('buildMemoryUser', () => {
  it('gives the old memory, tonight journal and the beliefs, and asks for twelve slots with one for jokes', () => {
    const user = buildMemoryUser({ summary: 'old memory', journal: '# A clay day\n\nI made a cup.', beliefs: [belief], date: '2026-11-03' })
    expect(user).toContain('old memory')
    expect(user).toContain('I made a cup.')
    expect(user).toContain('b1 (0.6): The pond is calm.')
    expect(user).toMatch(/12 slots/)
    expect(user).toMatch(/running jokes/i)
  })

  it('copes with a night with no journal', () => {
    expect(buildMemoryUser({ summary: 'old', journal: null, beliefs: [], date: '2026-11-03' })).toMatch(/no journal/i)
  })
})

describe('renderSummary', () => {
  it('writes each slot as a titled section, at most twelve', () => {
    const slots = Array.from({ length: 15 }, (_, i) => ({ title: `Slot ${i + 1}`, text: `text ${i + 1}` }))
    const out = renderSummary({ slots })!
    expect(out.match(/^## /gm)).toHaveLength(12)
    expect(out).toContain('## Slot 1\ntext 1')
    expect(out).not.toContain('Slot 13')
  })

  it('skips empty slots', () => {
    expect(renderSummary({ slots: [{ title: 'a', text: ' ' }, { title: 'b', text: 'kept' }] })).toBe('## b\nkept\n')
  })

  it('returns null when nothing is left, so the old memory stays', () => {
    expect(renderSummary({ slots: [] })).toBeNull()
  })
})
