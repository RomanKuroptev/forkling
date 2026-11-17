import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SessionJob } from '@forkling/schema'
import { createProject, endProject, readProject, writeProject } from '../src/builds/projects.ts'
import type { Sandbox, SandboxRun } from '../src/builds/sandbox-run.ts'
import { emptyPageResult } from '../src/builds/sandbox-runner.ts'
import { createSessionHandler } from '../src/builds/session-job.ts'
import type { SessionBlock, SessionModel } from '../src/builds/session.ts'

/** Step 4, slice C: the worker's side of a build step. A session on a scratch copy, put back and committed as one commit of projects/<id>/. */

const NOW = Date.parse('2026-11-18T10:00:00.000Z')
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9])
const PAGE = '<!doctype html><html><head><title>t</title></head><body><canvas></canvas></body></html>'

let world: string
beforeEach(() => {
  world = mkdtempSync(join(tmpdir(), 'session-job-'))
})
afterEach(() => rmSync(world, { recursive: true, force: true }))

const sandbox = (sandboxed = true): Sandbox => ({
  sandboxed,
  run: async (): Promise<SandboxRun> => ({ ...emptyPageResult({ loaded: true, rendered: true }), screenshotPng: PNG, sandboxed }),
  available: async () => true,
  close: async () => undefined,
})
const use = (name: string, input: unknown = {}): SessionBlock => ({ type: 'tool_use', id: `t-${Math.random().toString(36).slice(2, 8)}`, name, input })
const model = (turns: SessionBlock[][]): SessionModel => {
  let i = 0
  return { turn: async () => ({ content: turns[Math.min(i++, turns.length - 1)]!, stopReason: 'tool_use', usage: { input: 1000, cacheRead: 0, cacheWrite: 0, output: 300 } }) }
}
const job = (target: string, pointsInHand = 400) => SessionJob.parse({ id: 'session-20261118100000', kind: 'session', requestedAt: new Date(NOW).toISOString(), target, reason: 'I want the pool to fill with the hours.', pointsInHand })
const git = () => {
  const calls: string[][] = []
  return { calls, run: async (args: readonly string[]) => (calls.push([...args]), { code: args[0] === 'diff' ? 1 : 0, stdout: '' }) }
}
const handler = (m: SessionModel | null, g = git(), sb = sandbox()) => createSessionHandler({ model: m, sandbox: sb, requireSandbox: true, git: g.run, now: () => NOW, timezone: 'Europe/Stockholm' })

describe('the session handler', () => {
  it('starts a new project with the reason as its aim, runs the session, puts it in the world and commits only projects/<id>/', async () => {
    const g = git()
    const m = model([[use('write_file', { path: 'index.html', content: PAGE })], [use('finish', { caption: 'a first pool', outcome: 'continue' })]])
    const out = await handler(m, g)(job('Tide clock'), { dir: world, nowMs: NOW })
    expect(out).toMatchObject({ status: 'done', extra: { projectId: 'tide-clock', title: 'Tide clock', caption: 'a first pool' } })
    expect(out.extra?.calls).toHaveLength(2)
    const p = readProject(world, 'tide-clock')!
    expect(p).toMatchObject({ aim: 'I want the pool to fill with the hours.', status: 'building' })
    expect(p.sessions).toHaveLength(1)
    expect(existsSync(join(world, 'projects/tide-clock/src/index.html'))).toBe(true)
    expect(existsSync(join(world, 'projects/tide-clock/shots/1.png'))).toBe(true)
    expect(g.calls.every((c) => c.at(-1) === 'projects/tide-clock')).toBe(true)
    expect(g.calls.some((c) => c[0] === 'commit')).toBe(true)
  })

  it('goes on with a project that is building, by id, and deletes from the world what the session deleted', async () => {
    const made = createProject(world, { name: 'Tide clock', aim: 'pool', now: new Date(NOW) })
    if (!made.ok) throw new Error(made.reason)
    writeFileSync(join(world, 'projects/tide-clock/src/old.js'), 'let old = 1')
    writeFileSync(join(world, 'projects/tide-clock/src/index.html'), PAGE)
    const m = model([[use('delete_file', { path: 'old.js' })], [use('finish', { caption: 'tidied', outcome: 'continue' })]])
    const out = await handler(m)(job('tide-clock'), { dir: world, nowMs: NOW })
    expect(out.status).toBe('done')
    expect(existsSync(join(world, 'projects/tide-clock/src/old.js'))).toBe(false)
    expect(existsSync(join(world, 'projects/tide-clock/src/index.html'))).toBe(true)
  })

  it('leaves the other projects as they are', async () => {
    const other = createProject(world, { name: 'Sand clock', aim: 'sand', now: new Date(NOW) })
    if (!other.ok) throw new Error(other.reason)
    mkdirSync(join(world, 'projects/sand-clock/src'), { recursive: true })
    writeFileSync(join(world, 'projects/sand-clock/src/index.html'), PAGE)
    await handler(model([[use('finish', { caption: 'hello', outcome: 'continue' })]]))(job('Tide clock'), { dir: world, nowMs: NOW })
    expect(readdirSync(join(world, 'projects/sand-clock/src'))).toEqual(['index.html'])
    expect(readProject(world, 'sand-clock')!.sessions).toHaveLength(0)
  })

  it('fails, with the reason, on a project that is done, and when the sandbox is missing', async () => {
    const made = createProject(world, { name: 'Tide clock', aim: 'pool', now: new Date(NOW) })
    if (!made.ok) throw new Error(made.reason)
    writeProject(world, endProject(made.project, 'done', 'it works'))
    expect(await handler(model([]))(job('tide-clock'), { dir: world, nowMs: NOW })).toMatchObject({ status: 'failed', reason: expect.stringMatching(/done/) })
    const out = await handler(model([]), git(), sandbox(false))(job('Sand clock'), { dir: world, nowMs: NOW })
    expect(out).toMatchObject({ status: 'failed', reason: expect.stringMatching(/sandbox/) })
    expect(existsSync(join(world, 'projects/sand-clock'))).toBe(false)
  })

  it('waits when there is no model key', async () => {
    expect((await handler(null)(job('Tide clock'), { dir: world, nowMs: NOW })).status).toBe('later')
  })

  it('keeps to the points in hand of the step', async () => {
    const out = await handler(model([[use('finish', { caption: 'x', outcome: 'continue' })]]))(job('Tide clock', 299), { dir: world, nowMs: NOW })
    expect(out).toMatchObject({ status: 'failed', reason: expect.stringMatching(/300 points/) })
  })

  it('books nothing itself: the calls go back in the result for the mind', async () => {
    mkdirSync(join(world, 'brain'), { recursive: true })
    writeFileSync(join(world, 'brain/budget.json'), JSON.stringify({ month: '2026-11', capUsd: 15, spentUsd: 1 }))
    await handler(model([[use('finish', { caption: 'x', outcome: 'continue' })]]))(job('Tide clock'), { dir: world, nowMs: NOW })
    expect(JSON.parse(readFileSync(join(world, 'brain/budget.json'), 'utf8')).spentUsd).toBe(1)
  })
})
