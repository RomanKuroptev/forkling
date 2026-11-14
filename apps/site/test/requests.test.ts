import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { PlaceRequest, Wish, formatRequest } from '@forkling/schema'
import { renderSite } from '../src/render.ts'

const merge = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const templateWorld = fileURLToPath(new URL('../../../templates/forkling-world', import.meta.url))
const NOW = new Date('2026-11-20T12:00:00Z')

let world: string
let out: string
const put = (rel: string, content: string) => {
  const full = join(world, rel)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, content)
}
const page = (rel: string) => readFileSync(join(out, rel), 'utf8')
const template = (id: string) => JSON.parse(readFileSync(join(templateWorld, 'places', `${id}.json`), 'utf8'))
const putPlace = (id: string, over: Record<string, unknown> = {}) => put(`places/${id}.json`, JSON.stringify({ ...template(id === 'home' || id === 'workshop' ? id : 'home'), id, ...over }))
const render = () => renderSite(world, out, { now: NOW, gitLog: () => '' })

const request = (over: Record<string, unknown> = {}) =>
  PlaceRequest.parse({ id: 'lantern-hall', kind: 'place', name: 'Lantern Hall', purpose: 'Where I keep the lidar finds.', tags: ['maya lidar'], chunk: [1, 0], related: [], souvenirs: ['2026-11-02-fog', '2026-11-03-moth'], written: '2026-11-18T10:00:00Z', status: 'open', statusAt: null, note: null, body: 'I want a place with a lamp over each find.\n\nIt would be quiet.', ...over })
const putRequest = (over: Record<string, unknown> = {}) => {
  const r = request(over)
  put(`requests/${r.id}.md`, formatRequest(r))
}
const putWish = (over: Record<string, unknown> = {}) => {
  const w = Wish.parse({ id: 'lamp-rail', name: 'Lamp rail', description: 'A rail of small lamps for the long shelf.', forPlace: null, count: 1, written: '2026-11-17T10:00:00Z', status: 'open', statusAt: null, note: null, ...over })
  put(`wishes/${w.id}.json`, JSON.stringify(w))
}
const state = { construction: null, lastCareAt: '2026-11-19T10:00:00Z', neglect: 0, lamps: true }

beforeEach(() => {
  world = mkdtempSync(join(tmpdir(), 'requests-world-'))
  out = mkdtempSync(join(tmpdir(), 'requests-out-'))
  copyFileSync(join(merge, 'forkling.json'), join(world, 'forkling.json'))
  putPlace('home', { state })
  putPlace('workshop', { state })
})

