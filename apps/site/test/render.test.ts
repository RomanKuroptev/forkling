import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { renderSite } from '../src/render.ts'

const merge = fileURLToPath(new URL('../../../templates/merge', import.meta.url))

let world: string
let out: string
const put = (rel: string, content: unknown) => {
  const full = join(world, rel)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content, null, 2))
}
const page = (rel: string) => readFileSync(join(out, rel), 'utf8')

const source = { id: 'hn:1', title: 'A CPU built in Minecraft', url: 'https://example.com/cpu', at: '2026-11-01T07:00:00Z' }

beforeEach(() => {
  world = mkdtempSync(join(tmpdir(), 'site-world-'))
  out = mkdtempSync(join(tmpdir(), 'site-out-'))
  copyFileSync(join(merge, 'forkling.json'), join(world, 'forkling.json'))
  put('mind/goals.json', {
    long: { text: 'Build a computer out of clay.', reason: 'I like gates.', setAt: '2026-11-01T07:00:00Z', reviewedAt: '2026-11-01T07:00:00Z' },
    today: { date: '2026-11-03', reason: 'A gate day.', steps: [{ verb: 'read', targetId: 'bookshelf', topic: 'logic gates', reason: 'I want to know how they work.', minutes: 20 }] },
    now: { index: 0, startedAt: '2026-11-03T09:00:00Z', until: '2026-11-03T09:20:00Z' },
  })
  put('brain/interests.json', {
    topics: { 'logic gates': { weight: 0.85, firstSeen: source.at, lastFed: source.at, sources: [source] } },
    current: { topic: 'logic gates', startedAt: '2026-11-02T07:00:00Z', origin: source },
    past: [{ topic: 'comets', startedAt: '2026-10-20T07:00:00Z', endedAt: '2026-10-25T07:00:00Z', origin: { ...source, id: 'wikitop:Comet', title: 'Comet C/2026', url: 'https://en.wikipedia.org/wiki/Comet' } }],
  })
  put('memory/beliefs.json', [
    { id: 'b1', statement: 'The sunny rock is warm in the morning.', confidence: 0.7, evidence: ['2026-11-02#3'], formedAt: '2026-11-02T20:00:00Z', status: 'revised', revisedAt: '2026-11-03T20:00:00Z', history: [{ at: '2026-11-03T20:00:00Z', statement: 'The sunny rock is always warm.', confidence: 0.6, why: 'It was cold at dusk.' }] },
    { id: 'b2', statement: 'Fish are friends.', confidence: 0.05, evidence: ['2026-11-02#4'], formedAt: '2026-11-02T20:00:00Z', status: 'dropped', history: [] },
  ])
  put('journal/2026-11-02.md', '# A quiet day\n\n*2026-11-02*\n\nI watched the rock.\n')
  put('journal/2026-11-03.md', '# <script>alert(1)</script> A clay day\n\n*2026-11-03*\n\nI made a cup. [look](javascript:alert(1))\n')
  put('notebook/reading/2026-11-03-1.md', '# Cats are trending\n\n*2026-11-03*\n\nEveryone is posting cats.\n\n## What I was looking at\n- [#caturday](https://mastodon.social/tags/caturday)\n')
  put('notebook/plans/2026-11-03.md', '# Plan for 2026-11-03\n\n1. **read** (bookshelf) about logic gates, 20 min: I want to know how they work. *(because b1)*\n')
  put('art/the-sea.json', { id: 'the-sea', kind: 'writing', title: 'The Sea', content: { text: 'The sea is a big water bowl.\n\nIt never empties.' }, skillLevel: 1, goalRef: 'today:0', createdAt: '2026-11-03T10:00:00Z' })
  put('art/hill.json', { id: 'hill', kind: 'drawing', title: 'Hill <b>big</b>', content: { svg: '<svg viewBox="0 0 100 100" onload="steal()"><script>steal()</script><circle cx="50" cy="50" r="20" fill="orange"/></svg>' }, skillLevel: 2, createdAt: '2026-11-03T11:00:00Z' })
  put('art/rock-tune.json', { id: 'rock-tune', kind: 'melody', title: 'Rock tune', content: { bpm: 100, notes: [{ pitch: 'C4', beats: 1 }, { pitch: 'R', beats: 1 }, { pitch: 'G4', beats: 2 }] }, skillLevel: 2, obsessionRef: 'logic gates', createdAt: '2026-11-03T12:00:00Z' })
  put('art/berry-mash.json', { id: 'berry-mash', kind: 'recipe', title: 'Berry mash', content: { ingredients: [{ name: 'berries', grams: 250 }], steps: ['Mash.'] }, skillLevel: 1, createdAt: '2026-11-03T13:00:00Z' })
  put('memory/timeline/2026-11-03.jsonl', [
    { at: '2026-11-03T09:00:00Z', verb: 'read', targetId: 'bookshelf', reason: 'I want to know how they work.', goalRef: 'today:0', beliefRefs: ['b1'] },
    { at: '2026-11-03T09:20:00Z', verb: 'sit', reason: '<img src=x onerror=alert(1)> Resting.' },
  ].map((l) => JSON.stringify(l)).join('\n'))
})

