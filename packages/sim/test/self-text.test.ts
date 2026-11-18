import { describe, expect, it } from 'vitest'
import { fitCaption, ABOUT_CHANGE_DAYS, ABOUT_MAX_TRAITS, ABOUT_MAX_WORDS, CAPTION_WORDS, DIARY_LINES, DIARY_LINE_CHARS, PAGE_MAX_WORDS, REPLY_WORDS, REPLY_WORDS_KEPT, aboutChange, checkAbout, checkPage, fitDiaryLines, fitReply } from '../src/self-text.ts'

const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1} says something`).join('\n')

describe('checkAbout (spec v4 6: 80 words, 8 traits, one change a week)', () => {
  it('has the numbers of the spec', () => expect([ABOUT_MAX_WORDS, ABOUT_MAX_TRAITS, ABOUT_CHANGE_DAYS]).toEqual([80, 8, 6]))

  it('takes a first version freely, up to 80 words', () => {
    expect(checkAbout('', lines(10).split(' ').slice(0, 30).join(' ')).ok).toBe(true)
    expect(checkAbout('', Array(81).fill('w').join(' ')).ok).toBe(false)
    expect(checkAbout('', Array(80).fill('w').join(' ')).ok).toBe(true)
  })
  it('refuses an empty version', () => {
    expect(checkAbout(lines(5), '   ').ok).toBe(false)
  })
  it('refuses more than 8 traits in the list', () => {
    const traits = (n: number) => ['I like fog.', ...Array.from({ length: n }, (_, i) => `- trait ${i}`)].join('\n')
    expect(checkAbout('', traits(8)).ok).toBe(true)
    expect(checkAbout('', traits(9)).ok).toBe(false)
  })
  it('allows one change a week, whatever its size, and refuses a second inside 6 days', () => {
    const prev = lines(3)
    const next = 'something else entirely'
    expect(checkAbout(prev, next, { lastChangeDate: '2026-11-10', today: '2026-11-17' }).ok).toBe(true)
    // A review that ran a day late last week (Monday 16) does not block this Sunday's (22): 6 days apart is allowed.
    expect(checkAbout(prev, next, { lastChangeDate: '2026-11-16', today: '2026-11-22' }).ok).toBe(true)
    const r = checkAbout(prev, next, { lastChangeDate: '2026-11-17', today: '2026-11-22' })
    expect(r.ok).toBe(false)
    expect(r.reasons.join(' ')).toMatch(/one change a week/)
    expect(checkAbout(prev, next, { lastChangeDate: null, today: '2026-11-17' }).ok).toBe(true)
  })
  it('does not count sending the same text again as a change', () => {
    const prev = lines(3)
    expect(checkAbout(prev, prev, { lastChangeDate: '2026-11-16', today: '2026-11-17' }).ok).toBe(true)
  })
  it('measures a change as the larger of lines removed and lines added', () => {
    const prev = lines(10)
    expect(aboutChange(prev, prev)).toBe(0)
    expect(aboutChange(prev, `${prev}\nextra one\nextra two`)).toBeCloseTo(0.2)
    expect(aboutChange(prev, '')).toBe(1)
  })
  it('ignores blank lines and line endings when comparing', () => {
    const prev = lines(5)
    expect(aboutChange(prev, `${prev.replace(/\n/g, '\r\n')}\r\n\r\n`)).toBe(0)
  })
})

describe('checkPage (spec 9.7: 300 words, no links or HTML, one change a day)', () => {
  const ok = { prev: 'Old note to myself.', lastChangeDate: '2026-11-14', today: '2026-11-15' }
  it('takes plain text up to 300 words', () => {
    expect(PAGE_MAX_WORDS).toBe(300)
    expect(checkPage('A rule: rest when the fog comes in.', ok).ok).toBe(true)
    expect(checkPage(Array(300).fill('w').join(' '), ok).ok).toBe(true)
    expect(checkPage(Array(301).fill('w').join(' '), ok).ok).toBe(false)
  })
  it('takes an empty page, which is how it starts', () => {
    expect(checkPage('', { ...ok, prev: '' }).ok).toBe(true)
  })
  it('refuses links of every shape', () => {
    for (const text of ['see https://example.com', 'go to http://a.b', 'www.example.com is good', 'a [link](x) here', 'mail me at a@b.co', 'visit example.com/page']) {
      expect(checkPage(text, ok).ok, text).toBe(false)
    }
  })
  it('refuses HTML', () => {
    for (const text of ['<b>bold</b>', 'a <script>x</script>', '<!-- hidden -->', 'a &lt;b&gt; tag', 'a &#60;b tag']) expect(checkPage(text, ok).ok, text).toBe(false)
  })
  it('allows a plain less-than or ampersand in prose, and a full stop between sentences', () => {
    expect(checkPage('Rest when energy < 3 & fog is thick.', ok).ok).toBe(true)
    expect(checkPage('I rest.Then I wander. It works.', ok).ok).toBe(true)
  })
  it('allows one change a day', () => {
    expect(checkPage('A new line.', { ...ok, lastChangeDate: '2026-11-15' }).ok).toBe(false)
    expect(checkPage('A new line.', { ...ok, lastChangeDate: '2026-11-14' }).ok).toBe(true)
    expect(checkPage('A new line.', { ...ok, lastChangeDate: null }).ok).toBe(true)
  })
  it('an unchanged page is not a change, so it may be sent again', () => {
    expect(checkPage(ok.prev, { ...ok, lastChangeDate: '2026-11-15' })).toMatchObject({ ok: true, changed: false })
  })
})

describe('the short texts of spec v4 6', () => {
  it('has the numbers of the spec', () => {
    expect([CAPTION_WORDS, REPLY_WORDS, REPLY_WORDS_KEPT, DIARY_LINES, DIARY_LINE_CHARS]).toEqual([40, 50, 60, 3, 140])
  })
  describe('fitDiaryLines: 3 lines of up to 140 characters, cut and never thrown away', () => {
    it('keeps a diary that fits as it is', () => {
      expect(fitDiaryLines(['One.', 'Two.', 'Three.'])).toEqual({ lines: ['One.', 'Two.', 'Three.'], cut: false })
    })
    it('cuts a diary of 5 lines to its first 3', () => {
      const r = fitDiaryLines(['a', 'b', 'c', 'd', 'e'])
      expect(r).toEqual({ lines: ['a', 'b', 'c'], cut: true })
    })
    it('cuts a long line at a word to 140 characters, and skips empty lines', () => {
      const long = 'word '.repeat(60)
      const r = fitDiaryLines(['', long, '  '])
      expect(r.lines).toHaveLength(1)
      expect(r.lines[0]!.length).toBeLessThanOrEqual(140)
      expect(r.lines[0]!.endsWith('word')).toBe(true)
      expect(r.cut).toBe(true)
    })
    it('keeps a line of exactly 140 characters', () => {
      expect(fitDiaryLines(['x'.repeat(140)]).cut).toBe(false)
    })
  })
  describe('fitReply: up to 60 words kept, line breaks kept unless it is cut', () => {
    const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ')
    it('keeps 60 words and cuts at 61', () => {
      expect(fitReply(words(60))).toBe(words(60))
      expect(fitReply(words(61))).toBe(words(60))
    })
    it('keeps the line breaks of a reply that fits, and trims its ends', () => {
      const text = 'First line.\n\nSecond line.'
      expect(fitReply('  ' + text + '\n')).toBe(text)
    })
  })
  describe('fitCaption: up to 40 words, cut at a word', () => {
    const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ')
    it('keeps 40 words whole and cuts 41 or more to 40', () => {
      expect(fitCaption(words(40))).toEqual({ text: words(40), cut: false })
      expect(fitCaption(words(52))).toEqual({ text: words(40), cut: true })
    })
    it('keeps a caption of two lines as two lines', () => {
      expect(fitCaption('A lamp.\nDims alone.').text).toBe('A lamp.\nDims alone.')
    })
  })
})
