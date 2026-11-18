import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { CARDS_SCRIPT } from '../src/front.ts'

/** Step 7C: a today card opens big (cards.js), with a fake page of three cards. */

type Listener = (e: unknown) => void
const mk = (attrs: Record<string, string> = {}) => {
  const n = {
    textContent: '',
    hidden: true,
    style: {} as Record<string, string>,
    attrs,
    listeners: {} as Record<string, Listener>,
    focused: false,
    addEventListener(t: string, f: Listener) { n.listeners[t] = f },
    setAttribute(k: string, v: string) { n.attrs[k] = v },
    getAttribute(k: string) { return n.attrs[k] ?? null },
    focus() { n.focused = true },
  }
  return n
}

const page = () => {
  const ids = ['card-open', 'co-title', 'co-pic', 'co-meta', 'co-cap', 'co-count', 'co-share', 'co-prev', 'co-next', 'co-close']
  const byId = Object.fromEntries(ids.map((k) => [k, mk()]))
  const cards = [1, 2, 3].map((n) => mk({ href: `works/w${n}/index.html`, 'data-title': `Title ${n}`, 'data-caption': `Caption ${n}`, 'data-when': '09:14', 'data-kind': 'work', 'data-image': `works/w${n}/thumb.png` }))
  const doc: Record<string, unknown> = {
    getElementById: (id: string) => byId[id] ?? null,
    querySelectorAll: () => cards,
    addEventListener(t: string, f: Listener) { doc[`on${t}`] = f },
  }
  const run = (extra: Record<string, unknown> = {}) => vm.runInNewContext(CARDS_SCRIPT, { document: doc, location: { href: 'https://owner.github.io/merge/' }, URL, Array, ...extra })
  const el = (id: string) => byId[id] as ReturnType<typeof mk>
  const card = (n: number) => cards[n] as ReturnType<typeof mk>
  const key = (k: string) => (doc.onkeydown as Listener)({ key: k })
  return { run, el, card, key }
}
const click = (n: ReturnType<typeof mk>, extra: Record<string, unknown> = {}) => {
  let prevented = false
  n.listeners.click?.({ button: 0, preventDefault: () => { prevented = true }, ...extra })
  return prevented
}

describe('an opened card (cards.js)', () => {
  it('opens on a click (the link stays for a visitor without script) and shows the words as text', () => {
    const p = page()
    p.run()
    expect(click(p.card(1))).toBe(true)
    expect(p.el('card-open').hidden).toBe(false)
    expect(p.el('co-title').textContent).toContain('Title 2')
    expect(p.el('co-cap').textContent).toBe('Caption 2')
    expect(p.el('co-meta').textContent).toBe('09:14 · work')
    expect(p.el('co-count').textContent).toContain('2 of 3')
    expect(p.el('co-pic').style.backgroundImage).toContain('works/w2/thumb.png')
    expect(p.el('co-close').focused).toBe(true)
  })

  it('leaves a click with a modifier key to the browser', () => {
    const p = page()
    p.run()
    expect(click(p.card(0), { ctrlKey: true })).toBe(false)
    expect(p.el('card-open').hidden).toBe(true)
  })

  it('goes round with prev and next, arrow keys and swipe, and closes with Escape and gives focus back', () => {
    const p = page()
    p.run()
    click(p.card(0))
    p.el('co-prev').listeners.click?.({})
    expect(p.el('co-cap').textContent).toBe('Caption 3')
    p.key('ArrowRight')
    expect(p.el('co-cap').textContent).toBe('Caption 1')
    p.el('card-open').listeners.touchstart?.({ changedTouches: [{ clientX: 200 }] })
    p.el('card-open').listeners.touchend?.({ changedTouches: [{ clientX: 100 }] })
    expect(p.el('co-cap').textContent).toBe('Caption 2')
    p.key('Escape')
    expect(p.el('card-open').hidden).toBe(true)
    expect(p.card(0).focused).toBe(true)
  })

  it('shares the card\'s link with the share sheet, or copies it where there is none', async () => {
    const shared: unknown[] = []
    const a = page()
    a.run({ navigator: { share: (d: unknown) => { shared.push(d); return Promise.resolve() } } })
    click(a.card(1))
    a.el('co-share').listeners.click?.({})
    expect(shared).toEqual([{ title: 'Title 2', url: 'https://owner.github.io/merge/works/w2/index.html' }])
    const copied: string[] = []
    const b = page()
    b.run({ navigator: { clipboard: { writeText: (t: string) => { copied.push(t); return Promise.resolve() } } } })
    click(b.card(0))
    b.el('co-share').listeners.click?.({})
    await Promise.resolve()
    await Promise.resolve()
    expect(copied).toEqual(['https://owner.github.io/merge/works/w1/index.html'])
    expect(b.el('co-share').textContent).toBe('link copied')
  })
})