describe('renderSite: the home page', () => {
  it('says when it was last seen in the forkling own time zone, and which one', () => {
    put('forkling.json', { ...JSON.parse(readFileSync(join(world, 'forkling.json'), 'utf8')), lastTickAt: '2026-11-03T09:05:30Z' })
    renderSite(world, out)
    expect(page('index.html')).toContain('Last seen 2026-11-03 10:05 (Europe/Stockholm)')
    expect(page('index.html')).not.toMatch(/UTC\./)
  })

  it('follows the clock changes of that zone', () => {
    put('forkling.json', { ...JSON.parse(readFileSync(join(world, 'forkling.json'), 'utf8')), lastTickAt: '2026-07-03T09:05:30Z' })
    renderSite(world, out)
    expect(page('index.html')).toContain('Last seen 2026-07-03 11:05 (Europe/Stockholm)')
  })
})

describe('renderSite', () => {
  it('writes a page for each part of the site and a stylesheet', () => {
    const { pages } = renderSite(world, out)
    for (const rel of ['index.html', 'journal/index.html', 'journal/2026-11-03.html', 'journal/2026-11-02.html', 'notebook/index.html', 'gallery/index.html', 'obsessions/index.html', 'why/index.html', 'style.css']) {
      expect(existsSync(join(out, rel)), rel).toBe(true)
    }
    expect(pages).toContain('index.html')
  })

  it('shows on the home page who it is, what it wants and what it is doing now, with the reason', () => {
    renderSite(world, out)
    const html = page('index.html')
    expect(html).toContain('Merge')
    expect(html).toContain('Build a computer out of clay.')
    expect(html).toContain('I want to know how they work.')
    expect(html).toContain('logic gates')
    expect(html).toContain('https://example.com/cpu')
    expect(html).toContain('journal/2026-11-03.html')
  })

  it('links every page to the others and uses relative links, so it works under any path', () => {
    renderSite(world, out)
    const home = page('index.html')
    const deep = page('journal/2026-11-03.html')
    for (const html of [home, deep]) for (const part of ['journal/', 'notebook/', 'gallery/', 'obsessions/', 'why/']) expect(html).toContain(part)
    expect(deep).toContain('href="../style.css"')
    expect(home).not.toMatch(/href="\//)
  })

  it('lists the journal newest first and shows each entry', () => {
    renderSite(world, out)
    const index = page('journal/index.html')
    expect(index.indexOf('2026-11-03')).toBeLessThan(index.indexOf('2026-11-02'))
    expect(page('journal/2026-11-02.html')).toContain('I watched the rock.')
  })

  it('shows beliefs with their confidence, and how it changed its mind', () => {
    renderSite(world, out)
    const html = page('notebook/index.html')
    expect(html).toContain('id="b1"')
    expect(html).toContain('The sunny rock is warm in the morning.')
    expect(html).toContain('The sunny rock is always warm.')
    expect(html).toContain('It was cold at dusk.')
    expect(html).toContain('Fish are friends.')
    expect(html).toMatch(/dropped/i)
  })

  it('shows its reading notes and plans', () => {
    renderSite(world, out)
    const html = page('notebook/index.html')
    expect(html).toContain('Cats are trending')
    expect(html).toContain('https://mastodon.social/tags/caturday')
    expect(html).toContain('Plan for 2026-11-03')
  })

  it('shows each kind of artifact in its own way', () => {
    renderSite(world, out)
    const html = page('gallery/index.html')
    expect(html).toContain('The Sea')
    expect(html).toContain('It never empties.')
    expect(html).toContain('<circle cx="50" cy="50" r="20" fill="orange"/>')
    expect(html).toContain('Berry mash')
    expect(html).toMatch(/250\s*g/)
    expect(html).toContain('data-melody=')
    expect(html).toMatch(/skill 2/i)
  })

  it('shows a photo with its caption and copies the frame next to the pages', () => {
    put('art/the-pond.json', { id: 'the-pond', kind: 'photo', title: 'The <i>pond</i>', content: { image: 'photos/the-pond.jpg', caption: 'The pond at dusk.', opinion: 'Wetter than I thought.', subjectId: 'water-bowl', noticed: true }, skillLevel: 1, createdAt: '2026-11-03T14:00:00Z' })
    mkdirSync(join(world, 'art/photos'), { recursive: true })
    writeFileSync(join(world, 'art/photos/the-pond.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
    renderSite(world, out)
    const html = page('gallery/index.html')
    expect(html).toContain('src="../photos/the-pond.jpg"')
    expect(html).toContain('The pond at dusk.')
    expect(html).toContain('Wetter than I thought.')
    expect(html).not.toContain('<i>pond</i>')
    expect(readFileSync(join(out, 'photos/the-pond.jpg')).length).toBe(4)
  })

  it('shows a contraption run with what the physics did and what it made of it', () => {
    put('art/run-one.json', { id: 'run-one', kind: 'contraption', title: 'Run <b>one</b>', content: { objectId: 'marble-run', moved: true, maxTravel: 1.23, settled: false, notes: 'It rolled <i>off</i> the end.', opinion: 'Again.' }, skillLevel: 1, createdAt: '2026-11-03T15:00:00Z' })
    renderSite(world, out)
    const html = page('gallery/index.html')
    expect(html).toContain('It rolled &lt;i&gt;off&lt;/i&gt; the end.')
    expect(html).not.toContain('<i>off</i>')
    expect(html).toMatch(/moved 1\.23 m/)
    expect(html).toMatch(/still moving/)
    expect(html).toContain('Again.')
  })

  describe('coded projects', () => {
    const codeArt = { id: 'gate-toy', kind: 'code', title: 'Gate <b>toy</b>', content: { project: 'gate-toy', idea: 'A toy of <i>logic</i> gates.', howItPlays: 'Click the switches.' }, skillLevel: 2, createdAt: '2026-11-03T16:00:00Z' }
    beforeEach(() => {
      put('art/gate-toy.json', codeArt)
      put('site/projects/gate-toy/index.html', '<!doctype html><title>Gate toy</title><script src="app.js"></script>')
      put('site/projects/gate-toy/app.js', 'console.log(1)')
      put('site/projects/gate-toy/notes/readme.json', '{}')
      put('site/projects/gate-toy/payload.exe', 'MZ')
      put('site/projects/unreviewed/index.html', '<!doctype html>')
    })

    it('puts the project on the site, next to the pages, and links it from the gallery', () => {
      renderSite(world, out)
      expect(readFileSync(join(out, 'projects/gate-toy/index.html'), 'utf8')).toContain('Gate toy')
      expect(readFileSync(join(out, 'projects/gate-toy/app.js'), 'utf8')).toBe('console.log(1)')
      expect(readFileSync(join(out, 'projects/gate-toy/notes/readme.json'), 'utf8')).toBe('{}')
      const html = page('gallery/index.html')
      expect(html).toContain('href="../projects/gate-toy/"')
      expect(html).toContain('A toy of &lt;i&gt;logic&lt;/i&gt; gates.')
      expect(html).toContain('Click the switches.')
      expect(html).not.toContain('<i>logic</i>')
    })

    it('copies only the file types a project may have, and only for a project with an artifact', () => {
      renderSite(world, out)
      expect(existsSync(join(out, 'projects/gate-toy/payload.exe'))).toBe(false)
      expect(existsSync(join(out, 'projects/unreviewed'))).toBe(false)
    })

    it('shows the card without a link when the project folder is missing', () => {
      put('art/ghost.json', { ...codeArt, id: 'ghost', title: 'Ghost', content: { ...codeArt.content, project: 'ghost' } })
      renderSite(world, out)
      const html = page('gallery/index.html')
      expect(html).toContain('Ghost')
      expect(html).not.toContain('href="../projects/ghost/"')
    })
  })

  it('loads the sound library only when there is a melody to play', () => {
    renderSite(world, out)
    expect(page('gallery/index.html')).toMatch(/cdnjs\.cloudflare\.com\/ajax\/libs\/tone\/\d+\.\d+\.\d+\//)
    expect(page('index.html')).not.toMatch(/cdnjs/)
    const empty = mkdtempSync(join(tmpdir(), 'site-out2-'))
    const noMelody = mkdtempSync(join(tmpdir(), 'site-world2-'))
    copyFileSync(join(merge, 'forkling.json'), join(noMelody, 'forkling.json'))
    renderSite(noMelody, empty)
    expect(readFileSync(join(empty, 'gallery/index.html'), 'utf8')).not.toMatch(/cdnjs/)
  })

  it('traces an obsession back to the feed item that started it', () => {
    renderSite(world, out)
    const html = page('obsessions/index.html')
    expect(html).toContain('logic gates')
    expect(html).toContain('A CPU built in Minecraft')
    expect(html).toContain('href="https://example.com/cpu"')
    expect(html).toContain('comets')
    expect(html).toContain('Comet C/2026')
  })

  it('answers "why?" for every step: when, what, the reason, the goal, and the beliefs behind it', () => {
    renderSite(world, out)
    const html = page('why/index.html')
    expect(html).toContain('I want to know how they work.')
    expect(html).toContain('today:0')
    expect(html).toContain('href="../notebook/#b1"')
    expect(html.indexOf('Resting.')).toBeLessThan(html.indexOf('I want to know how they work.'))
    expect(html).toMatch(/10:00/) // 09:00Z in Stockholm
  })

  it('never lets what it wrote become markup or script', () => {
    renderSite(world, out)
    for (const rel of ['index.html', 'journal/index.html', 'journal/2026-11-03.html', 'notebook/index.html', 'gallery/index.html', 'why/index.html', 'obsessions/index.html']) {
      const html = page(rel)
      // Hostile text may appear, but only as escaped text: never as a tag, a handler or a script of its own.
      expect(html, rel).not.toMatch(/<script>alert|<img|<b>big|steal\(\)/)
      expect(html, rel).not.toMatch(/<[^>]*\son(error|load|click|mouseover)=/i)
      expect(html, rel).not.toMatch(/(href|src)="javascript:/i)
    }
    expect(page('gallery/index.html')).toContain('Hill &lt;b&gt;big&lt;/b&gt;')
  })

  it('renders a brand new world with nothing in it yet', () => {
    const fresh = mkdtempSync(join(tmpdir(), 'site-fresh-'))
    copyFileSync(join(merge, 'forkling.json'), join(fresh, 'forkling.json'))
    const dest = mkdtempSync(join(tmpdir(), 'site-fresh-out-'))
    renderSite(fresh, dest)
    expect(readFileSync(join(dest, 'index.html'), 'utf8')).toContain('Merge')
    expect(readFileSync(join(dest, 'journal/index.html'), 'utf8')).toMatch(/nothing yet/i)
    expect(readFileSync(join(dest, 'gallery/index.html'), 'utf8')).toMatch(/nothing yet/i)
  })

  it('skips a file that does not fit its schema instead of failing the site', () => {
    put('art/broken.json', { id: 'broken', kind: 'melody', title: 'x', content: { text: 'not a melody' }, skillLevel: 1, createdAt: '2026-11-03T14:00:00Z' })
    put('memory/beliefs.json', 'not json')
    expect(() => renderSite(world, out)).not.toThrow()
    expect(page('gallery/index.html')).not.toContain('broken')
  })
})
