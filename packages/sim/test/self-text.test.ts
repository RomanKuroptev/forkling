import { describe, expect, it } from 'vitest'
import { ABOUT_MAX_TRAITS, ABOUT_MAX_WORDS, PAGE_MAX_WORDS, aboutChange, checkAbout, checkPage } from '../src/self-text.ts'

const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1} says something`).join('\n')

describe('checkAbout (spec 9.2: 300 words, 8 traits, 30% of lines a week)', () => {
  it('has the numbers of the spec', () => expect([ABOUT_MAX_WORDS, ABOUT_MAX_TRAITS]).toEqual([300, 8]))

  it('takes a first version freely, up to 300 words', () => {
    expect(checkAbout('', lines(10)).ok).toBe(true)
    expect(checkAbout('', Array(301).fill('w').join(' ')).ok).toBe(false)
    expect(checkAbout('', Array(300).fill('w').join(' ')).ok).toBe(true)
  })
  it('refuses an empty version', () => {
    expect(checkAbout(lines(5), '   ').ok).toBe(false)
  })
  it('refuses more than 8 traits in the list', () => {
    const traits = (n: number) => `I like fog.\n${Array.from({ length: n }, (_, i) => `- trait ${i}`).join('\n')}`
    expect(checkAbout('', traits(8)).ok).toBe(true)
    expect(checkAbout('', traits(9)).ok).toBe(false)
  })
  it('allows 30% of lines changed and refuses more', () => {
    const prev = lines(10)
    const changed = (n: number) => prev.split('\n').map((l, i) => (i < n ? `new ${i}` : l)).join('\n')
    expect(checkAbout(prev, changed(3)).ok).toBe(true)
    const r = checkAbout(prev, changed(4))
    expect(r.ok).toBe(false)
    expect(r.reasons.join(' ')).toMatch(/30%/)
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
