import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { beforeEach, describe, expect, it } from 'vitest'
import { Note } from '@forkling/schema'
import { NOTES_SCRIPT } from '../src/notes-script.ts'
import { notesEndpoint, validSiteKey } from '../src/notes.ts'
import { renderSite } from '../src/render.ts'

const merge = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const MAILBOX = { mindUrl: 'https://merge-mind.example.org', turnstileSiteKey: '1x00000000000000000000AA' }

let world: string
let out: string
const put = (rel: string, content: string) => {
  const full = join(world, rel)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, content)
}
const page = (rel: string) => readFileSync(join(out, rel), 'utf8')
const render = (opts: Record<string, unknown> = {}) => renderSite(world, out, opts)
const note = (over: Record<string, unknown> = {}) => Note.parse({ id: 'n-2026-11-16-aaaaaa', name: 'A visitor', message: 'Do you ever get tired of fog?', placeId: 'home', at: '2026-11-16T09:30:00Z', topics: [], status: 'new', ...over })
const putNote = (n: Note) => put(`notes/${n.id}.json`, JSON.stringify(n))
const found = { status: 'found', foundAt: '2026-11-16T10:00:00Z' }

beforeEach(() => {
  world = mkdtempSync(join(tmpdir(), 'notes-world-'))
  out = mkdtempSync(join(tmpdir(), 'notes-out-'))
  copyFileSync(join(merge, 'forkling.json'), join(world, 'forkling.json'))
})

describe('the mailbox settings are checked before they reach a page', () => {
  it('builds the address of POST /notes from the server address, with or without a trailing slash', () => {
    expect(notesEndpoint('https://merge-mind.example.org')).toBe('https://merge-mind.example.org/notes')
    expect(notesEndpoint('https://merge-mind.example.org/')).toBe('https://merge-mind.example.org/notes')
    expect(notesEndpoint('http://localhost:8787')).toBe('http://localhost:8787/notes')
  })
  it('refuses anything that is not https (or a local try-out), has a path, or is not an address', () => {
    for (const bad of [undefined, '', '   ', 'http://merge-mind.example.org', 'ftp://x.y', 'javascript:alert(1)', 'not a url', 'https://merge-mind.example.org/x?y=1', 'https://user:pw@merge-mind.example.org']) {
      expect(notesEndpoint(bad), String(bad)).toBeNull()
    }
  })
  it('takes a Turnstile site key of the usual shape and nothing that could break out of an attribute', () => {
    expect(validSiteKey('1x00000000000000000000AA')).toBe('1x00000000000000000000AA')
    expect(validSiteKey('0x4AAAAAAABkMYinukE8nzYS')).toBe('0x4AAAAAAABkMYinukE8nzYS')
    for (const bad of [undefined, '', 'short', 'has space in it 1234567890', '"><script>alert(1)</script>', 'x'.repeat(200)]) expect(validSiteKey(bad), String(bad)).toBeNull()
  })
})

describe('/notes/ when the mailbox is not set up', () => {
  it('is on every page\'s nav, so a visitor can find it, and says the mailbox is closed, with no form', () => {
    render()
    expect(page('index.html')).toContain('notes/')
    expect(page('journal/index.html')).toMatch(/href="..\/notes\/"/)
    const html = page('notes/index.html')
    expect(html).toMatch(/The mailbox is closed for now/)
    expect(html).not.toContain('<form')
    expect(html).not.toContain('challenges.cloudflare.com')
    // There is nothing to send from, so there is no "before you send" box either.
    expect(html).not.toMatch(/Before you send a note/)
    expect(existsSync(join(out, 'notes.js'))).toBe(true)
  })
  it('treats settings that do not check out as not set up: a bad address or a bad key leaves the mailbox closed', () => {
    render({ mindUrl: 'http://merge-mind.example.org', turnstileSiteKey: MAILBOX.turnstileSiteKey })
    expect(page('notes/index.html')).not.toContain('<form')
    render({ mindUrl: MAILBOX.mindUrl, turnstileSiteKey: '"><script>' })
    expect(page('notes/index.html')).not.toContain('<form')
    render({ mindUrl: MAILBOX.mindUrl })
    expect(page('notes/index.html')).not.toContain('<form')
  })
})

