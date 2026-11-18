import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { beforeEach, describe, expect, it } from 'vitest'
import { Note, Project } from '@forkling/schema'
import { FRONT_SCRIPT } from '../src/front.ts'
import { NOTES_SCRIPT } from '../src/notes-script.ts'
import { renderSite } from '../src/render.ts'

/** Step 7, slice B: the front page `/` and `/under-the-hood/`, from the Merge template world with a project, a work, a note and a budget. */

const merge = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const NOW = Date.parse('2026-11-18T10:00:00Z')
const MAILBOX = { mindUrl: 'https://merge-mind.example.org', turnstileSiteKey: '1x00000000000000000000AA' }
const BASE = 'https://owner.github.io/merge/'
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

let world: string
let out: string
const put = (rel: string, content: string | Buffer) => {
  mkdirSync(dirname(join(world, rel)), { recursive: true })
  writeFileSync(join(world, rel), content)
}
const front = () => readFileSync(join(out, 'index.html'), 'utf8')
const hood = () => readFileSync(join(out, 'under-the-hood/index.html'), 'utf8')
const build = (opts: Record<string, unknown> = {}) => renderSite(world, out, { now: new Date(NOW), baseUrl: BASE, gitLog: () => '', ...opts })

const health = {
  updatedAt: '2026-11-18T09:50:00Z',
  engine: 'v0.15.0',
  date: '2026-11-18',
  lastTick: { at: '2026-11-18T09:50:00Z', asleep: false, summary: '', think: null, triggers: [], callsFailed: 0 },
  plan: { planId: 'p1', stepsLeft: 3, current: null, lastReplanAt: null, idleMinutes: 0 },
  today: { ticks: 41, decideCalls: 2, callsByKind: {}, triggersByKind: {}, failures: 0, rejections: 0, stepsStarted: {}, longestGapMinutes: 12 },
  quotas: { readings: { used: 3, max: 20 } },
  allowance: { points: 212, max: 600, daily: 300 },
  mood: { label: 'curious', minutes: 30 },
  spend: { monthUsd: 4.2, capUsd: 15, paceUsd: 5 },
  openBuild: null,
  warnings: ['the pit stop was late <b>twice</b>'],
}

beforeEach(() => {
  world = mkdtempSync(join(tmpdir(), 'front-world-'))
  out = mkdtempSync(join(tmpdir(), 'front-out-'))
  copyFileSync(join(merge, 'forkling.json'), join(world, 'forkling.json'))
  put('self/about.md', '# About me\n\nI am Merge, an AI that lives here. I make small things.\n')
  put('mind/goals.json', JSON.stringify({ long: { text: 'make a clock that only tells vibes', reason: 'because time is rude', setAt: '2026-11-10T08:00:00Z', reviewedAt: '2026-11-10T08:00:00Z' }, today: { date: '2026-11-18', reason: 'a quiet plan', steps: [{ verb: 'wander', topic: 'yeast', reason: 'to find yeast', minutes: 20 }] }, now: { index: 0, startedAt: '2026-11-18T09:00:00Z', until: '2026-11-18T09:20:00Z' } }))
  const p = Project.parse({ id: 'toaster', name: 'toaster.api', aim: 'toast responds to GET /toast', started: '2026-11-16T08:00:00Z', status: 'building', reason: null, inspiredBy: null, installedIn: null, sessions: [1, 2, 3].map((n) => ({ at: `2026-11-1${5 + n}T09:00:00Z`, caption: `session ${n} <i>caption</i>`, usd: 0.2, turns: 5, shot: `shots/${n}.png`, broken: false, engine: false })) })
  put('projects/toaster/project.json', JSON.stringify(p))
  for (const s of p.sessions) put(`projects/toaster/${s.shot}`, PNG)
  put('brain/budget.json', JSON.stringify({ month: '2026-11', serverUsd: 8, capUsd: 15, spentUsd: 4.2, calls: [], byKind: { reflect: { calls: 3, input: 100, cacheRead: 0, cacheWrite: 0, output: 50, usd: 1.5 }, reply: { calls: 1, input: 1, cacheRead: 0, cacheWrite: 0, output: 1, usd: 0 } }, history: [{ month: '2026-10', spentUsd: 9.1, calls: 400 }, { month: '2026-11', spentUsd: 0, calls: 0 }] }))
  put('mind/health.json', JSON.stringify(health))
  const n = Note.parse({ id: 'n-a', name: 'Anna', message: 'can the toaster make waffles?', placeId: 'home', topics: [], at: '2026-11-17T09:00:00Z', status: 'replied', foundAt: '2026-11-17T10:00:00Z', reply: 'not yet, it is on a roadmap I do not have' })
  put('notes/n-a.json', JSON.stringify(n))
})

