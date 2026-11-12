import { describe, expect, it } from 'vitest'
import { MAX_SKETCH_BYTES, MAX_WORK_BYTES, WorkMeta } from '../src/index.ts'

const base = {
  id: 'tide-pool-clock',
  title: 'Tide pool clock',
  kind: 'art',
  about: 'A clock that tells the time by how full a small pool is.',
  interest: 'tide pools',
  made: '2026-11-14T10:00:00Z',
  remixOf: null,
  constraint: null,
  status: 'shelf',
  size: 'full',
  installedIn: null,
  libraries: ['p5'],
}

describe('WorkMeta (spec 7.1)', () => {
  it('parses a shelved work, with the optional fields filled in', () => {
    const meta = WorkMeta.parse(base)
    expect(meta).toMatchObject({ id: 'tide-pool-clock', status: 'shelf', size: 'full', libraries: ['p5'], sources: [] })
    expect(WorkMeta.parse({ ...base, libraries: undefined, sources: undefined })).toMatchObject({ libraries: [], sources: [] })
  })

  it('has the limits of 7.1: a title of 40 characters and an about of 200', () => {
    expect(WorkMeta.safeParse({ ...base, title: 'x'.repeat(40) }).success).toBe(true)
    expect(WorkMeta.safeParse({ ...base, title: 'x'.repeat(41) }).success).toBe(false)
    expect(WorkMeta.safeParse({ ...base, about: 'x'.repeat(200) }).success).toBe(true)
    expect(WorkMeta.safeParse({ ...base, about: 'x'.repeat(201) }).success).toBe(false)
    expect(WorkMeta.safeParse({ ...base, title: '' }).success).toBe(false)
  })

  it('knows the six kinds and the three statuses', () => {
    for (const kind of ['art', 'game', 'tool', 'sound', 'zine']) expect(WorkMeta.safeParse({ ...base, kind }).success, kind).toBe(true)
    expect(WorkMeta.safeParse({ ...base, kind: 'video' }).success).toBe(false)
    for (const status of ['shelf', 'retired']) expect(WorkMeta.safeParse({ ...base, status }).success, status).toBe(true)
    expect(WorkMeta.safeParse({ ...base, status: 'published' }).success).toBe(false)
  })

  it('needs a reason for a scrap and keeps one out of a shelved work', () => {
    expect(WorkMeta.safeParse({ ...base, status: 'scrap' }).success).toBe(false)
    expect(WorkMeta.safeParse({ ...base, status: 'scrap', scrapReason: 'the frame never rendered' }).success).toBe(true)
    expect(WorkMeta.safeParse({ ...base, scrapReason: 'a reason' }).success).toBe(false)
    expect(WorkMeta.safeParse({ ...base, status: 'scrap', scrapReason: 'x'.repeat(301) }).success).toBe(false)
  })

  it('may remix an earlier work, and may be installed in a place slot (not before W5)', () => {
    expect(WorkMeta.safeParse({ ...base, remixOf: 'older-work' }).success).toBe(true)
    expect(WorkMeta.safeParse({ ...base, remixOf: '../x' }).success).toBe(false)
    expect(WorkMeta.safeParse({ ...base, installedIn: 'workshop/screen-1' }).success).toBe(true)
  })

  it('only names libraries the site serves', () => {
    expect(WorkMeta.safeParse({ ...base, libraries: ['p5', 'tone', 'three'] }).success).toBe(true)
    expect(WorkMeta.safeParse({ ...base, libraries: ['jquery'] }).success).toBe(false)
  })

  it('refuses an id that is not a plain slug', () => {
    for (const id of ['', 'A Work', '../x', 'x/y', 'x'.repeat(62)]) expect(WorkMeta.safeParse({ ...base, id }).success, id).toBe(false)
  })

  it('a sketch is a size, not a kind', () => {
    expect(WorkMeta.safeParse({ ...base, size: 'sketch' }).success).toBe(true)
    expect(WorkMeta.safeParse({ ...base, size: 'huge' }).success).toBe(false)
  })

  it('a meme names a format it looked at and one it read about; other kinds may name none (spec 7.7)', () => {
    const meme = { ...base, kind: 'meme' }
    expect(WorkMeta.safeParse(meme).success).toBe(false)
    const looked = { role: 'looked', url: 'https://upload.wikimedia.org/x.jpg' }
    const read = { role: 'read', url: 'https://en.wikipedia.org/wiki/Distracted_boyfriend' }
    expect(WorkMeta.safeParse({ ...meme, sources: [looked] }).success).toBe(false)
    expect(WorkMeta.safeParse({ ...meme, sources: [looked, read] }).success).toBe(true)
    expect(WorkMeta.safeParse({ ...base, sources: [looked] }).success).toBe(true)
  })
})

describe('the size limits (spec 7.1, 7.6)', () => {
  it('are 150 KB for a work and 4 KB for a sketch', () => {
    expect(MAX_WORK_BYTES).toBe(150 * 1024)
    expect(MAX_SKETCH_BYTES).toBe(4 * 1024)
  })
})
