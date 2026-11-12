import { describe, expect, it } from 'vitest'
import { JobRequest, JobResult, MindState, TinkerJob } from '../src/index.ts'

describe('JobRequest (a file the build worker finds in mind/builds/)', () => {
  it('needs an id, a kind and when it was asked for, and keeps any other fields for the handler', () => {
    const parsed = JobRequest.parse({ id: 'a-lamp', kind: 'tinker', requestedAt: '2026-11-12T10:00:00Z', idea: 'a lamp' })
    expect(parsed).toMatchObject({ id: 'a-lamp', kind: 'tinker', idea: 'a lamp' })
  })

  it('refuses an id that is not a plain slug', () => {
    expect(JobRequest.safeParse({ id: '../x', kind: 'tinker', requestedAt: '2026-11-12T10:00:00Z' }).success).toBe(false)
    expect(JobRequest.safeParse({ id: 'A Lamp', kind: 'tinker', requestedAt: '2026-11-12T10:00:00Z' }).success).toBe(false)
  })
})

describe('JobResult (mind/builds/<id>.result.json)', () => {
  const ok = { id: 'a-lamp', kind: 'tinker', status: 'failed', reason: 'closed after 48 hours with no result', at: '2026-11-14T10:00:00Z' }

  it('is done or failed, with a reason that stays short', () => {
    expect(JobResult.parse(ok)).toEqual({ ...ok, calls: [] })
    expect(JobResult.safeParse({ ...ok, status: 'done', reason: undefined }).success).toBe(true)
    expect(JobResult.safeParse({ ...ok, status: 'pending' }).success).toBe(false)
    expect(JobResult.safeParse({ ...ok, reason: 'x'.repeat(301) }).success).toBe(false)
  })
})

describe('TinkerJob (a full work the mind asks the worker for, spec 10.2)', () => {
  const job = { id: 'tinker-20261114-1031', kind: 'tinker', requestedAt: '2026-11-14T10:31:00Z', idea: 'a clock made of a tide pool', reason: 'I keep coming back to the tide pools.' }
  it('is a job of kind tinker, with the idea and the reason in its own words', () => {
    expect(TinkerJob.parse(job)).toMatchObject({ kind: 'tinker', idea: 'a clock made of a tide pool', remixOf: null })
    expect(TinkerJob.safeParse({ ...job, kind: 'expand' }).success).toBe(false)
    expect(TinkerJob.safeParse({ ...job, idea: '' }).success).toBe(false)
    expect(TinkerJob.safeParse({ ...job, idea: 'x'.repeat(121) }).success).toBe(false)
    expect(TinkerJob.safeParse({ ...job, reason: 'x'.repeat(201) }).success).toBe(false)
  })

  it('may remix an earlier work', () => {
    expect(TinkerJob.parse({ ...job, remixOf: 'old-clock' }).remixOf).toBe('old-clock')
    expect(TinkerJob.safeParse({ ...job, remixOf: '../x' }).success).toBe(false)
  })
})

describe('JobResult for a work', () => {
  const base = { id: 'tinker-20261114-1031', kind: 'tinker', status: 'done', at: '2026-11-14T12:00:00Z' }
  it('names the work, its status and the pull request, and carries what the calls cost so the mind can book it once', () => {
    const call = { at: '2026-11-14T11:00:00Z', kind: 'tinker', model: 'claude-sonnet-5-5', input: 1000, cacheRead: 0, cacheWrite: 0, output: 500, usd: 0.007 }
    const r = JobResult.parse({ ...base, workId: 'tide-pool-clock', title: 'Tide pool clock', workStatus: 'shelf', prUrl: 'https://github.com/RomanKuroptev/merge/pull/3', calls: [call] })
    expect(r).toMatchObject({ workId: 'tide-pool-clock', workStatus: 'shelf', calls: [call] })
    expect(JobResult.parse(base).calls).toEqual([])
    expect(JobResult.safeParse({ ...base, workStatus: 'published' }).success).toBe(false)
  })
})

describe('MindState.jobs (results seen, and results the mind has not answered yet)', () => {
  it('is absent in an older file and fills its defaults when there', () => {
    expect(MindState.parse({}).jobs).toBeUndefined()
    expect(MindState.parse({ jobs: {} }).jobs).toEqual({ seen: [], pending: [] })
  })
})