describe('/notes/ with the mailbox set up: the form', () => {
  it('has a name (up to 40 characters, optional) and a message (up to 500), the Turnstile widget, and a button', () => {
    render(MAILBOX)
    const html = page('notes/index.html')
    expect(html).toMatch(/<form id="note-form" data-endpoint="https:\/\/merge-mind\.example\.org\/notes"/)
    expect(html).toMatch(/<input id="note-name"[^>]*maxlength="40"/)
    expect(html).not.toMatch(/<input id="note-name"[^>]*required/)
    expect(html).toMatch(/<textarea id="note-message"[^>]*maxlength="500"[^>]*required/)
    expect(html).toContain('class="cf-turnstile" data-sitekey="1x00000000000000000000AA"')
    expect(html).toContain('https://challenges.cloudflare.com/turnstile/v0/api.js')
    expect(html).toMatch(/<button id="note-send"/)
    expect(html).toMatch(/id="note-status"[^>]*role="status"/)
    expect(html).toContain('<script src="../notes.js"></script>')
  })

  it('tells the visitor before they send: public, kept for good in a public repository even if hidden, and read by an AI', () => {
    render(MAILBOX)
    const html = page('notes/index.html')
    const before = html.slice(0, html.indexOf('<form'))
    expect(before).toMatch(/public/i)
    expect(before).toMatch(/permanently in a public repository/i)
    expect(before).toMatch(/even if (it is )?later hidden/i)
    expect(before).toMatch(/read by an AI/i)
    expect(before).toMatch(/3 notes a day/)
    expect(before).toMatch(/links, email addresses and phone numbers are (taken|removed)/i)
  })

  it('says it needs JavaScript, for a visitor who has none', () => {
    render(MAILBOX)
    expect(page('notes/index.html')).toMatch(/<noscript>[\s\S]*JavaScript[\s\S]*<\/noscript>/)
  })

  it('has the same form however many notes there are, and the page works from the site\'s own address with no other origin in it', () => {
    putNote(note())
    render(MAILBOX)
    const html = page('notes/index.html')
    expect(html.match(/<form/g)).toHaveLength(1)
    expect(html.match(/https:\/\/[a-z.-]+/g)!.filter((u) => !/merge-mind\.example\.org|challenges\.cloudflare\.com/.test(u))).toEqual([])
  })
})

