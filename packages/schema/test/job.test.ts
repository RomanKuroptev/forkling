import { describe, expect, it } from 'vitest'
import { JobRequest, JobResult } from '../src/index.ts'

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
    expect(JobResult.parse(ok)).toEqual(ok)
    expect(JobResult.safeParse({ ...ok, status: 'done', reason: undefined }).success).toBe(true)
    expect(JobResult.safeParse({ ...ok, status: 'pending' }).success).toBe(false)
    expect(JobResult.safeParse({ ...ok, reason: 'x'.repeat(301) }).success).toBe(false)
  })
})
