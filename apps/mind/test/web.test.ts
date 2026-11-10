import { describe, expect, it } from 'vitest'
import { cutToTokens, htmlToText, wordCount } from '../src/web/clean.ts'
import { checkSouvenir } from '../src/web/souvenir.ts'

describe('htmlToText', () => {
  it('drops scripts, styles and tags, and keeps paragraphs apart', () => {
    const html = '<html><head><title>x</title><style>p{}</style></head><body><nav>menu</nav><h1>Fog</h1><p>The <b>fog</b> came.</p><script>alert(1)</script><p>It stayed.</p></body></html>'
    expect(htmlToText(html)).toBe('Fog\n\nThe fog came.\n\nIt stayed.')
  })

  it('decodes common and numeric entities', () => {
    expect(htmlToText('<p>Tom &amp; Jerry &lt;3 &quot;hi&quot; &#39;yo&#39; &#x2014; caf&eacute;&nbsp;now</p>')).toBe('Tom & Jerry <3 "hi" \'yo\' — café now')
  })

  it('turns line breaks and list items into new lines', () => {
    expect(htmlToText('<ul><li>one</li><li>two</li></ul>a<br>b')).toBe('one\n\ntwo\n\na\nb')
  })

  it('leaves plain text alone apart from whitespace', () => {
    expect(htmlToText('  just   text \n\n\n\n more ')).toBe('just text\n\nmore')
  })
})

describe('cutToTokens', () => {
  it('keeps text under the limit as it is', () => {
    expect(cutToTokens('short text', 3000)).toBe('short text')
  })

  it('cuts at a word boundary near the limit and marks the cut', () => {
    const text = 'word '.repeat(100).trim() // 499 chars, ~125 tokens
    const cut = cutToTokens(text, 10) // ~40 chars
    expect(cut.endsWith(' …')).toBe(true)
    expect(cut.length).toBeLessThanOrEqual(42)
    expect(cut).not.toMatch(/wor …$/)
  })
})

describe('wordCount', () => {
  it('counts words', () => {
    expect(wordCount('one two  three\nfour')).toBe(4)
    expect(wordCount('   ')).toBe(0)
  })
})

describe('checkSouvenir (spec 6.3)', () => {
  const source = 'The keeper wrote “fog, fog, fog” for nine days.\nThen   the light went out.'

  it('accepts a quote that appears word for word, ignoring whitespace and quote style', () => {
    expect(checkSouvenir({ kind: 'quote', content: 'wrote "fog, fog, fog" for nine days. Then the light' }, source)).toEqual({ ok: true })
  })

  it('rejects a quote that is not in the text', () => {
    expect(checkSouvenir({ kind: 'quote', content: 'The keeper wrote fog for ten days.' }, source)).toEqual({ ok: false, reason: 'quote not found word for word' })
  })

  it('rejects a quote over 280 characters or empty', () => {
    expect(checkSouvenir({ kind: 'quote', content: 'x'.repeat(281) }, 'x'.repeat(400))).toEqual({ ok: false, reason: 'quote over 280 characters' })
    expect(checkSouvenir({ kind: 'quote', content: '  ' }, source)).toEqual({ ok: false, reason: 'empty' })
  })

  it('accepts a fact whose evidence is word for word, with its own sentence up to 200 characters', () => {
    expect(checkSouvenir({ kind: 'fact', content: 'A lighthouse keeper logged fog for over a week.', evidence: 'fog, fog, fog" for nine days' }, source)).toEqual({ ok: true })
  })

  it('rejects a fact with no evidence, evidence not in the text, or a long sentence', () => {
    expect(checkSouvenir({ kind: 'fact', content: 'Fog.' }, source)).toEqual({ ok: false, reason: 'fact without evidence' })
    expect(checkSouvenir({ kind: 'fact', content: 'Fog.', evidence: 'nine weeks' }, source)).toEqual({ ok: false, reason: 'evidence not found word for word' })
    expect(checkSouvenir({ kind: 'fact', content: 'y'.repeat(201), evidence: 'nine days' }, source)).toEqual({ ok: false, reason: 'fact over 200 characters' })
  })
})
