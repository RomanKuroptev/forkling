import { describe, expect, it } from 'vitest'
import type { Reflection } from '@forkling/schema'
import { renderJournal, renderSummary } from '../src/reflect.ts'

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
