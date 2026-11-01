import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { Artifact, Goals, type ReadingNote } from '@forkling/schema'
import { parsePlanReason, parseReadingNote, readRecentPast } from '../src/past.ts'
import { renderPlan, renderReadingNote } from '../src/reading.ts'

const note: ReadingNote = { note: { title: 'A CPU in Minecraft', text: 'Someone built logic gates out of redstone. It is slow, but it computes. I want to know how.\n\nSecond paragraph.' }, interests: [] }
const goals = Goals.parse({
  long: { text: 'Learn logic.', reason: 'It is a puzzle.', setAt: '2026-11-01T07:00:00Z', reviewedAt: '2026-11-01T07:00:00Z' },
  today: { date: '2026-11-02', steps: [{ verb: 'read', targetId: 'bookshelf', reason: 'There is a page I want.', minutes: 20 }], reason: 'A day for finding out how things work.' },
})

describe('parsing what it wrote', () => {
  it('takes the title and the opening of a reading note', () => {
    const parsed = parseReadingNote(renderReadingNote('2026-11-02', note, []))
    expect(parsed).toEqual({ title: 'A CPU in Minecraft', summary: 'Someone built logic gates out of redstone.' })
  })

  it('takes the reason for a day from its plan, with or without a long goal', () => {
    expect(parsePlanReason(renderPlan('2026-11-02', goals))).toBe('A day for finding out how things work.')
    expect(parsePlanReason(renderPlan('2026-11-02', Goals.parse({ today: goals.today })))).toBe('A day for finding out how things work.')
  })

  it('gives nothing for a file that is not one of those', () => {
    expect(parseReadingNote('')).toBeNull()
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

  it('reads the last three notes, newest first, with the date from the file name', () => {
    for (const [name, title] of [['2026-10-30-1', 'Old'], ['2026-11-01-1', 'One'], ['2026-11-02-1', 'Two'], ['2026-11-02-2', 'Three']] as const) {
      put(`notebook/reading/${name}.md`, renderReadingNote(name.slice(0, 10), { ...note, note: { title, text: `About ${title}. More.` } }, []))
    }
    const { readings } = readRecentPast(dir, '2026-11-03', [])
    expect(readings).toEqual([
      { date: '2026-11-02', title: 'Three', summary: 'About Three.' },
      { date: '2026-11-02', title: 'Two', summary: 'About Two.' },
      { date: '2026-11-01', title: 'One', summary: 'About One.' },
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