describe('the front page /', () => {
  it('has the sections in the order of the spec: who, Merge live with the way in, today, the project, the note box', () => {
    build(MAILBOX)
    const html = front()
    const at = (s: string) => html.indexOf(s)
    const order = ['<h1', 'id="live"', 'ENTER WORLD', 'id="today"', 'id="project"', 'id="notebox"'].map(at)
    expect(order.every((n) => n >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(html).toMatch(/<h1[^>]*>I am Merge, an AI that lives here\.<\/h1>/)
  })

  it('is a desktop of its own: no window round the page, but the icons and the taskbar are there', () => {
    build()
    const html = front()
    expect(html).toContain('<main class="bare">')
    expect(html).not.toContain('<div class="window">')
    expect(html).toContain('class="icons"')
    expect(html).toContain('class="taskbar"')
  })

  it('does not load the 3D world: no canvas, no three.js, no viewer script, only a link', () => {
    build(MAILBOX)
    const html = front()
    expect(html).not.toMatch(/<canvas|three|viewer|\.glb|webgl/i)
    const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1])
    expect(scripts.sort()).toEqual(['https://challenges.cloudflare.com/turnstile/v0/api.js', 'front.js', 'notes.js', 'since.js'].sort())
    // One address: the world is built into the site's own /world/, so the way in is a relative link.
    expect(html).toContain('<a class="btn go" href="world/">')
    build({ viewer: false })
    expect(front()).not.toContain('ENTER WORLD')
  })

  it('shows today\'s picture cards from today.json, each a link with a caption, and no <img> tag', () => {
    build()
    const html = front()
    expect(html).toMatch(/<a class="tcard" href="projects\/toaster\/"/)
    expect(html).toContain("background-image:url('projects/toaster/shots/3.png')")
    expect(html).toContain('session 3 &lt;i&gt;caption&lt;/i&gt;')
    expect(html).not.toContain('<i>caption</i>')
    expect(html).not.toContain('<img')
  })

  it('shows the project with its screenshots as days, its aim and its latest caption', () => {
    build()
    const html = front()
    const part = html.slice(html.indexOf('id="project"'), html.indexOf('id="notebox"'))
    expect(part).toContain('toaster.api')
    expect(part).toContain('toast responds to GET /toast')
    expect(part).toContain('day 1')
    expect(part).toContain('day 3')
    expect(part).toContain('href="projects/toaster/"')
  })

  it('says what Merge is doing from the repo, and that it is the last seen state until the server answers', () => {
    build(MAILBOX)
    const html = front()
    expect(html).toMatch(/<p class="quiet" id="live-status">Awake\. Last seen /)
    expect(html).toContain('LAST SEEN')
    expect(html).toContain('Right now:')
    expect(html).toContain('data-mind="https://merge-mind.example.org"')
  })

  it('has no live feed when there is no server address: just the last committed state', () => {
    build()
    expect(front()).not.toContain('data-mind=')
  })

  it('shows the latest answered note and the note form, with the disclosure, and the form posts as before', () => {
    build(MAILBOX)
    const html = front()
    const part = html.slice(html.indexOf('id="notebox"'))
    expect(part).toContain('class="msg visitor"')
    expect(part).toContain('can the toaster make waffles?')
    expect(part).toContain('class="msg merge"')
    expect(part).toContain('id="note-form"')
    expect(part).toContain('Before you send a note')
    expect(part).toContain('src="notes.js"')
  })

  it('is one line and a SEND button, with the notice, the name and the human check in a part that opens when the field is used', () => {
    build(MAILBOX)
    const part = front().slice(front().indexOf('id="notebox"'))
    expect(part).not.toContain('<textarea')
    expect(part).toMatch(/<input id="note-message" type="text"[^>]*placeholder="leave Merge a note\.\.\."/)
    expect(part).toMatch(/<button id="note-send" type="submit" class="send">SEND<\/button>/)
    const extra = /<div id="note-extra" hidden>([\s\S]*?)<\/div>\s*<p id="note-status"/.exec(part)?.[1] ?? ''
    // Everything a visitor must see before sending is inside the part that is hidden until the field is used, and the field is before it.
    expect(extra).toContain('Before you send a note')
    expect(extra).toContain('id="note-name"')
    expect(extra).toContain('cf-turnstile')
    expect(part.indexOf('id="note-message"')).toBeLessThan(part.indexOf('id="note-extra"'))
  })

  it('has nothing that sends a note before the notice has been shown: the shared script holds the form back until it is open', () => {
    expect(NOTES_SCRIPT).toContain("document.getElementById('note-extra')")
    expect(NOTES_SCRIPT).toMatch(/extraEl && extraEl\.hidden/)
  })

  it('says the mailbox is closed when there is no server to post to, and still shows the chat', () => {
    build()
    const part = front().slice(front().indexOf('id="notebox"'))
    expect(part).toContain('mailbox is closed')
    expect(part).not.toContain('id="note-form"')
    expect(part).toContain('can the toaster make waffles?')
  })

  it('keeps the since-last-visit panel and its script', () => {
    build()
    expect(front()).toContain('id="since"')
    expect(front()).toMatch(/<script src="since\.js"/)
  })

  it('is the night wallpaper while Merge sleeps, from the repo\'s own state', () => {
    const f = JSON.parse(readFileSync(join(world, 'forkling.json'), 'utf8'))
    put('forkling.json', JSON.stringify({ ...f, asleep: true }))
    build()
    expect(front()).toContain('<body class="night">')
    expect(front()).toMatch(/Asleep\. Last seen /)
  })

  it('still reads with nothing made yet: empty windows say so, and nothing breaks', () => {
    const bare = mkdtempSync(join(tmpdir(), 'front-bare-'))
    copyFileSync(join(merge, 'forkling.json'), join(bare, 'forkling.json'))
    renderSite(bare, out, { now: new Date(NOW), gitLog: () => '' })
    const html = front()
    expect(html).toContain('id="today"')
    expect(html).toMatch(/Nothing made yet|nothing yet/i)
    expect(html).not.toContain('id="project"')
    expect(html).toMatch(/<h1[^>]*>Merge is an AI\. It lives here and makes things\.<\/h1>/)
  })
})

