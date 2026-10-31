import { describe, expect, it } from 'vitest'
import { ArtContent, Artifact, ArtOutput, PropertyFilter, WorldObject } from '../src/index.ts'

const part = (at: [number, number, number]) => ({ shape: 'box', size: [0.4, 0.4, 0.4], at, color: '#aa8855' })
const marble = { shape: 'sphere', size: [0.2, 0.2, 0.2], at: [0, 1, 0], color: '#cc3333' }

const base = {
  id: 'marble-run',
  kind: 'contraption',
  name: 'A marble run',
  position: [4, 0, 5],
  model: { parts: [part([0, 0.2, 0]), part([1, 0.2, 0]), marble] },
  contraption: {
    bodies: [
      { part: 0, body: 'fixed' },
      { part: 1, body: 'fixed' },
      { part: 2, body: 'dynamic', massKg: 0.2 },
    ],
    trigger: { part: 2, impulse: [1, 0, 0] },
    runSec: 6,
  },
  reason: 'I wanted to see it roll.',
}

describe('a contraption on an object', () => {
  it('parses: which parts are fixed, which move, and the push that sets it off', () => {
    const o = WorldObject.parse(base)
    expect(o.contraption?.bodies[2]).toEqual({ part: 2, body: 'dynamic', massKg: 0.2 })
    expect(o.contraption?.bodies[0]?.massKg).toBe(1)
    expect(o.contraption?.trigger).toEqual({ part: 2, impulse: [1, 0, 0] })
  })

  it('is optional: most objects are not contraptions', () => {
    const { contraption: _c, ...plain } = base
    expect(WorldObject.parse(plain).contraption).toBeUndefined()
  })

  it('has to point at parts that exist', () => {
    const bad = { ...base, contraption: { ...base.contraption, bodies: [...base.contraption.bodies, { part: 3, body: 'fixed' }] } }
    expect(WorldObject.safeParse(bad).success).toBe(false)
  })

  it('has to be pushed on a part that moves', () => {
    expect(WorldObject.safeParse({ ...base, contraption: { ...base.contraption, trigger: { part: 0, impulse: [1, 0, 0] } } }).success).toBe(false)
  })

  it('keeps the push small and the run short', () => {
    expect(WorldObject.safeParse({ ...base, contraption: { ...base.contraption, trigger: { part: 2, impulse: [30, 0, 0] } } }).success).toBe(false)
    expect(WorldObject.safeParse({ ...base, contraption: { ...base.contraption, runSec: 60 } }).success).toBe(false)
  })

  it('needs parts to move, not a ready-made model', () => {
    expect(WorldObject.safeParse({ ...base, model: { asset: 'nature/rock_largeA' } }).success).toBe(false)
  })

  it('does not list a part twice', () => {
    const dup = { ...base, contraption: { ...base.contraption, bodies: [{ part: 2, body: 'dynamic' }, { part: 2, body: 'fixed' }] } }
    expect(WorldObject.safeParse(dup).success).toBe(false)
  })

  it('remembers the last time it ran', () => {
    const o = WorldObject.parse({ ...base, contraption: { ...base.contraption, lastRun: { at: '2026-11-03T12:00:00Z', moved: true, maxTravel: 1.4, settled: true } } })
    expect(o.contraption?.lastRun).toMatchObject({ moved: true, settled: true })
  })
})

describe('what a verb can target', () => {
  it('can ask for a mechanism', () => {
    expect(PropertyFilter.parse({ mechanism: true })).toEqual({ mechanism: true })
  })
})

describe('the contraption artifact', () => {
  const content = { objectId: 'marble-run', moved: true, maxTravel: 1.2, settled: true, notes: 'It rolled off the end.', opinion: 'Again.' }
  const meta = { id: 'run-one', title: 'Run one', skillLevel: 1, createdAt: '2026-11-03T12:00:00Z' }

  it('keeps what happened and what it thought', () => {
    expect(Artifact.safeParse({ ...meta, kind: 'contraption', content }).success).toBe(true)
    expect(ArtContent.contraption.safeParse({ ...content, notes: '' }).success).toBe(false)
  })

  it('takes only words from the model: what happened is measured, not claimed', () => {
    expect(Object.keys(ArtOutput.contraption.shape).sort()).toEqual(['notes', 'opinion', 'title'])
  })
})

describe('the code artifact', () => {
  const meta = { id: 'gate-toy', title: 'Gate toy', skillLevel: 1, createdAt: '2026-11-03T12:00:00Z' }
  const content = { project: 'gate-toy', idea: 'A toy where you wire up logic gates.', howItPlays: 'Click the switches and watch the lamp.' }

  it('keeps the project it lives in, what it is and how it plays', () => {
    expect(Artifact.safeParse({ ...meta, kind: 'code', content }).success).toBe(true)
  })

  it('names the project like a folder, so it cannot point anywhere else', () => {
    for (const project of ['../x', 'a/b', 'A B', '']) expect(Artifact.safeParse({ ...meta, kind: 'code', content: { ...content, project } }).success, project).toBe(false)
  })

  it('takes words only from the model: where the project lives is the engine\'s', () => {
    expect(Object.keys(ArtOutput.code.shape).sort()).toEqual(['howItPlays', 'idea', 'title'])
  })
})

describe('MindState codeWeek', () => {
  it('counts the coded projects asked for in an ISO week', async () => {
    const { MindState } = await import('../src/index.ts')
    expect(MindState.parse({}).codeWeek).toBeUndefined()
    expect(MindState.parse({ codeWeek: { week: '2026-W45', count: 1 } }).codeWeek).toEqual({ week: '2026-W45', count: 1 })
    expect(MindState.safeParse({ codeWeek: { week: 'last week', count: 1 } }).success).toBe(false)
  })
})
