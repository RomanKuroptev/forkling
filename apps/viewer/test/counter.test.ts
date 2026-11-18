import { describe, expect, it } from 'vitest'
import { counterAttrs, startCounter } from '../src/counter.ts'

/** Sharing S7 in the 3D world: switched off without a code, GoatCounter (cookie-free) with one. */

const fakeDoc = () => {
  const added: { async?: boolean; src?: string; dataset: Record<string, string> }[] = []
  const doc = {
    querySelector: () => (added.length > 0 ? added[0] : null),
    createElement: () => ({ dataset: {} as Record<string, string> }),
    head: { appendChild: (s: (typeof added)[number]) => void added.push(s) },
  }
  return { doc: doc as unknown as Document, added }
}

describe('counterAttrs', () => {
  it('is null for no code and for anything that is not a GoatCounter site name', () => {
    for (const bad of [undefined, null, '', 'a.b', 'a/b', '"><script>', '-x', 'x'.repeat(40)]) expect(counterAttrs(bad)).toBeNull()
  })
  it('gives the endpoint and script of a site name', () => {
    expect(counterAttrs('Merge95')).toEqual({ endpoint: 'https://merge95.goatcounter.com/count', src: 'https://gc.zgo.at/count.js' })
  })
})

describe('startCounter', () => {
  it('adds nothing and makes no request without a code', () => {
    const { doc, added } = fakeDoc()
    expect(startCounter('', doc)).toBe(false)
    expect(startCounter(undefined, doc)).toBe(false)
    expect(added).toHaveLength(0)
  })
  it('adds the script once with a code', () => {
    const { doc, added } = fakeDoc()
    expect(startCounter('merge95', doc)).toBe(true)
    expect(added[0]?.src).toBe('https://gc.zgo.at/count.js')
    expect(added[0]?.dataset.goatcounter).toBe('https://merge95.goatcounter.com/count')
    expect(startCounter('merge95', doc)).toBe(false)
    expect(added).toHaveLength(1)
  })
})