describe('a world with no requests and no wishes', () => {
  it('has no /requests/ page and no link to it', () => {
    render()
    expect(existsSync(join(out, 'requests'))).toBe(false)
    expect(page('index.html')).not.toMatch(/href="requests\//)
  })
})

describe('/requests/ (spec 10.3: place requests and wishes, with their status)', () => {
  it('appears with the first request, linked from every page', () => {
    putRequest()
    render()
    expect(existsSync(join(out, 'requests/index.html'))).toBe(true)
    expect(page('index.html')).toMatch(/href="requests\/"/)
    expect(page('places/index.html')).toMatch(/href="..\/requests\/"/)
  })

  it("shows a request in Merge's own words: name, purpose, tags, when it asked, the souvenirs behind it, and what it imagines", () => {
    putRequest()
    render()
    const html = page('requests/index.html')
    expect(html).toContain('Lantern Hall')
    expect(html).toContain('Where I keep the lidar finds.')
    expect(html).toContain('maya lidar')
    expect(html).toContain('2026-11-18')
    expect(html).toMatch(/2 souvenirs/)
    expect(html).toContain('I want a place with a lamp over each find.')
    expect(html).toContain('It would be quiet.')
  })

  it('says in plain words what each status means, and which ones are still waiting', () => {
    const cases: [string, string, RegExp][] = [
      ['open', 'a-open', /Waiting for Roman to answer/],
      ['building', 'b-building', /Roman says he is building it/],
      ['built', 'c-built', /Built by Roman with Claude Code/],
      ['declined', 'd-declined', /Roman declined/],
      ['self-built', 'e-selfbuilt', /Built by Merge from the kit/],
      ['withdrawn', 'f-withdrawn', /Merge took it back/],
    ]
    for (const [status, id] of cases) {
      const answered = status !== 'open'
      putRequest({ id, name: `Place ${id}`, status, statusAt: answered ? '2026-11-19T10:00:00Z' : null, note: status === 'declined' ? 'Not now.' : null })
    }
    render()
    const html = page('requests/index.html')
    for (const [status, id, words] of cases) {
      const item = new RegExp(`<li[^>]*data-request="${id}"[^>]*data-status="${status}"[^>]*>[\\s\\S]*?</li>`).exec(html)?.[0]
      expect(item, id).toBeDefined()
      expect(item!, id).toMatch(words)
    }
    // The ones still waiting come before the answered ones.
    expect(html.indexOf('data-request="b-building"')).toBeLessThan(html.indexOf('data-request="c-built"'))
    expect(html.indexOf('data-request="a-open"')).toBeLessThan(html.indexOf('data-request="d-declined"'))
  })

  it('files a gift as a gift, so the record shows whose idea it was', () => {
    putRequest({ id: 'bell-tower', kind: 'gift', name: 'Bell Tower', status: 'built', statusAt: '2026-11-19T10:00:00Z', souvenirs: [], body: 'Built by Roman without a request.' })
    render()
    const item = /<li[^>]*data-request="bell-tower"[\s\S]*?<\/li>/.exec(page('requests/index.html'))![0]
    expect(item).toMatch(/A gift from Roman/)
    // Merge did not ask for it, so it says neither "asked" nor how many souvenirs are behind it.
    expect(item).not.toMatch(/Asked on|souvenir/)
    expect(item).toMatch(/Filed 2026-11-18/)
  })

  it("does not show Roman's note on a request that is not declined (the viewer keeps it back too)", () => {
    putRequest({ id: 'a-building', name: 'Place A', status: 'building', statusAt: '2026-11-19T10:00:00Z', note: 'Two rooms, lamps in the windows.' })
    putRequest({ id: 'b-built', name: 'Place B', status: 'built', statusAt: '2026-11-19T10:00:00Z', note: 'Built with a stone hall.' })
    render()
    const html = page('requests/index.html')
    expect(html).not.toContain('Two rooms, lamps')
    expect(html).not.toContain('stone hall')
    expect(html).not.toContain('Roman’s reason')
  })

  it("shows Roman's reason on a declined request, and only there", () => {
    putRequest({ id: 'no-thanks', name: 'No Thanks', status: 'declined', statusAt: '2026-11-19T10:00:00Z', note: 'Too close to the Workshop; ask again further out.' })
    render()
    const item = /<li[^>]*data-request="no-thanks"[\s\S]*?<\/li>/.exec(page('requests/index.html'))![0]
    expect(item).toMatch(/Roman declined/)
    expect(item).toMatch(/Roman’s reason:[\s\S]*Too close to the Workshop; ask again further out\./)
  })

  it("escapes Roman's reason", () => {
    putRequest({ id: 'no-thanks', name: 'No Thanks', status: 'declined', statusAt: '2026-11-19T10:00:00Z', note: '<script>alert(1)</script> no.' })
    render()
    const html = page('requests/index.html')
    expect(html).not.toContain('<script>alert')
    expect(html).toContain('&lt;script&gt;')
  })

  it('links a built request to its place when one stands on its chunk', () => {
    putPlace('lantern-hall', { name: 'Lantern Hall', chunk: [1, 0], offset: [0, 0], state })
    putRequest({ status: 'built', statusAt: '2026-11-19T10:00:00Z' })
    render()
    expect(page('requests/index.html')).toMatch(/href="..\/places\/lantern-hall\/"/)
  })

  it('escapes everything: a name, a purpose and a body with markup are shown as text', () => {
    putRequest({ name: 'Hall <b>one</b>', purpose: 'A <script>alert(1)</script> place', body: '<img src=x onerror=alert(1)>' })
    render()
    const html = page('requests/index.html')
    expect(html).not.toMatch(/<script>alert|<img src=x|<b>one/)
    expect(html).toContain('&lt;script&gt;')
  })

  it('leaves out a request file that does not fit, or whose id is not its file name', () => {
    putRequest()
    put('requests/broken.md', '---\nname: x\n---\nno')
    put('requests/other-name.md', formatRequest(request({ id: 'someone-else', name: 'Someone Else' })))
    render()
    const html = page('requests/index.html')
    expect(html).toContain('Lantern Hall')
    expect(html).not.toContain('Someone Else')
  })

  it('lists wishes with their count, status and the place they are for', () => {
    putWish({ count: 3, forPlace: 'workshop' })
    putWish({ id: 'dust-brush', name: 'Dust brush', description: 'Something to sweep with.', status: 'unanswered', statusAt: '2026-11-19T10:00:00Z' })
    render()
    const html = page('requests/index.html')
    expect(html).toMatch(/data-wish="lamp-rail"[\s\S]*?Lamp rail/)
    expect(html).toMatch(/asked for 3 times|wished 3 times|3 times/)
    expect(html).toMatch(/href="..\/places\/workshop\/"/)
    expect(html).toMatch(/data-wish="dust-brush"[\s\S]*?No answer in 30 days/)
  })

  it('appears for a world that only has wishes', () => {
    putWish()
    render()
    expect(existsSync(join(out, 'requests/index.html'))).toBe(true)
    expect(page('requests/index.html')).toContain('Lamp rail')
  })
})

describe('the honesty line on a place page: who had the idea and who built it (spec 10.3)', () => {
  const found = (summary: string) => [{ at: '2026-11-19T10:00:00Z', verb: 'found', summary }]
  const line = (id: string) => /<p class="provenance">([\s\S]*?)<\/p>/.exec(page(`places/${id}/index.html`))?.[1] ?? ''

  it('says it for a place Merge asked for and Roman built', () => {
    putPlace('lantern-hall', { name: 'Lantern Hall', chunk: [1, 0], offset: [0, 0], state, history: found('Asked for by Merge, built by Roman with Claude Code.') })
    render()
    expect(line('lantern-hall')).toMatch(/Asked for by Merge, built by Roman with Claude Code/)
  })

  it('says it for a gift', () => {
    putPlace('bell-tower', { name: 'Bell Tower', chunk: [2, 0], offset: [0, 0], state, history: found('A gift from Roman.') })
    render()
    expect(line('bell-tower')).toMatch(/A gift from Roman/)
  })

  it('says it for the fallback: built by Merge from the kit', () => {
    putPlace('plain-hall', { name: 'Plain Hall', chunk: [3, 0], offset: [0, 0], state, history: found('Asked for by Merge, built by Merge from the kit.') })
    render()
    expect(line('plain-hall')).toMatch(/built by Merge from the kit/)
  })

  it("says it for Home and the Workshop, the places given to Merge before it woke", () => {
    render()
    expect(line('home')).toMatch(/given to Merge before it woke/)
    expect(line('workshop')).toMatch(/given to Merge before it woke/)
  })

  it('says so when no one wrote it down, and never guesses', () => {
    putPlace('mystery', { name: 'Mystery Hall', chunk: [4, 0], offset: [0, 0], state, history: [] })
    render()
    expect(line('mystery')).toMatch(/not written down/i)
  })

  it('escapes the history line it quotes', () => {
    putPlace('odd', { name: 'Odd Hall', chunk: [5, 0], offset: [0, 0], state, history: found('<script>x</script> built it.') })
    render()
    expect(page('places/odd/index.html')).not.toContain('<script>x</script>')
  })
})
