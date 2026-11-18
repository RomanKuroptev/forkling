import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { beforeEach, describe, expect, it } from 'vitest'
import { Note } from '@forkling/schema'
import { NOTES_SCRIPT } from '../src/notes-script.ts'
import { renderSite } from '../src/render.ts'

/** Step 7C: the chat extras of the notes-chat mockup: the rule of a chat, replies left, "has not answered yet", and "you are: Kim". */

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
const build = () => renderSite(world, out, { ...MAILBOX, now: new Date(NOW) })

beforeEach(() => {
  world = mkdtempSync(join(tmpdir(), 'nc-world-'))
  out = mkdtempSync(join(tmpdir(), 'nc-out-'))
  copyFileSync(join(merge, 'forkling.json'), join(world, 'forkling.json'))
})

describe('/notes/: chat extras', () => {
  const a = () => note({ id: 'n-a', message: 'first question', at: '2026-11-16T09:00:00Z' })

  it('says the rule of a chat: up to 3 answers and the remembered name', () => {
    putNote(a())
    build()
    expect(page()).toContain('Merge answers up to 3 times per chat and remembers your name next time.')
  })

  it('shows replies left as pips under the newest reply of an open thread, and none once it is closed', () => {
    putNote(a())
    build()
    expect(page()).toMatch(/aria-label="2 of 3"><i class="on"><\/i><i class="on"><\/i><i class=""><\/i>/)
    putNote(note({ id: 'n-b', thread: 'n-a', replyTo: 'n-a', at: '2026-11-16T12:00:00Z' }))
    putNote(note({ id: 'n-c', thread: 'n-a', replyTo: 'n-b', at: '2026-11-16T14:00:00Z' }))
    build()
    expect(page()).not.toContain('replies left')
  })

  it('shows a dashed row for a note Merge found but did not answer, and none for a replied note', () => {
    putNote(a())
    putNote(note({ id: 'n-f', message: 'still waiting', status: 'found', reply: undefined, at: '2026-11-16T10:00:00Z' }))
    build()
    expect(page().match(/msg merge typing/g)?.length).toBe(1)
    expect(page()).toContain('Not answered yet.')
  })

  it('has the "you are" line in the full and the compact form, hidden until a name is remembered', () => {
    putNote(a())
    build()
    expect(page()).toMatch(/<p id="note-who"[^>]* hidden>you are: <strong id="note-who-name"><\/strong>/)
    expect(readFileSync(join(out, 'index.html'), 'utf8')).toContain('id="note-notyou"')
  })
})

describe('notes.js remembers the name', () => {
  it('shows the remembered name, remembers a given one after sending, and forgets it on "not you?"', async () => {
    const store: Record<string, string> = { 'merge95:name': 'Kim' }
    const handlers: Record<string, (e?: unknown) => void> = {}
    const mk = (over: Record<string, unknown> = {}) => ({ value: '', textContent: '', className: '', disabled: false, hidden: true, addEventListener: (t: string, f: (e?: unknown) => void) => void (handlers[t] = f), getAttribute: () => 'https://x.test/notes', querySelector: () => ({ value: 'tok' }), ...over })
    const name = mk()
    const who = mk()
    const whoName = mk()
    const clicks: ((e?: unknown) => void)[] = []
    const notYou = mk({ addEventListener: (_t: string, f: (e?: unknown) => void) => void clicks.push(f) })
    const nodes: Record<string, unknown> = { 'note-form': mk(), 'note-name': name, 'note-message': mk({ value: 'hi' }), 'note-send': mk(), 'note-status': mk(), 'note-who': who, 'note-who-name': whoName, 'note-notyou': notYou }
    const localStorage = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v), removeItem: (k: string) => void delete store[k] }
    vm.runInNewContext(NOTES_SCRIPT, { document: { getElementById: (id: string) => (id in nodes ? nodes[id] : mk({ hidden: false })), querySelectorAll: () => [] }, window: { localStorage }, localStorage, fetch: async () => ({ status: 202, json: async () => ({ ok: true }) }), String })
    expect(name.value).toBe('Kim')
    expect(whoName.textContent).toBe('Kim')
    expect(who.hidden).toBe(false)
    clicks[0]?.({ preventDefault() {} })
    expect(store['merge95:name']).toBeUndefined()
    expect(who.hidden).toBe(true)
    name.value = 'Anna'
    handlers.submit?.({ preventDefault() {} })
    await new Promise((r) => setTimeout(r, 10))
    expect(store['merge95:name']).toBe('Anna')
  })
})
