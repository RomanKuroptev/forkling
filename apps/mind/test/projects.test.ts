import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addSession, createProject, endProject, findProject, readProject, readProjects, writeProject } from '../src/builds/projects.ts'

/** Spec-v4 3.1 on disk: reading and writing `projects/<id>/` in a world. */

const NOW = new Date('2026-11-18T09:00:00.000Z')
let world: string
beforeEach(() => {
  world = mkdtempSync(join(tmpdir(), 'world-'))
})
afterEach(() => rmSync(world, { recursive: true, force: true }))

const make = (name: string, aim = 'to see what happens') => {
  const r = createProject(world, { name, aim, now: NOW })
  if (!r.ok) throw new Error(r.reason)
  return r.project
}

describe('createProject', () => {
  it('writes project.json and makes src/ and shots/, with the id a slug of the name', () => {
    const p = make('Tide Clock', 'A clock that tells the time by how full a pool is.')
    expect(p).toMatchObject({ id: 'tide-clock', name: 'Tide Clock', status: 'building', reason: null, sessions: [], started: NOW.toISOString() })
    expect(JSON.parse(readFileSync(join(world, 'projects/tide-clock/project.json'), 'utf8'))).toEqual(p)
    expect(existsSync(join(world, 'projects/tide-clock/src'))).toBe(true)
    expect(existsSync(join(world, 'projects/tide-clock/shots'))).toBe(true)
  })

  it('never reuses an id, even of a finished project', () => {
    const first = make('Tide clock')
    writeProject(world, endProject(first, 'abandoned', 'pools are hard'))
    expect(make('Tide clock').id).toBe('tide-clock-2')
  })

  it('refuses a fourth project while 3 are building, with a plain reason', () => {
    make('one thing')
    make('two thing')
    make('three thing')
    const r = createProject(world, { name: 'four thing', aim: 'more', now: NOW })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/3 projects/)
    expect(existsSync(join(world, 'projects/four-thing'))).toBe(false)
  })

  it('lets one start when one of the 3 is done', () => {
    const a = make('one thing')
    make('two thing')
    make('three thing')
    writeProject(world, endProject(a, 'done', 'it works'))
    expect(createProject(world, { name: 'four thing', aim: 'more', now: NOW }).ok).toBe(true)
  })

  it('refuses a name under 3 or over 40 characters, and trims it', () => {
    expect(createProject(world, { name: ' ab ', aim: 'x', now: NOW }).ok).toBe(false)
    expect(createProject(world, { name: 'x'.repeat(41), aim: 'x', now: NOW }).ok).toBe(false)
    expect(make('  spaced  ').name).toBe('spaced')
  })

  it('cuts a long aim at a word, to 140 characters', () => {
    const p = make('long aim', `${'word '.repeat(40)}end`)
    expect(p.aim.length).toBeLessThanOrEqual(140)
    expect(p.aim.endsWith('word')).toBe(true)
  })
})

describe('reading', () => {
  it('reads every project, sorted by start, and names a folder whose project.json does not fit', () => {
    make('first one')
    make('second one')
    mkdirSync(join(world, 'projects/broken'), { recursive: true })
    writeFileSync(join(world, 'projects/broken/project.json'), '{"id": "broken"}')
    const r = readProjects(world)
    expect(r.projects.map((p) => p.id)).toEqual(['first-one', 'second-one'])
    expect(r.unreadable).toEqual(['broken'])
  })

  it('reads nothing from a world with no projects/', () => {
    expect(readProjects(world)).toEqual({ projects: [], unreadable: [] })
    expect(readProject(world, 'nope')).toBeNull()
  })

  it('finds a project by id, or by name in any case', () => {
    const p = make('Tide Clock')
    const { projects } = readProjects(world)
    expect(findProject(projects, 'tide-clock')?.id).toBe(p.id)
    expect(findProject(projects, 'tide clock')?.id).toBe(p.id)
    expect(findProject(projects, 'sand clock')).toBeNull()
  })
})

describe('endProject and addSession', () => {
  it('needs a reason to finish or drop, and cuts it to 140', () => {
    const p = make('a thing')
    expect(() => endProject(p, 'done', '  ')).toThrow(/reason/)
    expect(endProject(p, 'abandoned', `${'because '.repeat(30)}`).reason!.length).toBeLessThanOrEqual(140)
  })

  it('adds a session and keeps the project valid', () => {
    const p = addSession(make('a thing'), { at: NOW.toISOString(), caption: 'first rings', usd: 0.12, turns: 7, shot: 'shots/1.png', broken: false, engine: false })
    writeProject(world, p)
    expect(readProject(world, 'a-thing')?.sessions).toHaveLength(1)
  })

  it('refuses to write a project that does not fit', () => {
    const p = make('a thing')
    expect(() => writeProject(world, { ...p, status: 'done' })).toThrow()
  })
})
