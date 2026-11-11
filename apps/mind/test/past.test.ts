import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { Artifact, Goals } from '@forkling/schema'
import { parsePlanReason, readRecentPast } from '../src/past.ts'
import { renderPlan } from '../src/plan-page.ts'

const trail = (id: string, pages: { title: string; reaction?: string; interest?: number }[]) => ({
  id,
  date: id.slice(0, 10),
  purpose: `Purpose of ${id}.`,
  start: { kind: 'topic', value: 'x' },
  pages: pages.map((p, n) => ({ url: `https://en.wikipedia.org/wiki/${id}-${n}`, title: p.title, fetchedAt: `${id.slice(0, 10)}T10:00:00Z`, topics: [], ...(p.reaction ? { reaction: p.reaction } : {}), ...(p.interest !== undefined ? { interest: p.interest } : {}) })),
})
const goals = Goals.parse({
  long: { text: 'Learn logic.', reason: 'It is a puzzle.', setAt: '2026-11-01T07:00:00Z', reviewedAt: '2026-11-01T07:00:00Z' },
  today: { date: '2026-11-02', steps: [{ verb: 'read', targetId: 'bookshelf', reason: 'There is a page I want.', minutes: 20 }], reason: 'A day for finding out how things work.' },
})

describe('parsing what it wrote', () => {
  it('takes the reason for a day from its plan, with or without a long goal', () => {
    expect(parsePlanReason(renderPlan('2026-11-02', goals))).toBe('A day for finding out how things work.')
    expect(parsePlanReason(renderPlan('2026-11-02', Goals.parse({ today: goals.today })))).toBe('A day for finding out how things work.')
  })

  it('gives nothing for a file that is not one of those', () => {
    expect(parsePlanReason('# Plan for 2026-11-02\n')).toBeNull()
  })
})

describe('readRecentPast', () => {
  let dir: string
  const put = (rel: string, text: string) => {
    mkdirSync(join(dir, rel, '..'), { recursive: true })
    writeFileSync(join(dir, rel), text)
  }
  const art = (id: string, kind: 'writing' | 'drawing', createdAt: string) => Artifact.parse({ id, kind, title: `Title ${id}`, content: kind === 'writing' ? { text: 'x' } : { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>' }, skillLevel: 0, createdAt })

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'past-'))
  })

  it('has nothing to say in a world with no notebook', () => {
    expect(readRecentPast(dir, '2026-11-03', [])).toEqual({ readings: [], plans: [], art: [] })
  })

  it('reads the last three trips, newest first: the page it liked best and what it made of it', () => {
    put('trails/2026-10-30-1.json', JSON.stringify(trail('2026-10-30-1', [{ title: 'Old', reaction: 'Old one.', interest: 9 }])))
    put('trails/2026-11-01-1.json', JSON.stringify(trail('2026-11-01-1', [{ title: 'One', reaction: 'About one.', interest: 4 }])))
    put('trails/2026-11-02-1.json', JSON.stringify(trail('2026-11-02-1', [{ title: 'Two', reaction: 'About two.', interest: 3 }, { title: 'Two b', reaction: 'Better.', interest: 8 }])))
    put('trails/2026-11-02-2.json', JSON.stringify(trail('2026-11-02-2', [{ title: 'Three' }])))
    put('trails/broken.json', '{"nonsense":true}')
    const { readings } = readRecentPast(dir, '2026-11-03', [])
    expect(readings).toEqual([
      { date: '2026-11-02', title: 'Three', summary: 'Purpose of 2026-11-02-2.' },
      { date: '2026-11-02', title: 'Two b', summary: 'Better.' },
      { date: '2026-11-01', title: 'One', summary: 'About one.' },
    ])
  })

  it('reads the reasons of the two days before today, and not today or older', () => {
    for (const d of ['2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03']) put(`notebook/plans/${d}.md`, renderPlan(d, Goals.parse({ today: { ...goals.today, date: d, reason: `Reason of ${d}.` } })))
    expect(readRecentPast(dir, '2026-11-03', []).plans).toEqual([
      { date: '2026-11-02', reason: 'Reason of 2026-11-02.' },
      { date: '2026-11-01', reason: 'Reason of 2026-11-01.' },
    ])
  })

  it('lists the ten latest things it made, newest first', () => {
    const made = Array.from({ length: 12 }, (_, n) => art(`a${n}`, n % 2 ? 'writing' : 'drawing', `2026-10-${String(10 + n).padStart(2, '0')}T10:00:00Z`))
    const { art: recent } = readRecentPast(dir, '2026-11-03', made)
    expect(recent).toHaveLength(10)
    expect(recent[0]).toEqual({ date: '2026-10-21', kind: 'writing', title: 'Title a11' })
    expect(recent.at(-1)!.title).toBe('Title a2')
  })
})
