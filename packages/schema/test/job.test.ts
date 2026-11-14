import { describe, expect, it } from 'vitest'
import { ExpandJob, FoundJob, JobRequest, JobResult, MindState, TinkerJob } from '../src/index.ts'

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

describe('ExpandJob (an expand the mind asks the worker for, spec 10.2)', () => {
  const job = { id: 'expand-20261114-1031', kind: 'expand', requestedAt: '2026-11-14T10:31:00Z', placeId: 'house-of-lights', reason: 'The signals keep coming and the hall is full.' }
  it('is a job of kind expand, naming the place and the reason in its own words', () => {
    expect(ExpandJob.parse(job)).toMatchObject({ kind: 'expand', placeId: 'house-of-lights' })
    expect(ExpandJob.safeParse({ ...job, kind: 'tinker' }).success).toBe(false)
    expect(ExpandJob.safeParse({ ...job, placeId: '../x' }).success).toBe(false)
    expect(ExpandJob.safeParse({ ...job, reason: '' }).success).toBe(false)
    expect(ExpandJob.safeParse({ ...job, reason: 'x'.repeat(201) }).success).toBe(false)
  })
})

describe('JobResult of an expand (spec 10.2: the worker returns the validated change, the loop writes the place)', () => {
  const base = { id: 'expand-20261114-1031', kind: 'expand', status: 'done', at: '2026-11-14T12:00:00Z' }
  const patch = { verb: 'expand', change: { kind: 'path', to: 'workshop' }, summary: 'A path to the Workshop.' }

  it('carries the place, the patch, the wishes, the constraint and the collision', () => {
    const r = JobResult.parse({
      ...base,
      placeId: 'house-of-lights',
      patch,
      wishes: [{ name: 'Spiral staircase', description: 'A staircase that turns.', forPlace: 'house-of-lights' }],
      constraint: { text: 'Use only two colours.', refused: true, reason: 'The hall needs a third.' },
      collision: ['s1', 's2'],
    })
    expect(r.patch).toMatchObject({ verb: 'expand' })
    expect(r.wishes).toHaveLength(1)
    expect(r.constraint).toMatchObject({ refused: true })
  })

  it('refuses a patch that is not an expand, more than 2 wishes, and a collision that is not a pair', () => {
    expect(JobResult.safeParse({ ...base, patch: { verb: 'tend', summary: 'x' } }).success).toBe(false)
    const wish = { name: 'A', description: 'a', forPlace: null }
    expect(JobResult.safeParse({ ...base, wishes: [wish, wish, wish] }).success).toBe(false)
    expect(JobResult.safeParse({ ...base, collision: ['only-one'] }).success).toBe(false)
  })

  it('stays valid with none of them (a work or an old result)', () => {
    expect(JobResult.safeParse(base).success).toBe(true)
  })
})

describe('FoundJob (the fallback build of a place request nobody answered, spec 10.3)', () => {
  const job = { id: 'found-20261110-1000', kind: 'found', requestedAt: '2026-11-10T10:00:00Z', requestId: 'lantern-hall' }
  it('is a job of kind found, naming the request', () => {
    expect(FoundJob.parse(job)).toMatchObject({ kind: 'found', requestId: 'lantern-hall' })
    expect(FoundJob.safeParse({ ...job, kind: 'expand' }).success).toBe(false)
    expect(FoundJob.safeParse({ ...job, requestId: '../x' }).success).toBe(false)
    expect(FoundJob.safeParse({ ...job, requestId: undefined }).success).toBe(false)
  })

  it('comes back as a result that carries the request and the whole new place', () => {
    const place = {
      id: 'lantern-hall',
      name: 'Lantern Hall',
      purpose: 'Where the lidar finds hold up.',
      tags: ['maya lidar'],
      founded: '2026-11-10',
      chunk: [1, 0],
      related: [],
      exterior: { style: 'timber', footprint: [10, 8], floors: 1, palette: 'meadow', sign: 'LANTERN HALL' },
      rooms: [{ id: 'main', name: 'Main room', size: [8, 6, 3], parts: [{ part: 'shelf-low', at: [0, 0, 2], rot: 0 }] }],
      exhibits: [],
      state: { construction: null, lastCareAt: null, neglect: 0, lamps: true },
      history: [{ at: '2026-11-10T10:05:00Z', verb: 'found', summary: 'Built by Merge from the kit.' }],
    }
    const r = JobResult.parse({ id: job.id, kind: 'found', status: 'done', requestId: 'lantern-hall', place, at: '2026-11-10T10:05:00Z' })
    expect(r.place).toMatchObject({ id: 'lantern-hall', chunk: [1, 0] })
    expect(r.requestId).toBe('lantern-hall')
    expect(JobResult.safeParse({ id: job.id, kind: 'found', status: 'done', place: { id: 'x' }, at: '2026-11-10T10:05:00Z' }).success).toBe(false)
  })
})
