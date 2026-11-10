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
  put('notebook/writing/2026-11-03-1012-the-lamp.md', '# The lamp\n\nA lamp is a small argument with the dark.\n\n<script>steal()</script>\n')
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
    for (const rel of ['index.html', 'journal/index.html', 'journal/2026-11-03.html', 'journal/2026-11-02.html', 'notebook/index.html', 'obsessions/index.html', 'why/index.html', 'style.css']) {
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
    for (const html of [home, deep]) for (const part of ['journal/', 'notebook/', 'obsessions/', 'why/']) expect(html).toContain(part)
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

  it('shows what it wrote, as text, in the notebook', () => {
    renderSite(world, out)
    const html = page('notebook/index.html')
    expect(html).toContain('What it wrote')
    expect(html).toContain('The lamp')
    expect(html).toContain('A lamp is a small argument with the dark.')
  })

  it('has no gallery any more', () => {
    renderSite(world, out)
    expect(existsSync(join(out, 'gallery/index.html'))).toBe(false)
    expect(page('index.html')).not.toContain('gallery/')
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
    for (const rel of ['index.html', 'journal/index.html', 'journal/2026-11-03.html', 'notebook/index.html', 'why/index.html', 'obsessions/index.html']) {
      const html = page(rel)
      // Hostile text may appear, but only as escaped text: never as a tag, a handler or a script of its own.
      expect(html, rel).not.toMatch(/<script>(alert|steal)|<img/)
      expect(html, rel).not.toMatch(/<[^>]*\son(error|load|click|mouseover)=/i)
      expect(html, rel).not.toMatch(/(href|src)="javascript:/i)
    }
    expect(page('notebook/index.html')).toContain('&lt;script&gt;steal()&lt;/script&gt;')
  })

  it('renders a brand new world with nothing in it yet', () => {
    const fresh = mkdtempSync(join(tmpdir(), 'site-fresh-'))
    copyFileSync(join(merge, 'forkling.json'), join(fresh, 'forkling.json'))
    const dest = mkdtempSync(join(tmpdir(), 'site-fresh-out-'))
    renderSite(fresh, dest)
    expect(readFileSync(join(dest, 'index.html'), 'utf8')).toContain('Merge')
    expect(readFileSync(join(dest, 'journal/index.html'), 'utf8')).toMatch(/nothing yet/i)
    expect(readFileSync(join(dest, 'notebook/index.html'), 'utf8')).toMatch(/nothing yet/i)
  })

  it('skips a file that does not fit its schema instead of failing the site', () => {
    put('memory/beliefs.json', 'not json')
    expect(() => renderSite(world, out)).not.toThrow()
  })
})
