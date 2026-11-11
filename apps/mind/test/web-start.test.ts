import { describe, expect, it } from 'vitest'
import { resolveStart } from '../src/web/start.ts'

const known = [{ id: '2026-11-10-keepers-log', url: 'https://en.wikipedia.org/wiki/Lighthouse', content: 'Fog.' }]

describe('where a trip starts', () => {
  it('goes straight to the Wikipedia page of a topic', () => {
    expect(resolveStart('lighthouses', known)).toEqual({ ok: true, kind: 'topic', value: 'lighthouses', url: 'https://en.wikipedia.org/wiki/Lighthouses' })
    expect(resolveStart('  logic gates ', known)).toMatchObject({ kind: 'topic', url: 'https://en.wikipedia.org/wiki/Logic_gates' })
  })

  it('starts from a link it was offered when the target is an address on the allowlist', () => {
    expect(resolveStart('https://esolangs.org/wiki/Brainfuck', known)).toEqual({ ok: true, kind: 'feed', value: 'https://esolangs.org/wiki/Brainfuck', url: 'https://esolangs.org/wiki/Brainfuck' })
  })

  it('starts from the source of a souvenir, named by its id or by the id with its folder', () => {
    const want = { ok: true, kind: 'souvenir', value: '2026-11-10-keepers-log', url: 'https://en.wikipedia.org/wiki/Lighthouse' }
    expect(resolveStart('2026-11-10-keepers-log', known)).toEqual(want)
    expect(resolveStart('souvenirs/2026-11-10-keepers-log', known)).toEqual(want)
  })

  it('refuses an address that is not on the allowlist, and an empty target', () => {
    expect(resolveStart('https://example.com/page', known)).toEqual({ ok: false, reason: 'https://example.com/page is not on the allowlist' })
    expect(resolveStart('http://en.wikipedia.org/wiki/Moss', known)).toMatchObject({ ok: false })
    expect(resolveStart('   ', known)).toEqual({ ok: false, reason: 'the step has no place to start from' })
  })

  it('does not make a page address out of text that only looks like one', () => {
    expect(resolveStart('java script: alert(1)', known)).toMatchObject({ ok: true, kind: 'topic' })
    expect(resolveStart('javascript:alert(1)', known)).toMatchObject({ ok: true, kind: 'topic', url: 'https://en.wikipedia.org/wiki/Javascript:alert(1)' })
  })
})
