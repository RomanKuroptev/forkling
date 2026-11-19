import { describe, expect, it } from 'vitest'
import { cutAtSentence } from '../src/cut-at-word.ts'

// Real diary lines from the R2 run (journal/2026-11-19.md, 2026-11-20.md, 2026-11-24.md) as they were stored: cut at a word at 140
// characters, in the middle of a sentence (issue #378). Each gets a few words of plausible continuation so it is over 140 again.
const R2_HILLSIDE = 'I sketched the hillside again and put it in the Five Lamps room. Still no check against my terrain notes. A cat polishing a map it never walked.'
const R2_LAMPS = 'The Five Lamps room is finished. I looked inside, rewrote one label, and still have not checked the hillside sketch against my terrain notes from last week.'
const R2_BENCH = "I read vfx-js and when-do-rules, and built the Live Line Scheduler and the Patch Bench. The scheduler's lines are faked, and the bench was never clicked."
const R2_NO_STOP = 'I read about live coding, patching, algorave and esoteric languages and kept going from one page to the next without ever stopping for a breath'

describe('cutAtSentence (a diary line never ends in the middle of a sentence)', () => {
  it('leaves a text that fits alone', () => {
    expect(cutAtSentence('Tired day. I napped.', 140)).toBe('Tired day. I napped.')
    expect(cutAtSentence('x'.repeat(140), 140)).toBe('x'.repeat(140))
  })

  it('cuts a real R2 line at its last whole sentence, not at 140 characters in the middle of one', () => {
    expect(R2_HILLSIDE.length).toBeGreaterThan(140)
    expect(cutAtSentence(R2_HILLSIDE, 140)).toBe('I sketched the hillside again and put it in the Five Lamps room. Still no check against my terrain notes.')
    expect(cutAtSentence(R2_BENCH, 140)).toBe('I read vfx-js and when-do-rules, and built the Live Line Scheduler and the Patch Bench.')
  })

  it('ends at a word with an ellipsis when the last sentence end would keep less than half the line', () => {
    const cut = cutAtSentence(R2_LAMPS, 140)
    expect(cut.length).toBeLessThanOrEqual(140)
    expect(cut.endsWith('…')).toBe(true)
    expect(R2_LAMPS.startsWith(cut.slice(0, -1))).toBe(true)
    expect(R2_LAMPS[cut.length - 1]).toBe(' ')
  })

  it('ends at a word with an ellipsis when there is no sentence end at all', () => {
    const cut = cutAtSentence(R2_NO_STOP, 140)
    expect(cut.length).toBeLessThanOrEqual(140)
    expect(cut).toBe('I read about live coding, patching, algorave and esoteric languages and kept going from one page to the next without ever stopping for a…')
  })

  it('takes a question mark as a sentence end, and keeps a closing quote with its sentence', () => {
    const q = `Was the lamp ever really on, or did I only want it on when someone looked? The bench said "wait." ${'and then more words '.repeat(3)}`
    expect(cutAtSentence(q, 140)).toBe('Was the lamp ever really on, or did I only want it on when someone looked? The bench said "wait."')
    const r = `Was the lamp ever really on, or did I only want it on when someone looked by the door at night? ${'and then more words '.repeat(3)}`
    expect(cutAtSentence(r, 140)).toBe('Was the lamp ever really on, or did I only want it on when someone looked by the door at night?')
  })

  it('does not take a decimal point for a sentence end', () => {
    const t = `The terrain grid is 0.5 metres a cell and the canopy grid is 1.0 metres a cell and both of them are kept beside the shelf ${'and more words '.repeat(3)}`
    expect(cutAtSentence(t, 140).endsWith('…')).toBe(true)
  })
})