describe('the live line (front.js)', () => {
  const run = (fetchImpl: (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>) => {
    const el = (extra: Record<string, string> = {}) => ({ textContent: '', className: '', attrs: extra, getAttribute(k: string) { return this.attrs[k] ?? null }, classList: { toggle() {} } })
    const nodes: Record<string, ReturnType<typeof el>> = {
      live: el({ 'data-mind': 'https://m.example', 'data-seen': '2026-11-18 09:50' }),
      'live-badge': el(),
      'live-line': el(),
      'live-thought': el(),
      'live-status': el(),
    }
    const timers: { fn: () => void; ms: number }[] = []
    const doc = { getElementById: (id: string) => nodes[id] ?? null, body: { classList: { toggle() {} } } }
    vm.runInNewContext(FRONT_SCRIPT, { document: doc, fetch: fetchImpl, setInterval: (fn: () => void, ms: number) => void timers.push({ fn, ms }), Date, String })
    return { nodes, timers }
  }
  const settle = () => new Promise((r) => setTimeout(r, 0))

  it('asks the server every 30 seconds and shows the step and the thought with textContent', async () => {
    const urls: string[] = []
    const { nodes, timers } = run((url) => {
      urls.push(url)
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ updatedAt: '2026-11-18T10:00:00Z', asleep: false, step: { verb: 'wander', target: 'a bread site', reason: 'it smelled good', until: '2026-11-18T10:10:00Z' }, thought: 'what if bread had an API?', mood: 'curious' }) })
    })
    await settle()
    expect(urls).toEqual(['https://m.example/now.json'])
    expect(timers.map((t) => t.ms)).toEqual([30000])
    expect(nodes['live-badge']!.textContent).toBe('LIVE')
    expect(nodes['live-line']!.textContent).toBe('Right now: wander a bread site. it smelled good')
    expect(nodes['live-thought']!.textContent).toContain('what if bread had an API?')
  })

  it('falls back to the last committed state and says when it was, when the server does not answer', async () => {
    const { nodes } = run(() => Promise.reject(new Error('down')))
    await settle()
    expect(nodes['live-badge']!.textContent).toBe('LAST SEEN')
    expect(nodes['live-status']!.textContent).toContain('2026-11-18 09:50')
  })

  it('says asleep when the server says asleep', async () => {
    const { nodes } = run(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ updatedAt: '2026-11-18T10:00:00Z', asleep: true, step: null, thought: null, mood: 'sleepy' }) }))
    await settle()
    expect(nodes['live-badge']!.textContent).toBe('ASLEEP')
  })
})

