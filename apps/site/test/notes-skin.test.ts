import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { Note } from '@forkling/schema'
import { renderSite } from '../src/render.ts'
import { STYLE } from '../src/style.ts'

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
const note = (over: Record<string, unknown>) => Note.parse({ name: 'Kim', message: 'hello', placeId: 'home', topics: [], status: 'replied', foundAt: '2026-11-16T10:00:00Z', reply: 'a reply', ...over })

beforeEach(() => {
  world = mkdtempSync(join(tmpdir(), 'ns-world-'))
  out = mkdtempSync(join(tmpdir(), 'ns-out-'))
  copyFileSync(join(merge, 'forkling.json'), join(world, 'forkling.json'))
})

describe('the notes page and the thread pages are a chat on the desktop (look L4c)', () => {
  it('is a flat chat in the stylesheet: a white row for the visitor, a pale cyan row a fixed step in for Merge, bold purple prefixes', () => {
    expect(STYLE).toMatch(/\.msg \{[^}]*background: var\(--white\)/)
    expect(STYLE).toMatch(/\.msg\.merge \{[^}]*background: #c9fbff; margin-left: 30px/)
    expect(STYLE).toMatch(/\.msg \.who \{[^}]*color: var\(--purple\)/)
    expect(STYLE).toMatch(/main img \{[^}]*border: 2px solid var\(--ink\)/)
    // Nothing nests: an answer is not inside the box before it.
    expect(STYLE).not.toMatch(/data-reply-to\] \{[^}]*margin-left/)
  })

  it('keeps the markup the rules hang on: the list, each note with its thread, the reply in a quote, and the closed-thread line', () => {
    const a = note({ id: 'n-a', message: 'first question', at: '2026-11-16T09:00:00Z' })
    const b = note({ id: 'n-b', message: 'my answer', thread: 'n-a', replyTo: 'n-a', at: '2026-11-16T12:00:00Z', foundAt: '2026-11-16T13:00:00Z', reply: 'a second reply' })
    const c = note({ id: 'n-c', message: 'a third', thread: 'n-a', replyTo: 'n-b', at: '2026-11-16T14:00:00Z', foundAt: '2026-11-16T15:00:00Z', reply: 'a third reply' })
    for (const n of [a, b, c]) put(`notes/${n.id}.json`, JSON.stringify(n))
    renderSite(world, out, { ...MAILBOX, now: new Date(NOW), baseUrl: 'https://merge.example/' })
    const index = readFileSync(join(out, 'notes/index.html'), 'utf8')
    expect(index).toContain('<ul class="requests notes">')
    expect(index).toMatch(/<li class="note" data-note="n-b" data-thread="n-a" data-reply-to="n-a"/)
    // One flat row for each message, never one box inside another: the visitor's row, then Merge's.
    expect(index).toMatch(/<div class="msg visitor"><strong class="who">Kim:<\/strong> <p>my answer<\/p><\/div><div class="msg merge"><strong class="who">[^<]*:<\/strong> <p>a second reply<\/p><\/div>/)
    expect(index).not.toMatch(/<div class="msg[^>]*>(?:(?!<\/div>).)*<div class="msg/s)
    expect(index).toMatch(/<p class="quiet note-meta">Kim answered on /)
    expect(index).toContain('This thread is closed.')
    // The thread page is a window of its own, in the same skin, with its picture under the chat.
    const thread = readFileSync(join(out, 'notes/t/n-a.html'), 'utf8')
    expect(thread).toContain('class="window"')
    expect(thread).toContain('<ul class="requests notes">')
    expect(thread).toContain('og:image')
    expect(thread).toMatch(/<img src="n-a\.svg"/)
  })
})
