import { describe, expect, it } from 'vitest'
import { resolveStart } from '../src/web/start.ts'

const known = [{ id: '2026-11-10-keepers-log', url: 'https://en.wikipedia.org/wiki/Lighthouse', content: 'Fog.' }]
const seen = [
  { title: 'Shaded relief', url: 'https://en.wikipedia.org/wiki/Shaded_relief' },
  { title: 'Brainfuck', url: 'https://esolangs.org/wiki/Brainfuck' },
]

describe('where a trip starts', () => {
  it('never turns a topic it has not seen into a guessed Wikipedia address: it says it has not seen a page of that name', () => {
    // The made-up titles of Merge's live trips, 13 to 19 Nov 2026: each was turned into /wiki/<Title> and hit a 404.
    for (const made of ['Maya archaeology', 'Milky Way dust mapping', 'Absurd rigorous joke papers', 'Multi-directional shading']) {
      expect(resolveStart(made, known, seen)).toEqual({ ok: false, unseen: true, reason: `I have not seen a page called ${made}` })
    }
    expect(resolveStart('  logic gates ', known)).toMatchObject({ ok: false, unseen: true })
  })

  it('goes to a page it has seen, or a starting point, when the topic matches its title', () => {
    expect(resolveStart('shaded relief', known, seen)).toEqual({ ok: true, kind: 'topic', value: 'shaded relief', url: 'https://en.wikipedia.org/wiki/Shaded_relief' })
  })

  it('starts from a link it was offered when the target is an address on the allowlist', () => {
    expect(resolveStart('https://esolangs.org/wiki/Brainfuck', known, seen)).toEqual({ ok: true, kind: 'feed', value: 'https://esolangs.org/wiki/Brainfuck', url: 'https://esolangs.org/wiki/Brainfuck' })
  })

  it('starts from an address it has read before or keeps a souvenir from, and matches any other address by its title', () => {
    expect(resolveStart('https://en.wikipedia.org/wiki/Lighthouse', known, seen)).toMatchObject({ ok: true, kind: 'feed', url: 'https://en.wikipedia.org/wiki/Lighthouse' })
    expect(resolveStart('https://en.wikipedia.org/wiki/Moss', known, seen, (u) => u.endsWith('/Moss'))).toMatchObject({ ok: true, kind: 'feed', url: 'https://en.wikipedia.org/wiki/Moss' })
    // An address it never saw, in another spelling of a title it has seen, goes to the real page.
    expect(resolveStart('https://en.wikipedia.org/wiki/shaded_relief', known, seen)).toEqual({ ok: true, kind: 'feed', value: 'https://en.wikipedia.org/wiki/shaded_relief', url: 'https://en.wikipedia.org/wiki/Shaded_relief' })
  })

  it('does not fetch an address it never saw that matches no title (Merge wrote /wiki/Creativecoding on 18 Nov 2026)', () => {
    expect(resolveStart('https://en.wikipedia.org/wiki/Creativecoding', known, seen)).toEqual({ ok: false, unseen: true, reason: 'I have not seen a page at https://en.wikipedia.org/wiki/Creativecoding' })
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
    expect(resolveStart('java script: alert(1)', known)).toMatchObject({ ok: false, unseen: true })
    expect(resolveStart('javascript:alert(1)', known)).toMatchObject({ ok: false, unseen: true })
  })
})
