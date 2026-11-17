import { describe, expect, it } from 'vitest'
import { canStartProject, MAX_BUILDING, Project, PROJECT_LIMITS, projectIdFor, ProjectSession } from '../src/project.ts'

/** Spec-v4 3.1: a project, `projects/<id>/project.json`. */

const AT = '2026-11-18T10:00:00.000+01:00'
const session = (over: Partial<ProjectSession> = {}): ProjectSession => ({ at: AT, caption: 'drew the first ring', usd: 0.21, turns: 9, shot: 'shots/1.png', broken: false, engine: false, ...over })
const project = (over: Record<string, unknown> = {}) => ({
  id: 'tide-clock',
  name: 'Tide clock',
  aim: 'A clock that tells the time by how full a pool is.',
  started: AT,
  status: 'building',
  reason: null,
  sessions: [],
  inspiredBy: null,
  installedIn: null,
  ...over,
})
const issues = (value: unknown) => {
  const r = Project.safeParse(value)
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
}

describe('Project (spec-v4 3.1)', () => {
  it('takes a new project with no sessions, and one with sessions', () => {
    expect(issues(project())).toEqual([])
    expect(issues(project({ sessions: [session(), session({ caption: 'Stopped at the session limit.', engine: true, broken: true, shot: null })] }))).toEqual([])
  })

  it('holds the limits of 3.1', () => {
    expect(PROJECT_LIMITS).toEqual({ files: 40, fileBytes: 500 * 1024, totalBytes: 2 * 1024 * 1024 })
    expect(MAX_BUILDING).toBe(3)
  })

  it.each([
    ['a name of 2 characters', { name: 'ab' }],
    ['a name of 41 characters', { name: 'x'.repeat(41) }],
    ['an empty aim', { aim: '' }],
    ['an aim of 141 characters', { aim: 'x'.repeat(141) }],
    ['a reason of 141 characters', { status: 'done', reason: 'x'.repeat(141) }],
    ['an id that is not a slug', { id: 'Tide Clock' }],
    ['an unknown status', { status: 'paused' }],
    ['a start that is not a time', { started: 'yesterday' }],
    ['a caption of 141 characters', { sessions: [session({ caption: 'x'.repeat(141) })] }],
    ['an empty caption', { sessions: [session({ caption: '' })] }],
    ['a negative cost', { sessions: [session({ usd: -0.01 })] }],
    ['26 turns', { sessions: [session({ turns: 26 })] }],
    ['a shot outside shots/', { sessions: [session({ shot: '../x.png' })] }],
    ['a place slot of 81 characters', { installedIn: 'x'.repeat(81) }],
  ])('refuses %s', (_, over) => {
    expect(issues(project(over))).not.toEqual([])
  })

  it('takes names of 3 and 40 characters, and texts of exactly 140', () => {
    expect(issues(project({ name: 'abc' }))).toEqual([])
    expect(issues(project({ name: 'x'.repeat(40), aim: 'x'.repeat(140), sessions: [session({ caption: 'x'.repeat(140) })] }))).toEqual([])
  })

  it('needs a reason for done and for abandoned', () => {
    expect(issues(project({ status: 'done' })).join(' ')).toMatch(/reason/)
    expect(issues(project({ status: 'abandoned' })).join(' ')).toMatch(/reason/)
    expect(issues(project({ status: 'done', reason: 'it tells the time now' }))).toEqual([])
    expect(issues(project({ status: 'abandoned', reason: 'pools are hard to draw' }))).toEqual([])
  })

  it('has no reason while it is building', () => {
    expect(issues(project({ reason: 'not yet' })).join(' ')).toMatch(/reason/)
  })
})

describe('canStartProject: at most 3 building at once (a storage rail, spec-v4 3.1)', () => {
  const p = (status: string) => Project.parse(project({ id: `p-${Math.random().toString(36).slice(2, 8)}`, status, reason: status === 'building' ? null : 'because' }))

  it('lets a project start beside 2 building, and any number done or abandoned', () => {
    expect(canStartProject([p('building'), p('building'), p('done'), p('abandoned'), p('done')])).toEqual({ ok: true })
  })

  it('refuses a fourth, with a plain reason', () => {
    const r = canStartProject([p('building'), p('building'), p('building')])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(/3 projects/)
  })
})

describe('projectIdFor: the id is a slug of the first name and never changes', () => {
  it('makes a slug', () => {
    expect(projectIdFor('Tide Clock!', [])).toBe('tide-clock')
    expect(projectIdFor('  Ünïcode  café ', [])).toBe('unicode-cafe')
  })

  it('never takes an id that is there, building or not', () => {
    expect(projectIdFor('Tide clock', ['tide-clock'])).toBe('tide-clock-2')
    expect(projectIdFor('Tide clock', ['tide-clock', 'tide-clock-2'])).toBe('tide-clock-3')
  })

  it('falls back when nothing of the name is left', () => {
    expect(projectIdFor('!!!', [])).toBe('project')
  })

  it('is a valid id', () => {
    for (const name of ['Tide clock', 'x'.repeat(40), '123 go']) expect(Project.shape.id.safeParse(projectIdFor(name, [])).success).toBe(true)
  })
})

describe('inspiredBy (spec v4 7, shared with a work)', () => {
  it('takes a note id and the name given, or null, and is optional', () => {
    expect(issues(project({ inspiredBy: { noteId: 'n-20261118-1', name: 'Ada' } }))).toEqual([])
    const { inspiredBy: _, ...without } = project()
    expect(Project.parse(without).inspiredBy).toBeNull()
    expect(issues(project({ inspiredBy: { note: 'x' } }))).not.toEqual([])
  })
})
