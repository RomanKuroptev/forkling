import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { JobResult } from '@forkling/schema'
import { BUILD_CLOSE_HOURS, createBuildWorker, type BuildHandlers } from '../src/build-worker.ts'

const HOUR = 3_600_000
const NOW = Date.parse('2026-11-14T12:00:00Z')

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'builds-'))
  mkdirSync(join(dir, 'mind/builds'), { recursive: true })
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const request = (id: string, hoursAgo: number, kind = 'tinker') => writeFileSync(join(dir, `mind/builds/${id}.json`), JSON.stringify({ id, kind, requestedAt: new Date(NOW - hoursAgo * HOUR).toISOString() }))
const result = (id: string) => JobResult.parse(JSON.parse(readFileSync(join(dir, `mind/builds/${id}.result.json`), 'utf8')))
const hasResult = (id: string) => existsSync(join(dir, `mind/builds/${id}.result.json`))

describe('the build worker with no jobs (W3: idle)', () => {
  it('does nothing when there is nothing in the queue', async () => {
    const worker = createBuildWorker({ dir, now: () => NOW, handlers: {} })
    expect(await worker.tick()).toEqual({ ran: null, closed: [] })
  })

  it('leaves a request with no handler alone while it is young', async () => {
    request('a-lamp', 2)
    const worker = createBuildWorker({ dir, now: () => NOW, handlers: {} })
    expect(await worker.tick()).toEqual({ ran: null, closed: [] })
    expect(hasResult('a-lamp')).toBe(false)
  })

  it('works when the folder is not there yet', async () => {
    rmSync(join(dir, 'mind'), { recursive: true })
    const worker = createBuildWorker({ dir, now: () => NOW, handlers: {} })
    expect(await worker.tick()).toEqual({ ran: null, closed: [] })
  })
})

describe('a result that never arrives (spec 11.3)', () => {
  it('closes a request after 48 hours as failed, with the reason', async () => {
    expect(BUILD_CLOSE_HOURS).toBe(48)
    request('old-lamp', 49)
    request('new-lamp', 47)
    const worker = createBuildWorker({ dir, now: () => NOW, handlers: {} })
    expect((await worker.tick()).closed).toEqual(['old-lamp'])
    expect(result('old-lamp')).toMatchObject({ id: 'old-lamp', kind: 'tinker', status: 'failed', reason: 'closed after 48 hours with no result' })
    expect(hasResult('new-lamp')).toBe(false)
  })

  it('does not close it twice', async () => {
    request('old-lamp', 60)
    const worker = createBuildWorker({ dir, now: () => NOW, handlers: {} })
    await worker.tick()
    expect((await worker.tick()).closed).toEqual([])
  })
})

describe('running a job', () => {
  const done: BuildHandlers = { tinker: async () => ({ status: 'done' }) }

  it('runs the handler for the kind and writes the result', async () => {
    request('a-lamp', 1)
    const worker = createBuildWorker({ dir, now: () => NOW, handlers: done })
    expect((await worker.tick()).ran).toBe('a-lamp')
    expect(result('a-lamp')).toMatchObject({ status: 'done', kind: 'tinker', at: new Date(NOW).toISOString() })
  })

  it('runs one job a tick, the oldest first', async () => {
    request('second', 1)
    request('first', 5)
    const order: string[] = []
    const worker = createBuildWorker({ dir, now: () => NOW, handlers: { tinker: async (job) => (order.push(job.id), { status: 'done' as const }) } })
    expect((await worker.tick()).ran).toBe('first')
    expect(hasResult('second')).toBe(false)
    expect((await worker.tick()).ran).toBe('second')
    expect(order).toEqual(['first', 'second'])
  })

  it('writes a failed result with the reason when the handler throws, cut to 300 characters', async () => {
    request('a-lamp', 1)
    const worker = createBuildWorker({ dir, now: () => NOW, handlers: { tinker: async () => { throw new Error('x'.repeat(500)) } } })
    await worker.tick()
    const r = result('a-lamp')
    expect(r.status).toBe('failed')
    expect(r.reason).toHaveLength(300)
  })

  it('skips a request that already has a result, and one that is not a request at all', async () => {
    request('finished', 1)
    writeFileSync(join(dir, 'mind/builds/finished.result.json'), JSON.stringify({ id: 'finished', kind: 'tinker', status: 'done', at: new Date(NOW).toISOString() }))
    writeFileSync(join(dir, 'mind/builds/junk.json'), '{ nope')
    writeFileSync(join(dir, 'mind/builds/odd.json'), JSON.stringify({ hello: 'world' }))
    let ran = 0
    const worker = createBuildWorker({ dir, now: () => NOW, handlers: { tinker: async () => (ran++, { status: 'done' as const }) } })
    expect(await worker.tick()).toEqual({ ran: null, closed: [] })
    expect(ran).toBe(0)
  })

  it('runs one job at a time: a tick that starts while another is running does nothing', async () => {
    request('a-lamp', 1)
    request('b-lamp', 2)
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    let started = 0
    const worker = createBuildWorker({ dir, now: () => NOW, handlers: { tinker: async () => (started++, await gate, { status: 'done' as const }) } })
    const first = worker.tick()
    const second = await worker.tick()
    expect(second).toEqual({ ran: null, closed: [], busy: true })
    release()
    await first
    expect(started).toBe(1)
  })
})