describe('/under-the-hood/', () => {
  it('holds the numbers that left the front page: budget, points, health warnings and tick numbers, escaped', () => {
    build()
    const html = hood()
    expect(html).toContain('$4.20')
    expect(html).toContain('$15.00')
    expect(html).toContain('$8.00')
    expect(html).toContain('reflect')
    expect(html).toContain('2026-10')
    expect(html).toContain('212')
    expect(html).toContain('the pit stop was late &lt;b&gt;twice&lt;/b&gt;')
    expect(html).toContain('v0.15.0')
    expect(html).toContain('41')
  })

  it('holds what Merge wants, today\'s plan with every reason, and the link to the timeline of reasons', () => {
    build()
    const html = hood()
    expect(html).toContain('make a clock that only tells vibes')
    expect(html).toContain('because time is rude')
    expect(html).toContain('a quiet plan')
    expect(html).toContain('to find yeast')
    expect(html).toContain('href="../why/"')
  })

  it('says plainly when there is no budget or health file yet, and is linked from the front page and the menu', () => {
    const bare = mkdtempSync(join(tmpdir(), 'hood-bare-'))
    copyFileSync(join(merge, 'forkling.json'), join(bare, 'forkling.json'))
    renderSite(bare, out, { now: new Date(NOW), gitLog: () => '' })
    expect(hood()).toMatch(/no budget file/i)
    expect(hood()).toMatch(/no health file/i)
    expect(front()).toContain('href="under-the-hood/"')
  })
})

describe('/under-the-hood/ details', () => {
  it('lists only earlier months, says "1 call", and has no stray colon after the last tick', () => {
    build()
    const html = hood()
    const earlier = html.slice(html.indexOf('Earlier months'))
    expect(earlier).toContain('2026-10')
    expect(earlier.slice(0, earlier.indexOf('</table>'))).not.toContain('2026-11')
    expect(html).toContain('1 call, $0.00')
    expect(html).not.toContain('1 calls')
    expect(html).toContain('2026-11-18T09:50:00Z</td>')
    expect(html).not.toMatch(/09:50:00Z:/)
  })
})

describe('the page bottom', () => {
  it('leaves the height of the taskbar below the last window, so nothing slips under it', async () => {
    const { STYLE } = await import('../src/style.ts')
    expect(STYLE).toMatch(/\.bare \{[^}]*margin: 0 auto var\(--taskbar\)/)
  })
})

describe('old addresses', () => {
  it('still land on a page: every page of the site before the front page is still built, and the old home content is on the home or under the hood', () => {
    build()
    for (const rel of ['index.html', 'journal/index.html', 'notebook/index.html', 'obsessions/index.html', 'notes/index.html', 'workshop/index.html', 'why/index.html', 'projects/index.html', 'about/index.html']) {
      expect(existsSync(join(out, rel)), rel).toBe(true)
    }
  })
})
