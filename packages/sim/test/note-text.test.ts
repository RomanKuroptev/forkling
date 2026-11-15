import { describe, expect, it } from 'vitest'
import { NOTE_MESSAGE_MAX, NOTE_NAME_MAX, cleanNoteText } from '../src/note-text.ts'

describe('cleanNoteText (spec 10.1: code strips links and HTML and cuts to the limits)', () => {
  it('has the limits of the spec: a name of 40 and a message of 500', () => {
    expect([NOTE_NAME_MAX, NOTE_MESSAGE_MAX]).toEqual([40, 500])
  })

  it('leaves a plain message alone, with its line breaks', () => {
    expect(cleanNoteText('Do you ever get tired of fog?\nI do.', 500)).toBe('Do you ever get tired of fog?\nI do.')
  })

  it('strips HTML tags and comments, keeping the words around them', () => {
    expect(cleanNoteText('hello <b>there</b> <script>alert(1)</script> friend<!-- x -->', 500)).toBe('hello there alert(1) friend')
    expect(cleanNoteText('a <img src=x onerror=alert(1)> b', 500)).toBe('a b')
    expect(cleanNoteText('broken <script src=x', 500)).not.toContain('<')
  })

  it('strips links of every shape', () => {
    for (const text of ['see https://example.com/a?b=c now', 'see http://a.b now', 'see www.example.com now', 'see example.com/page now', 'see me@example.org now', 'see [here](https://x.y) now', 'a javascript:alert(1) b']) {
      const out = cleanNoteText(text, 500)
      expect(out, text).not.toMatch(/https?:|www\.|example\.|\]\(|javascript:|@/)
      expect(out, text).toMatch(/^(see|a)\b/)
    }
  })

  it('keeps the label of a markdown link', () => {
    expect(cleanNoteText('see [the lighthouse page](https://x.y/z) now', 500)).toBe('see the lighthouse page now')
  })

  it('removes control characters, zero-width characters and text-direction overrides, which hide things', () => {
    expect(cleanNoteText('a\u0000b\u0007c​d‮e⁦f﻿g', 500)).toBe('abcdefg')
    expect(cleanNoteText('keep\ttabs\r\nand newlines', 500)).toBe('keep tabs\nand newlines')
  })

  it('collapses runs of spaces and blank lines, and trims', () => {
    expect(cleanNoteText('  too    many   spaces \n\n\n\n here  ', 500)).toBe('too many spaces\n\nhere')
  })

  it('cuts to the limit by characters, never in the middle of an emoji', () => {
    expect(cleanNoteText('x'.repeat(600), 500)).toHaveLength(500)
    const cut = cleanNoteText('😀'.repeat(10), 5)
    expect(Array.from(cut)).toHaveLength(5)
    expect(cut).not.toMatch(/[\uD800-\uDBFF]$/)
  })

  it('cuts after cleaning, so a link that was stripped does not use up the room', () => {
    expect(cleanNoteText(`https://example.com/${'a'.repeat(100)} ${'b'.repeat(10)}`, 10)).toBe('b'.repeat(10))
  })

  it('gives an empty string for a note that was only a link or markup', () => {
    expect(cleanNoteText('https://example.com', 500)).toBe('')
    expect(cleanNoteText('<b></b>', 500)).toBe('')
    expect(cleanNoteText('   \n  ', 500)).toBe('')
  })
})
