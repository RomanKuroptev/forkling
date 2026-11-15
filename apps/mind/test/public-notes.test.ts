import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Note } from '@forkling/schema'
import { createPublicNotes } from '../src/notes.ts'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'public-notes-'))
  mkdirSync(join(dir, 'notes'))
  mkdirSync(join(dir, 'mind'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const put = (n: Partial<Note> & { id: string }) => writeFileSync(join(dir, 'notes', `${n.id}.json`), JSON.stringify(Note.parse({ name: '', message: 'Hi', placeId: 'home', at: '2026-11-16T09:00:00Z', topics: [], status: 'new', ...n })))

describe('the notes the world shows (GET /notes.json, for the viewer)', () => {
  it('gives the notes newest first, as the schema has them', () => {
    put({ id: 'n-2026-11-15-000001', at: '2026-11-15T09:00:00Z' })
    put({ id: 'n-2026-11-16-000002', at: '2026-11-16T09:00:00Z', position: [4, 5] })
    const { notes } = createPublicNotes(dir, () => 0)()
    expect(notes.map((n) => n.id)).toEqual(['n-2026-11-16-000002', 'n-2026-11-15-000001'])
    expect(notes[0]!.position).toEqual([4, 5])
  })

  it('leaves out a note Roman hid, and a file that is not a note', () => {
    put({ id: 'n-2026-11-16-000001' })
    put({ id: 'n-2026-11-16-000002' })
    writeFileSync(join(dir, 'notes', 'junk.json'), '{"nonsense":true}')
    writeFileSync(join(dir, 'mind', 'notes-hidden.json'), JSON.stringify({ hidden: ['n-2026-11-16-000002'] }))
    expect(createPublicNotes(dir, () => 0)().notes.map((n) => n.id)).toEqual(['n-2026-11-16-000001'])
  })

  it('gives at most the newest 100', () => {
    for (let i = 0; i < 105; i++) put({ id: `n-2026-11-16-${String(i).padStart(6, '0')}`, at: new Date(Date.UTC(2026, 10, 16, 0, 0, i)).toISOString() })
    const { notes } = createPublicNotes(dir, () => 0)()
    expect(notes).toHaveLength(100)
    expect(notes[0]!.id).toBe('n-2026-11-16-000104')
  })

  it('reads the folder at most once every 10 seconds, so many visitors do not mean many reads, and then reads again', () => {
    let clock = 0
    const read = createPublicNotes(dir, () => clock)
    put({ id: 'n-2026-11-16-000001' })
    expect(read().notes).toHaveLength(1)
    put({ id: 'n-2026-11-16-000002' })
    clock = 9_999
    expect(read().notes).toHaveLength(1)
    clock = 10_000
    expect(read().notes).toHaveLength(2)
  })

  it('has no notes for a world with no notes folder', () => {
    rmSync(join(dir, 'notes'), { recursive: true })
    expect(createPublicNotes(dir, () => 0)().notes).toEqual([])
  })
})
