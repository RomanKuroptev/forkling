import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { beforeEach, describe, expect, it } from 'vitest'
import { Note } from '@forkling/schema'
import { NOTES_SCRIPT } from '../src/notes-script.ts'
import { renderSite } from '../src/render.ts'

const merge = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const MAILBOX = { mindUrl: 'https://merge-mind.example.org', turnstileSiteKey: '1x00000000000000000000AA' }
const NOW = Date.parse('2026-11-17T10:00:00Z')

let world: string
let out: string
const put = (rel: string, content: string) => {
  const full = join(world, rel)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, content)
}
const page = () => readFileSync(join(out, 'notes/index.html'), 'utf8')
const note = (over: Record<string, unknown>) => Note.parse({ name: 'A visitor', message: 'hello', placeId: 'home', topics: [], status: 'replied', foundAt: '2026-11-16T10:00:00Z', reply: 'a reply', ...over })
const putNote = (n: Note) => put(`notes/${n.id}.json`, JSON.stringify(n))

beforeEach(() => {
  world = mkdtempSync(join(tmpdir(), 'nt-world-'))
  out = mkdtempSync(join(tmpdir(), 'nt-out-'))
  copyFileSync(join(merge, 'forkling.json'), join(world, 'forkling.json'))
})

describe('/notes/: threads', () => {
  const a = () => note({ id: 'n-a', message: 'first question', at: '2026-11-16T09:00:00Z' })
  const b = () => note({ id: 'n-b', message: 'my answer', thread: 'n-a', replyTo: 'n-a', at: '2026-11-16T12:00:00Z', foundAt: '2026-11-16T13:00:00Z' })
  const other = () => note({ id: 'n-z', message: 'lone note', at: '2026-11-16T10:30:00Z' })

  it('shows a thread together and in order, oldest first, with threads newest first', () => {
    for (const n of [a(), other(), b()]) putNote(n)
    renderSite(world, out, { ...MAILBOX, now: new Date(NOW) })
    const html = page()
    const at = (s: string) => html.indexOf(s)
    expect(at('my answer')).toBeGreaterThan(-1)
    expect(at('first question')).toBeLessThan(at('my answer'))
    expect(at('lone note')).toBeGreaterThan(at('my answer'))
    expect(html).toMatch(/data-thread="n-a"/)
  })
  it('offers an answer under the newest reply of an open thread only', () => {
    for (const n of [a(), other(), b()]) putNote(n)
    renderSite(world, out, { ...MAILBOX, now: new Date(NOW) })
    const buttons = [...page().matchAll(/data-answer="([^"]+)"/g)].map((m) => m[1])
    expect(buttons.sort()).toEqual(['n-b', 'n-z'])
  })
  it('says a thread is closed after 3 replies, with no answer button', () => {
    const c = note({ id: 'n-c', thread: 'n-a', replyTo: 'n-b', at: '2026-11-16T14:00:00Z' })
    for (const n of [a(), b(), c]) putNote(n)
    renderSite(world, out, { ...MAILBOX, now: new Date(NOW) })
    expect(page()).not.toContain('data-answer="n-c"')
    expect(page()).toMatch(/This thread is closed/)
  })
  it('hides the rest of a thread when one of its notes is hidden', () => {
    for (const n of [a(), b(), other()]) putNote(n)
    put('mind/notes-hidden.json', JSON.stringify({ hidden: ['n-b'] }))
    renderSite(world, out, { ...MAILBOX, now: new Date(NOW) })
    expect(page()).not.toContain('first question')
    expect(page()).toContain('lone note')
  })
})

describe('notes.js sends replyTo when answering', () => {
  it('posts replyTo after an answer button was pressed', async () => {
    const handlers: Record<string, (e?: unknown) => void> = {}
    const posted: { body?: string }[] = []
    const el = (over: object = {}) => ({ value: '', textContent: '', className: '', disabled: false, style: {}, hidden: false, addEventListener: (_t: string, f: (e?: unknown) => void) => void (handlers[_t] = f), getAttribute: () => 'https://x.test/notes', querySelector: () => ({ value: 'tok' }), scrollIntoView() {}, ...over })
    const message = el({ value: 'hi' })
    const form = el()
    const button = el({ getAttribute: () => 'n-b' })
    const clickHandlers: ((e: unknown) => void)[] = []
    const doc = {
      getElementById: (id: string) => ({ 'note-form': form, 'note-name': el(), 'note-message': message, 'note-send': el(), 'note-status': el(), 'note-answering': el() })[id] ?? el(),
      querySelectorAll: () => [{ ...button, addEventListener: (_t: string, f: (e: unknown) => void) => void clickHandlers.push(f) }],
    }
    const fetchFake = async (_u: string, init: { body: string }) => {
      posted.push(init)
      return { status: 202, json: async () => ({ ok: true }) }
    }
    vm.runInNewContext(NOTES_SCRIPT, { document: doc, fetch: fetchFake, window: {} })
    clickHandlers[0]!.call(button, { preventDefault() {} })
    handlers.submit!({ preventDefault() {} })
    await new Promise((r) => setTimeout(r, 10))
    expect(JSON.parse(posted[0]!.body!)).toMatchObject({ replyTo: 'n-b' })
  })
})