describe('/notes/: the board', () => {
  it('says so when no note has been left', () => {
    render(MAILBOX)
    expect(page('notes/index.html')).toMatch(/No notes have been left yet/)
  })

  it('shows each note with who left it, when, where, what it said and what became of it, newest first', () => {
    putNote(note({ id: 'n-2026-11-15-bbbbbb', name: 'Ann', message: 'The lamp is lovely.', at: '2026-11-15T09:30:00Z' }))
    putNote(note({ id: 'n-2026-11-16-aaaaaa', name: '', message: 'Do you ever get tired of fog?', at: '2026-11-16T09:30:00Z', placeId: 'workshop' }))
    render(MAILBOX)
    const html = page('notes/index.html')
    expect(html.indexOf('Do you ever get tired of fog?')).toBeLessThan(html.indexOf('The lamp is lovely.'))
    expect(html).toContain('Ann')
    expect(html).toMatch(/A visitor/)
    expect(html).toContain('2026-11-16 10:30 (Europe/Stockholm)')
  })

  it('says in plain words what became of a note: not found, found and waiting, replied, kept, declined', () => {
    putNote(note({ id: 'n-2026-11-10-000001', message: 'Not found.', at: '2026-11-10T09:00:00Z' }))
    putNote(note({ id: 'n-2026-11-11-000002', message: 'Waiting.', at: '2026-11-11T09:00:00Z', ...found }))
    putNote(note({ id: 'n-2026-11-12-000003', message: 'Answered.', at: '2026-11-12T09:00:00Z', ...found, status: 'replied', reply: 'I do. The fog is my landlord.' }))
    putNote(note({ id: 'n-2026-11-13-000004', message: 'Kept.', at: '2026-11-13T09:00:00Z', ...found, status: 'kept' }))
    putNote(note({ id: 'n-2026-11-14-000005', message: 'Declined.', at: '2026-11-14T09:00:00Z', ...found, status: 'declined', declineReason: 'I would rather not today.' }))
    render(MAILBOX)
    const html = page('notes/index.html')
    const item = (id: string) => new RegExp(`<li[^>]*data-note="${id}"[\\s\\S]*?</li>`).exec(html)![0]
    expect(item('n-2026-11-10-000001')).toMatch(/Not found yet/)
    expect(item('n-2026-11-11-000002')).toMatch(/Found by Merge on 2026-11-16\. Not answered yet/)
    expect(item('n-2026-11-12-000003')).toMatch(/Merge replied:[\s\S]*I do\. The fog is my landlord\./)
    expect(item('n-2026-11-13-000004')).toMatch(/Merge kept this note/)
    expect(item('n-2026-11-14-000005')).toMatch(/Merge declined this note:[\s\S]*I would rather not today\./)
    for (const id of ['n-2026-11-10-000001', 'n-2026-11-11-000002', 'n-2026-11-12-000003', 'n-2026-11-13-000004', 'n-2026-11-14-000005']) expect(item(id)).toMatch(/data-status="(new|found|replied|kept|declined)"/)
  })

  it('names the place a note was left at, and Home for a note left on this page', () => {
    putNote(note({ id: 'n-2026-11-16-000001', placeId: 'home', message: 'At home.' }))
    render(MAILBOX)
    expect(page('notes/index.html')).toMatch(/left this on [^<]*, at Home\./)
  })

  it('leaves out a note Roman hid, and a file that is not a note', () => {
    putNote(note({ id: 'n-2026-11-16-000001', message: 'Visible note.' }))
    putNote(note({ id: 'n-2026-11-16-000002', message: 'Hidden note.' }))
    put('notes/junk.json', '{"nonsense":true}')
    put('notes/broken.json', 'not json')
    put('mind/notes-hidden.json', JSON.stringify({ hidden: ['n-2026-11-16-000002'] }))
    render(MAILBOX)
    const html = page('notes/index.html')
    expect(html).toContain('Visible note.')
    expect(html).not.toContain('Hidden note.')
    expect(html).not.toContain('nonsense')
  })

  it('escapes everything a visitor or Merge wrote: text becomes text, never markup or a link', () => {
    putNote(note({ id: 'n-2026-11-16-000001', name: '<b>Bob</b>', message: '<script>alert(1)</script> [x](javascript:alert(1)) <img src=x onerror=alert(1)>' }))
    putNote(note({ id: 'n-2026-11-16-000002', ...found, status: 'replied', reply: '<script>alert(2)</script>', message: 'Reply me.' }))
    putNote(note({ id: 'n-2026-11-16-000003', ...found, status: 'declined', declineReason: '<img src=x onerror=alert(3)>', message: 'Decline me.' }))
    render(MAILBOX)
    const html = page('notes/index.html')
    expect(html).not.toMatch(/<script>alert|<img src=x|<b>Bob/)
    expect(html).not.toMatch(/href="javascript:/)
    expect(html).toContain('&lt;script&gt;')
  })

  it('shows the board even when the mailbox is closed, so what was left and answered can still be read', () => {
    putNote(note({ ...found, status: 'replied', reply: 'I do.' }))
    render()
    const html = page('notes/index.html')
    expect(html).toContain('Do you ever get tired of fog?')
    expect(html).toContain('I do.')
    expect(html).toMatch(/The mailbox is closed for now/)
  })
})

describe('notes.js (what the form does when it is sent)', () => {
  it('never puts text from the page or the server into the page as markup', () => {
    expect(NOTES_SCRIPT).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/)
  })

  interface Sent {
    url: string
    init: { method: string; headers: Record<string, string>; body: string }
  }
  function run(over: { name?: string; message?: string; token?: string; response?: { status: number; body?: unknown; json?: 'throws' } | 'network' } = {}) {
    const sent: Sent[] = []
    const reset: number[] = []
    const el = (value = '') => ({ value, textContent: '', className: '', disabled: false, listeners: {} as Record<string, (e: unknown) => void>, addEventListener(type: string, f: (e: unknown) => void) { this.listeners[type] = f } })
    const nameEl = el(over.name ?? 'Ann')
    const messageEl = el(over.message ?? 'Hello Merge')
    const send = el()
    const status = el()
    const tokenEl = { value: over.token ?? 'tok' }
    const form = {
      ...el(),
      getAttribute: (n: string) => (n === 'data-endpoint' ? 'https://merge-mind.example.org/notes' : null),
      querySelector: (sel: string) => (sel.includes('cf-turnstile-response') ? tokenEl : null),
    }
    const byId: Record<string, unknown> = { 'note-form': form, 'note-name': nameEl, 'note-message': messageEl, 'note-send': send, 'note-status': status }
    const response = over.response ?? { status: 202, body: { ok: true, id: 'n-1' } }
    const sandbox = {
      document: { getElementById: (id: string) => byId[id] ?? null },
      window: { turnstile: { reset: () => reset.push(1), getResponse: () => '' } },
      fetch: async (url: string, init: Sent['init']) => {
        sent.push({ url, init })
        if (response === 'network') throw new Error('offline')
        return { status: response.status, json: async () => { if (response.json === 'throws') throw new Error('not json'); return response.body ?? {} } }
      },
      JSON,
    }
    vm.runInNewContext(NOTES_SCRIPT, sandbox)
    const submit = async () => {
      form.listeners.submit!({ preventDefault() {} })
      await new Promise((r) => setTimeout(r, 0))
      await new Promise((r) => setTimeout(r, 0))
    }
    return { sent, reset, nameEl, messageEl, send, status, tokenEl, submit }
  }

  it('posts the note as JSON to the server with the Turnstile token and the place Home, and thanks the visitor', async () => {
    const r = run()
    await r.submit()
    expect(r.sent).toHaveLength(1)
    expect(r.sent[0]!.url).toBe('https://merge-mind.example.org/notes')
    expect(r.sent[0]!.init.method).toBe('POST')
    expect(r.sent[0]!.init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(r.sent[0]!.init.body)).toEqual({ name: 'Ann', message: 'Hello Merge', placeId: 'home', token: 'tok' })
    expect(r.status.textContent).toMatch(/Thank you/)
    expect(r.status.className).toMatch(/note-ok/)
    expect(r.messageEl.value).toBe('')
    expect(r.send.disabled).toBe(false)
  })

  it('resets the Turnstile widget after every try, since a token works once', async () => {
    const ok = run()
    await ok.submit()
    expect(ok.reset).toHaveLength(1)
    const failed = run({ response: { status: 429, body: { ok: false, error: 'You can leave 3 notes a day, and you have used them. Come back tomorrow.' } } })
    await failed.submit()
    expect(failed.reset).toHaveLength(1)
  })

  it('shows the server\'s own words when a note is turned away, and keeps the message so nothing typed is lost', async () => {
    for (const [status, error] of [[429, "Merge's mailbox is full until tomorrow."], [429, 'You can leave 3 notes a day, and you have used them. Come back tomorrow.'], [503, 'The mailbox is closed.'], [422, 'That note was not accepted.'], [403, 'That did not look like a person. Try again.']] as const) {
      const r = run({ response: { status, body: { ok: false, error } } })
      await r.submit()
      expect(r.status.textContent).toBe(error)
      expect(r.status.className).toMatch(/note-error/)
      expect(r.messageEl.value).toBe('Hello Merge')
      expect(r.send.disabled).toBe(false)
    }
  })

  it('says something plain when the server cannot be reached or answers with something that is not JSON', async () => {
    const offline = run({ response: 'network' })
    await offline.submit()
    expect(offline.status.textContent).toMatch(/Could not reach Merge/)
    expect(offline.send.disabled).toBe(false)
    const odd = run({ response: { status: 502, json: 'throws' } })
    await odd.submit()
    expect(odd.status.textContent).toMatch(/Something went wrong/)
  })

  it('sends nothing for an empty message, or before the human check is done', async () => {
    const empty = run({ message: '   ' })
    await empty.submit()
    expect(empty.sent).toHaveLength(0)
    expect(empty.status.textContent).toMatch(/Write something first/)
    const noToken = run({ token: '' })
    await noToken.submit()
    expect(noToken.sent).toHaveLength(0)
    expect(noToken.status.textContent).toMatch(/check/i)
  })

  it('shows the error text only as text: a server answer cannot put markup in the page', async () => {
    const r = run({ response: { status: 422, body: { ok: false, error: '<img src=x onerror=alert(1)>' } } })
    await r.submit()
    expect(r.status.textContent).toBe('<img src=x onerror=alert(1)>')
  })
})
