import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { Note } from '@forkling/schema'
import { pictureToPng, threadPicture, wrapLines } from '../src/note-picture.ts'
import { renderSite } from '../src/render.ts'

const merge = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
let world: string
let out: string
const put = (rel: string, content: string) => {
  const full = join(world, rel)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, content)
}
const note = (over: Record<string, unknown>) => Note.parse({ name: 'Anna', message: 'hello', placeId: 'home', topics: [], status: 'replied', at: '2026-11-16T09:00:00Z', foundAt: '2026-11-16T10:00:00Z', reply: 'a reply', ...over })
const putNote = (n: Note) => put(`notes/${n.id}.json`, JSON.stringify(n))
const read = (rel: string) => readFileSync(join(out, rel), 'utf8')

beforeEach(() => {
  world = mkdtempSync(join(tmpdir(), 'ns-world-'))
  out = mkdtempSync(join(tmpdir(), 'ns-out-'))
  copyFileSync(join(merge, 'forkling.json'), join(world, 'forkling.json'))
})

describe('wrapLines', () => {
  it('wraps at a word boundary and cuts a long text with an ellipsis', () => {
    expect(wrapLines('one two three four', 9, 5)).toEqual(['one two', 'three', 'four'])
    const cut = wrapLines('word '.repeat(100), 20, 3)
    expect(cut).toHaveLength(3)
    expect(cut[2]).toMatch(/…$/)
  })
})

describe('threadPicture', () => {
  it('is an SVG of 1200 by 630 with the name, the note, the reply and the address, all escaped', () => {
    const svg = threadPicture({ name: 'A <b>', message: 'Why <script>?', reply: 'Because & so.', address: 'merge.example' })
    expect(svg).toMatch(/viewBox="0 0 1200 630"/)
    expect(svg).toContain('A &lt;b&gt;')
    expect(svg).toContain('Why &lt;script&gt;?')
    expect(svg).toContain('Because &amp; so.')
    expect(svg).toContain('merge.example')
    expect(svg).not.toContain('<script')
  })
  it('says a visitor when there is no name', () => {
    expect(threadPicture({ name: '', message: 'm', reply: 'r', address: 'x' })).toContain('A visitor')
  })
})

describe('pictureToPng', () => {
  it('renders the picture as a real 1200 by 630 PNG', () => {
    const png = pictureToPng(threadPicture({ name: 'Anna', message: 'Hello', reply: 'Hi.', address: 'merge.example' }))
    expect(png).not.toBeNull()
    expect(png!.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true)
    expect(png!.readUInt32BE(16)).toBe(1200)
    expect(png!.readUInt32BE(20)).toBe(630)
  })
  it('is null for something that is not a picture, so the build falls back to the SVG', () => {
    expect(pictureToPng('not an svg')).toBeNull()
  })
})

describe('a thread has its own page and picture (sharing S5)', () => {
  const a = () => note({ id: 'n-a', message: 'first question', reply: 'first reply' })
  const b = () => note({ id: 'n-b', message: 'my answer', reply: 'second reply', thread: 'n-a', replyTo: 'n-a', at: '2026-11-16T12:00:00Z', foundAt: '2026-11-16T13:00:00Z' })

  it('writes notes/t/<thread>.html with the thread in order, share tags, and a picture of the newest reply', () => {
    putNote(a())
    putNote(b())
    renderSite(world, out, { baseUrl: 'https://merge.example/' })
    const html = read('notes/t/n-a.html')
    expect(html.indexOf('first question')).toBeLessThan(html.indexOf('my answer'))
    expect(html).toContain('property="og:title"')
    expect(html).toContain('property="og:image" content="https://merge.example/notes/t/n-a.png"')
    expect(html).toContain('property="og:url" content="https://merge.example/notes/t/n-a.html"')
    expect(html).toContain('name="twitter:card"')
    expect(html).toContain('name="twitter:image" content="https://merge.example/notes/t/n-a.png"')
    expect(html).toContain('property="og:image:width" content="1200"')
    expect(readFileSync(join(out, 'notes/t/n-a.png')).subarray(1, 4).toString()).toBe('PNG')
    const svg = read('notes/t/n-a.svg')
    expect(svg).toContain('my answer')
    expect(svg).toContain('second reply')
    expect(svg).toContain('merge.example')
  })
  it('without a site address it still has the page and picture, and no absolute links in the tags', () => {
    putNote(a())
    renderSite(world, out)
    expect(existsSync(join(out, 'notes/t/n-a.html'))).toBe(true)
    expect(read('notes/t/n-a.html')).not.toContain('og:image')
  })
  it('the board links each thread to its page', () => {
    putNote(a())
    putNote(note({ id: 'n-z', message: 'lone', status: 'new', foundAt: null, reply: null, at: '2026-11-16T14:00:00Z' }))
    renderSite(world, out)
    expect(read('notes/index.html')).toContain('href="t/n-a.html"')
  })
  it('a thread with no reply has no picture and no page; a hidden note takes its thread with it', () => {
    putNote(note({ id: 'n-z', message: 'lone', status: 'new', foundAt: null, reply: null }))
    putNote(a())
    putNote(b())
    put('mind/notes-hidden.json', JSON.stringify({ hidden: ['n-b'] }))
    renderSite(world, out)
    expect(existsSync(join(out, 'notes/t/n-z.html'))).toBe(false)
    expect(existsSync(join(out, 'notes/t/n-a.html'))).toBe(false)
    expect(existsSync(join(out, 'notes/t/n-a.svg'))).toBe(false)
    expect(existsSync(join(out, 'notes/t/n-a.png'))).toBe(false)
  })
})
