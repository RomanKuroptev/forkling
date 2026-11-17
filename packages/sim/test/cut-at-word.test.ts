import { describe, expect, it } from 'vitest'
import { cutAtWord } from '../src/cut-at-word.ts'

describe('cutAtWord', () => {
  it('leaves a text that fits alone, apart from the spaces at its ends', () => {
    expect(cutAtWord('Nine days of fog.', 120)).toBe('Nine days of fog.')
    expect(cutAtWord('  padded  ', 20)).toBe('padded')
    expect(cutAtWord('x'.repeat(24), 24)).toBe('x'.repeat(24))
  })

  it('cuts a long text at the last space that fits, never in the middle of a word', () => {
    const text = 'The fog sat on the harbour for nine days and nobody could say where the boats went'
    const cut = cutAtWord(text, 40)
    expect(cut.length).toBeLessThanOrEqual(40)
    expect(text.startsWith(cut)).toBe(true)
    expect(cut).toBe('The fog sat on the harbour for nine days')
    expect(text[cut.length]).toBe(' ')
  })

  it('drops a comma or a dash the cut leaves hanging at the end', () => {
    expect(cutAtWord('one two three, four five', 14)).toBe('one two three')
    expect(cutAtWord('alpha beta - gamma delta', 12)).toBe('alpha beta')
  })

  it('cuts a single long word at the limit, since there is no space to go back to', () => {
    expect(cutAtWord('abcdefghijklmnop', 10)).toBe('abcdefghij')
  })

  it('is 120 characters or fewer for a label that was 131 (the one that failed on 16 November)', () => {
    const label = `${'word '.repeat(26)}word`
    expect(label.length).toBeGreaterThan(120)
    const cut = cutAtWord(label, 120)
    expect(cut.length).toBeLessThanOrEqual(120)
    expect(cut.endsWith('word')).toBe(true)
  })
})
