import { describe, expect, it } from 'vitest'
import { MAX_SVG_CHARS } from '@forkling/schema'
import { sanitizeSvg } from '../src/svg.ts'

describe('sanitizeSvg', () => {
  it('keeps a plain drawing', () => {
    const svg = '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect x="10" y="10" width="30" height="30" fill="#c96"/><circle cx="60" cy="60" r="20" fill="none" stroke="black" stroke-width="2"/></svg>'
    expect(sanitizeSvg(svg)).toBe(svg)
  })

  it('keeps paths, groups, gradients and text', () => {
    const svg =
      '<svg viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs><g transform="translate(1 1)"><path d="M0 0 L5 5 Z" fill="url(#g)"/></g><text x="1" y="9" font-size="2">hi cat</text></svg>'
    expect(sanitizeSvg(svg)).toBe(svg)
  })

  it('removes scripts and everything inside them', () => {
    const out = sanitizeSvg('<svg viewBox="0 0 1 1"><script>alert(1)</script><rect width="1" height="1"/></svg>')!
    expect(out).not.toMatch(/script|alert/)
    expect(out).toContain('<rect')
  })

  it('removes event handlers and javascript urls', () => {
    const out = sanitizeSvg('<svg viewBox="0 0 1 1" onload="x()"><rect width="1" height="1" onclick="x()" fill="javascript:alert(1)"/><a href="javascript:x()"><rect width="1" height="1"/></a></svg>')!
    expect(out).not.toMatch(/onload|onclick|javascript|<a|href/i)
  })

  it('removes foreignObject, images, use and style, which can load or run things', () => {
    const out = sanitizeSvg(
      '<svg viewBox="0 0 1 1"><foreignObject><div>hi</div></foreignObject><image href="https://evil.test/x.png"/><use href="#a"/><style>*{background:url(https://evil.test)}</style><rect width="1" height="1"/></svg>',
    )!
    expect(out).not.toMatch(/foreignObject|image|<use|style|evil|div/i)
    expect(out).toContain('<rect')
  })

  it('allows url(#local) fills but not external url() values', () => {
    const out = sanitizeSvg('<svg viewBox="0 0 1 1"><rect width="1" height="1" fill="url(#g)" stroke="url(https://evil.test/x)"/></svg>')!
    expect(out).toContain('fill="url(#g)"')
    expect(out).not.toMatch(/evil|stroke=/)
  })

  it('escapes text so it cannot become markup', () => {
    const out = sanitizeSvg('<svg viewBox="0 0 1 1"><text x="0" y="1">a &lt;script&gt; b &amp; c</text></svg>')!
    expect(out).not.toContain('<script')
    expect(out).toContain('&lt;script&gt;')
  })

  it('drops comments, doctypes and processing instructions', () => {
    const out = sanitizeSvg('<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x "y">]><!-- hi --><svg viewBox="0 0 1 1"><rect width="1" height="1"/></svg>')!
    expect(out).not.toMatch(/DOCTYPE|ENTITY|<!--|<\?xml/)
    expect(out.startsWith('<svg')).toBe(true)
  })

  it('closes what was left open and ignores stray closing tags', () => {
    expect(sanitizeSvg('<svg viewBox="0 0 1 1"><g><rect width="1" height="1"/></svg>')).toBe('<svg viewBox="0 0 1 1"><g><rect width="1" height="1"/></g></svg>')
    expect(sanitizeSvg('<svg viewBox="0 0 1 1"></g><rect width="1" height="1"/></svg>')).toBe('<svg viewBox="0 0 1 1"><rect width="1" height="1"/></svg>')
  })

  it('gives nothing for something that is not an svg, or is too big, or is empty', () => {
    expect(sanitizeSvg('<div>hello</div>')).toBeNull()
    expect(sanitizeSvg('just words')).toBeNull()
    expect(sanitizeSvg('')).toBeNull()
    expect(sanitizeSvg(`<svg viewBox="0 0 1 1">${'<rect width="1" height="1"/>'.repeat(1000)}</svg>`)).toBeNull()
    expect(MAX_SVG_CHARS).toBe(12_000)
  })

  it('forces a viewBox so it scales, and drops a fixed width and height from the root', () => {
    const out = sanitizeSvg('<svg width="9999" height="9999" viewBox="0 0 10 10"><rect width="1" height="1"/></svg>')!
    expect(out).toContain('viewBox="0 0 10 10"')
    expect(out).not.toMatch(/ width="9999"/)
    expect(sanitizeSvg('<svg><rect width="1" height="1"/></svg>')).toContain('viewBox="0 0 100 100"')
  })

  it('does not trust quotes in attribute values', () => {
    const out = sanitizeSvg(`<svg viewBox="0 0 1 1"><rect width="1" height="1" fill='red" onmouseover="x()'/></svg>`)!
    expect(out).not.toMatch(/onmouseover/)
  })
})
