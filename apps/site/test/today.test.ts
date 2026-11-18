import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Project, WorkMeta } from '@forkling/schema'
import { renderSite } from '../src/render.ts'
import { buildToday, cardCandidates, currentProject, pickCards, whoLine } from '../src/today.ts'
import type { SiteProject } from '../src/projects.ts'
import type { SiteWork } from '../src/workshop.ts'

const TZ = 'Europe/Stockholm'
const NOW = Date.parse('2026-11-18T10:00:00Z')

const project = (id: string, sessions: { at: string; caption: string; shot: boolean }[], over: Partial<Record<string, unknown>> = {}): SiteProject => {
  const p = Project.parse({
    id,
    name: `Project ${id}`,
    aim: 'an aim',
    started: '2026-11-10T08:00:00Z',
    status: 'building',
    sessions: sessions.map((s, n) => ({ at: s.at, caption: s.caption, usd: 0.1, turns: 3, shot: s.shot ? `shots/${n}.png` : null, broken: false })),
    ...over,
  })
  return { project: p, shots: p.sessions.map((s) => s.shot), runnable: false, video: false }
}
const work = (id: string, made: string, over: Partial<Record<string, unknown>> = {}, hasThumb = true): SiteWork => ({
  meta: WorkMeta.parse({ id, title: `Work ${id}`, kind: 'art', about: 'about it', interest: null, made, status: 'shelf', size: 'sketch', ...over }),
  hasThumb,
})

describe('the cards of today.json (step 7, slice A)', () => {
  it('takes a project session\'s screenshot before a work, and shows today\'s cards newest first', () => {
    const projects = [project('toast', [{ at: '2026-11-18T07:00:00Z', caption: 'morning shot', shot: true }, { at: '2026-11-18T09:00:00Z', caption: 'late shot', shot: true }])]
    const works = [work('w1', '2026-11-18T09:30:00Z'), work('w2', '2026-11-18T08:00:00Z')]
    const cards = pickCards(cardCandidates(projects, works), NOW, TZ)
    // Three of today's four: both project shots (best kind) and the newest work, newest first.
    expect(cards.map((c) => c.caption)).toEqual(['about it', 'late shot', 'morning shot'])
    expect(cards.map((c) => c.kind)).toEqual(['work', 'project', 'project'])
    expect(cards.every((c) => !c.day)).toBe(true)
  })

  it('still gives three cards on a day with nothing, from earlier days, each marked with its day', () => {
    const works = [work('a', '2026-11-17T10:00:00Z'), work('b', '2026-11-16T10:00:00Z'), work('c', '2026-11-15T10:00:00Z'), work('d', '2026-11-14T10:00:00Z')]
    const cards = pickCards(cardCandidates([], works), NOW, TZ)
    expect(cards).toHaveLength(3)
    expect(cards.map((c) => c.day)).toEqual(['2026-11-17', '2026-11-16', '2026-11-15'])
  })

  it('fills up from earlier days when today has fewer than three, today\'s first', () => {
    const works = [work('t', '2026-11-18T08:00:00Z'), work('y', '2026-11-17T08:00:00Z'), work('z', '2026-11-16T08:00:00Z')]
    const cards = pickCards(cardCandidates([], works), NOW, TZ)
    expect(cards.map((c) => c.title)).toEqual(['Work t', 'Work y', 'Work z'])
    expect(cards.map((c) => c.day)).toEqual([undefined, '2026-11-17', '2026-11-16'])
  })

  it('counts the day in Merge\'s time zone, not UTC', () => {
    // 23:30 UTC on the 17th is already the 18th in Stockholm.
    const cards = pickCards(cardCandidates([], [work('late', '2026-11-17T23:30:00Z')]), NOW, TZ)
    expect(cards[0]!.day).toBeUndefined()
  })

  it('never makes a card without a picture: no thumbnail, no screenshot on disk, no scrap', () => {
    const projects = [project('p', [{ at: '2026-11-18T07:00:00Z', caption: 'no picture', shot: false }])]
    const works = [work('nothumb', '2026-11-18T08:00:00Z', {}, false), work('scrap', '2026-11-18T08:30:00Z', { status: 'scrap', scrapReason: 'broken' })]
    expect(cardCandidates(projects, works)).toEqual([])
    expect(pickCards(cardCandidates(projects, works), NOW, TZ)).toEqual([])
  })

  it('gives each card a picture path, a page to open, a title and a caption', () => {
    const [card] = pickCards(cardCandidates([project('toast', [{ at: '2026-11-18T07:00:00Z', caption: 'a shot', shot: true }])], []), NOW, TZ)
    expect(card).toEqual({ kind: 'project', title: 'Project toast', caption: 'a shot', image: 'projects/toast/shots/0.png', href: 'projects/toast/', at: '2026-11-18T07:00:00Z' })
  })
})

describe('the rest of today.json', () => {
  it('has one line on who Merge is: the first sentence of about.md, up to 120 characters, without markup', () => {
    expect(whoLine({ current: '# About me\n\nI am **Merge**, an AI that lives here. I make small things.', history: [] })).toBe('I am Merge, an AI that lives here.')
    expect(whoLine({ current: 'A'.repeat(300), history: [] }).length).toBeLessThanOrEqual(120)
    expect(whoLine({ current: null, history: [] })).toBe('')
  })

  it('names the building project worked on most recently, with its newest screenshot and caption', () => {
    const older = project('old', [{ at: '2026-11-12T08:00:00Z', caption: 'old news', shot: true }])
    const newer = project('new', [{ at: '2026-11-17T08:00:00Z', caption: 'first', shot: true }, { at: '2026-11-18T08:00:00Z', caption: 'latest, no picture', shot: false }])
    const done = project('done', [{ at: '2026-11-18T09:00:00Z', caption: 'finished', shot: true }], { status: 'done', reason: 'it works' })
    expect(currentProject([older, newer, done])).toEqual({ id: 'new', name: 'Project new', aim: 'an aim', image: 'projects/new/shots/0.png', caption: 'latest, no picture', sessions: 2, href: 'projects/new/', at: '2026-11-18T08:00:00Z' })
    expect(currentProject([done])).toBeNull()
    expect(currentProject([])).toBeNull()
  })

  it('says when it was made', () => {
    expect(buildToday({ projects: [], works: [], about: { current: null, history: [] }, nowMs: NOW, tz: TZ }).updatedAt).toBe('2026-11-18T10:00:00.000Z')
  })
})

describe('the site build writes today.json', () => {
  const templateWorld = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
  it('writes it beside the pages, from the world\'s own files', () => {
    const out = mkdtempSync(join(tmpdir(), 'today-'))
    renderSite(templateWorld, out, { now: new Date(NOW) })
    const today = JSON.parse(readFileSync(join(out, 'today.json'), 'utf8')) as { who: string; cards: unknown[]; project: unknown; updatedAt: string }
    expect(Array.isArray(today.cards)).toBe(true)
    expect(today.updatedAt).toBe('2026-11-18T10:00:00.000Z')
    expect(typeof today.who).toBe('string')
  })
})
