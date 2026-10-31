import { describe, expect, it } from 'vitest'
import { esc, markdown } from '../src/md.ts'

describe('esc', () => {
  it('escapes what could become markup, including quotes for attributes', () => {
    expect(esc(`<a href="x" onclick='y'>&</a>`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;')
  })
})

describe('markdown', () => {
  it('makes headings, paragraphs and emphasis', () => {
    expect(markdown('# A day\n\n*2026-11-03*\n\nI **made** a cup.\n')).toBe('<h1>A day</h1>\n<p><em>2026-11-03</em></p>\n<p>I <strong>made</strong> a cup.</p>')
  })

  it('makes lists, numbered or not', () => {
    expect(markdown('- one\n- two')).toBe('<ul><li>one</li><li>two</li></ul>')
    expect(markdown('1. first\n2. second')).toBe('<ol><li>first</li><li>second</li></ol>')
  })

  it('makes links, but only to web addresses', () => {
    expect(markdown('[home](https://example.com/a?b=1)')).toBe('<p><a href="https://example.com/a?b=1" rel="noopener noreferrer">home</a></p>')
    expect(markdown('[bad](javascript:alert(1))')).not.toContain('<a')
    expect(markdown('[bad](data:text/html,x)')).not.toContain('<a')
  })

  it('never lets text become markup', () => {
    const out = markdown('# <script>alert(1)</script>\n\n<img src=x onerror=alert(1)> and [x](https://a.test/"onmouseover="y)')
    expect(out).not.toMatch(/<script|<img|onmouseover="/)
    expect(out).toContain('&lt;script&gt;')
  })

  it('keeps line breaks inside a paragraph as spaces', () => {
    expect(markdown('one\ntwo')).toBe('<p>one two</p>')
  })

  it('is empty for nothing', () => {
    expect(markdown('')).toBe('')
    expect(markdown('\n\n')).toBe('')
  })
})
