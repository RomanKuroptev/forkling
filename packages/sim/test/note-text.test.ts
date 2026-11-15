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

  describe('email addresses and phone numbers (ok notes go to a public repo)', () => {
    it('strips email addresses of every shape, keeping the words around them', () => {
      for (const email of ['me@example.org', 'first.last@sub.example.co.uk', 'name+tag@gmail.com', 'UPPER.Case@Example.COM', 'a_b-c@d-e.io', 'x@y.se']) {
        expect(cleanNoteText(`write to ${email} soon`, 500), email).toBe('write to soon')
        expect(cleanNoteText(`(${email}), or ${email}.`, 500), email).not.toContain('@')
      }
    })

    it('strips phone numbers written the usual ways', () => {
      for (const phone of ['070-123 45 67', '0701234567', '+46 70 123 45 67', '+46701234567', '(555) 123-4567', '555-123-4567', '555.123.4567', '+1 555 123 4567', '+44 20 7946 0958', '08-123 456 78', '070 123 45 67']) {
        const out = cleanNoteText(`call me on ${phone} after five`, 500)
        expect(out, phone).toBe('call me on after five')
      }
    })

    it('strips a number at the start or the end of a note, and several in one note', () => {
      expect(cleanNoteText('070-123 45 67 is mine', 500)).toBe('is mine')
      expect(cleanNoteText('mine is +46 70 123 45 67', 500)).toBe('mine is')
      expect(cleanNoteText('070-123 45 67 or 08-765 43 21', 500)).toBe('or')
    })

    it('keeps the numbers a note is allowed to have: dates, times, years, counts, versions and short numbers', () => {
      for (const text of ['on 2026-11-16 I saw fog', 'it was 11/16/2026 then', 'at 10:30 sharp', 'in 1999 it began', 'I have 3 cats and 12 hens', 'page 123 says so', 'about 1,000 of them', 'version 1.2.3 is out', 'a score of 123456', 'room 204', '16.11.2026 was cold', 'between 9-17 on weekdays']) {
        expect(cleanNoteText(text, 500), text).toBe(text)
      }
    })

    it('strips them from the name too, and a note that was only an email or a phone number becomes empty', () => {
      expect(cleanNoteText('Ann 070-123 45 67', 40)).toBe('Ann')
      expect(cleanNoteText('me@example.org', 500)).toBe('')
      expect(cleanNoteText('+46 70 123 45 67', 500)).toBe('')
    })

    it('cannot be got round by hiding characters inside the number or the address', () => {
      expect(cleanNoteText('0​70-123‮ 45 67 ok', 500)).toBe('ok')
      expect(cleanNoteText('me​@exam​ple.org ok', 500)).toBe('ok')
    })
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
