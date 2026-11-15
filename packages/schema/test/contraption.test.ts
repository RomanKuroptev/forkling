import { describe, expect, it } from 'vitest'
import { ArtContent, Artifact, ArtOutput } from '../src/index.ts'

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
