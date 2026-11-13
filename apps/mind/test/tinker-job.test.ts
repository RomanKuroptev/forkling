import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Interests, JobResult, Souvenir, TinkerJob, WorkMeta } from '@forkling/schema'
import type { WorkCheckResult, WorkChecker } from '../src/builds/browser-check.ts'
import type { GithubClient } from '../src/builds/github.ts'
import { createTinkerHandler } from '../src/builds/tinker-job.ts'
import { drawConstraint } from '../src/prompts/constraints.ts'
import type { LlmClient, LlmRequest } from '../src/llm.ts'
import type { FetchImpl } from '../src/web/fetch.ts'
import { noBatch } from './noBatch.ts'

const templates = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const NOW = Date.parse('2026-11-14T10:31:00Z')
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const HTML = `<!doctype html><html><head><meta charset="utf-8"><title>t</title></head><body><script src="../../lib/p5.min.js"></script><script>function setup(){createCanvas(480,360)} function draw(){background(20)}</script></body></html>`
const output = (title = 'Tide pool clock') => ({ meta: { title, kind: 'art', about: 'A clock that tells the time by how full a pool is.', interest: 'tide pools', sources: [] }, html: HTML })

const job = TinkerJob.parse({ id: 'tinker-20261114-1031', kind: 'tinker', requestedAt: '2026-11-14T10:31:00Z', idea: 'a clock made of a tide pool', reason: 'I keep coming back to the tide pools.' })

/** A model that answers from a list and remembers what it was asked. */
function fakeLlm(answers: (unknown | null)[]) {
  const calls: LlmRequest[] = []
  const llm: LlmClient = {
    ...noBatch,
    async complete<T>(req: LlmRequest<T>) {
      calls.push(req)
      const a = answers[calls.length - 1]
      return { parsed: (a ?? null) as T | null, stopReason: a ? 'end_turn' : 'refusal', usage: { input: 20_000, cacheRead: 0, cacheWrite: 0, output: 12_000 } }
    },
  }
  return { llm, calls }
}
const checkerOf = (results: Partial<WorkCheckResult>[], available = true): WorkChecker & { pages: string[] } => {
  const pages: string[] = []
  return {
    pages,
    async check(html) {
      pages.push(html)
      const r = results[pages.length - 1] ?? {}
      return { ok: r.ok ?? true, reasons: r.reasons ?? [], thumb: r.ok === false ? null : PNG }
    },
    available: async () => available,
    close: async () => undefined,
  }
}
function fakeGithub(fail?: string) {
  const opened: Parameters<GithubClient['openWorkPullRequest']>[0][] = []
  const client: GithubClient = {
    async openWorkPullRequest(args) {
      if (fail) throw new Error(fail)
      opened.push(args)
      return { number: 3, url: 'https://github.com/o/r/pull/3' }
    },
  }
  return { client, opened }
}

let dir: string
const file = (rel: string) => join(dir, rel)
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tinker-job-'))
  copyFileSync(join(templates, 'forkling.json'), file('forkling.json'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const handler = (llm: LlmClient | null, checker: WorkChecker, github: GithubClient, web?: { fetchImpl: FetchImpl; sleep: () => Promise<void> }) => createTinkerHandler({ dir, llm, checker, github, now: () => NOW, ...(web ? { web } : {}) })
const run = (h: ReturnType<typeof handler>) => h(job, { dir, nowMs: NOW })

describe('the tinker handler (spec 10.2)', () => {
  it('makes the work, checks it, and opens a pull request with the work and its thumbnail, and says what it cost', async () => {
    const { llm, calls } = fakeLlm([output()])
    const github = fakeGithub()
    const out = await run(handler(llm, checkerOf([{ ok: true }]), github.client))
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ kind: 'tinker', model: 'claude-sonnet-5-5', effort: 'medium' })
    expect(calls[0]!.user).toContain('a clock made of a tide pool')
    expect(calls[0]!.user).toContain('I keep coming back to the tide pools.')
    expect(github.opened).toHaveLength(1)
    const pr = github.opened[0]!
    expect(pr.id).toBe('tide-pool-clock')
    expect(pr.files.map((f) => f.path)).toEqual(['works/tide-pool-clock/index.html', 'works/tide-pool-clock/meta.json', 'works/tide-pool-clock/thumb.png'])
    expect(WorkMeta.parse(JSON.parse(String(pr.files[1]!.content)))).toMatchObject({ status: 'shelf', size: 'full' })
    expect(pr.title).toMatch(/Tide pool clock/)
    expect(pr.body).not.toMatch(/@/)
    expect(out).toMatchObject({ status: 'done', extra: { workId: 'tide-pool-clock', title: 'Tide pool clock', workStatus: 'shelf', prUrl: 'https://github.com/o/r/pull/3' } })
    const calls1 = out.extra!.calls!
    expect(calls1).toHaveLength(1)
    expect(calls1[0]).toMatchObject({ kind: 'tinker', model: 'claude-sonnet-5-5', input: 20_000, output: 12_000 })
    expect(calls1[0]!.usd).toBeCloseTo((20_000 * 2 + 12_000 * 10) / 1e6, 6)
  })

  it('keeps a work that fails twice as a scrap: it goes up as a pull request too, with the reason, and both calls are counted', async () => {
    const { llm } = fakeLlm([output(), output()])
    const github = fakeGithub()
    const out = await run(handler(llm, checkerOf([{ ok: false, reasons: ['first'] }, { ok: false, reasons: ['the screenshot is a single colour'] }]), github.client))
    expect(out).toMatchObject({ status: 'done', extra: { workStatus: 'scrap', workId: 'tide-pool-clock' } })
    expect(out.reason).toMatch(/single colour/)
    expect(out.extra!.calls!.map((c) => c.kind)).toEqual(['tinker', 'repair'])
    const pr = github.opened[0]!
    expect(pr.files.map((f) => f.path)).toEqual(['works/tide-pool-clock/index.html', 'works/tide-pool-clock/meta.json'])
    expect(pr.title).toMatch(/^Scrap/)
  })

  it('does nothing yet, and spends nothing, when there is no browser to check with: the job stays and is tried again', async () => {
    const { llm, calls } = fakeLlm([output()])
    const out = await run(handler(llm, checkerOf([], false), fakeGithub().client))
    expect(out.status).toBe('later')
    expect(calls).toHaveLength(0)
  })

  it('does nothing yet when there is no model to ask', async () => {
    expect((await run(handler(null, checkerOf([]), fakeGithub().client))).status).toBe('later')
  })

  it('fails the job, with the reason and the cost, when the model refuses', async () => {
    const { llm } = fakeLlm([null])
    const github = fakeGithub()
    const out = await run(handler(llm, checkerOf([]), github.client))
    expect(out.status).toBe('failed')
    expect(out.reason).toMatch(/refus/i)
    expect(out.extra!.calls).toHaveLength(1)
    expect(github.opened).toHaveLength(0)
  })

  it('makes no call and fails the job when the month\'s budget has no room', async () => {
    mkdirSync(file('brain'), { recursive: true })
    writeFileSync(file('brain/budget.json'), JSON.stringify({ month: '2026-11', capUsd: 10, spentUsd: 9.99 }))
    const { llm, calls } = fakeLlm([output()])
    const out = await run(handler(llm, checkerOf([]), fakeGithub().client))
    expect(calls).toHaveLength(0)
    expect(out.status).toBe('failed')
    expect(out.reason).toMatch(/no call was made|budget/i)
  })

  it('fails the job with the reason, and still counts the cost, when the pull request cannot be opened', async () => {
    const { llm } = fakeLlm([output()])
    const out = await run(handler(llm, checkerOf([{ ok: true }]), fakeGithub('GitHub answered 422: Reference already exists').client))
    expect(out.status).toBe('failed')
    expect(out.reason).toMatch(/pull request/i)
    expect(out.reason).toMatch(/422/)
    expect(out.extra!.calls).toHaveLength(1)
  })

  it('takes an id that no work has, on disk or in its folder', async () => {
    mkdirSync(file('works/tide-pool-clock'), { recursive: true })
    const github = fakeGithub()
    await run(handler(fakeLlm([output()]).llm, checkerOf([{ ok: true }]), github.client))
    expect(github.opened[0]!.id).toBe('tide-pool-clock-2')
  })

  it('writes nothing in the world: it never touches a file the mind is writing', async () => {
    const before = readdirSync(dir).sort()
    await run(handler(fakeLlm([output()]).llm, checkerOf([{ ok: true }]), fakeGithub().client))
    expect(readdirSync(dir).sort()).toEqual(before)
  })

  it('refuses a job that is not a tinker job', async () => {
    const h = handler(fakeLlm([output()]).llm, checkerOf([{ ok: true }]), fakeGithub().client)
    const out = await h({ id: 'x', kind: 'tinker', requestedAt: '2026-11-14T10:31:00Z' }, { dir, nowMs: NOW })
    expect(out.status).toBe('failed')
    expect(JobResult.safeParse({ id: 'x', kind: 'tinker', status: out.status, reason: out.reason, at: '2026-11-14T10:31:00Z' }).success).toBe(true)
  })
})

describe('a remix job (spec 7.5)', () => {
  it('reads the earlier work from the world, puts its page in the prompt, and says the new work remixes it', async () => {
    mkdirSync(file('works/lamp'), { recursive: true })
    writeFileSync(file('works/lamp/index.html'), '<html><body>OLD-LAMP-MARKER</body></html>')
    writeFileSync(file('works/lamp/meta.json'), JSON.stringify(WorkMeta.parse({ id: 'lamp', title: 'Humming lamp', kind: 'art', about: 'A lamp that hums.', interest: null, made: '2026-11-01T10:00:00Z', status: 'shelf', size: 'full' })))
    const { llm, calls } = fakeLlm([output()])
    const github = fakeGithub()
    const h = handler(llm, checkerOf([{ ok: true }]), github.client)
    await h({ ...job, remixOf: 'lamp' }, { dir, nowMs: NOW })
    expect(calls[0]!.user).toContain('<data source="remix">')
    expect(calls[0]!.user).toContain('OLD-LAMP-MARKER')
    expect(WorkMeta.parse(JSON.parse(String(github.opened[0]!.files[1]!.content))).remixOf).toBe('lamp')
  })

  it('goes on without a remix when the earlier work is gone', async () => {
    const { llm, calls } = fakeLlm([output()])
    const github = fakeGithub()
    await handler(llm, checkerOf([{ ok: true }]), github.client)({ ...job, remixOf: 'gone' }, { dir, nowMs: NOW })
    expect(calls[0]!.user).not.toContain('<data source="remix">')
    expect(WorkMeta.parse(JSON.parse(String(github.opened[0]!.files[1]!.content))).remixOf).toBeNull()
  })
})

describe('manuals in a full work (spec 6.1: for tinker only)', () => {
  it('shows the manuals of the first two libraries it has never used to the call as data', async () => {
    const asked: string[] = []
    const web = { fetchImpl: (async (url: string) => (asked.push(url), new Response('<html><head><title>p5 reference</title></head><body>circle(x, y, d)</body></html>'))) as FetchImpl, sleep: async () => undefined }
    const { llm, calls } = fakeLlm([output()])
    await handler(llm, checkerOf([{ ok: true }]), fakeGithub().client, web)(job, { dir, nowMs: NOW })
    expect(calls[0]!.user).toContain('<data source="manuals">')
    expect(calls[0]!.user).toContain('circle(x, y, d)')
    expect(asked).toEqual(['https://p5js.org/reference/', 'https://tonejs.github.io/docs/'])
  })

  it('makes the work without them when the web cannot be reached', async () => {
    const web = { fetchImpl: (async () => { throw new Error('offline') }) as FetchImpl, sleep: async () => undefined }
    const { llm, calls } = fakeLlm([output()])
    const out = await handler(llm, checkerOf([{ ok: true }]), fakeGithub().client, web)(job, { dir, nowMs: NOW })
    expect(out.status).toBe('done')
    expect(calls[0]!.user).not.toContain('manuals')
  })
})

describe('the constraint and the collision in a full work (spec 12.4)', () => {
  const seed = () => (JSON.parse(readFileSync(file('forkling.json'), 'utf8')) as { seed: number }).seed

  it('offers the constraint drawn for this job, and the pull request carries it in the work\'s meta', async () => {
    const { llm, calls } = fakeLlm([{ ...output(), constraintRefusal: null }])
    const github = fakeGithub()
    await run(handler(llm, checkerOf([{ ok: true }]), github.client))
    const expected = drawConstraint(seed(), `tinker:${job.id}`)
    expect(calls[0]!.user).toContain('## A constraint for this one')
    expect(calls[0]!.user).toContain(expected)
    const meta = WorkMeta.parse(JSON.parse(String(github.opened[0]!.files[1]!.content)))
    expect(meta.constraint).toEqual({ text: expected, refused: false, reason: null })
  })

  it('puts two souvenirs side by side when the world has two interests that share no place', async () => {
    mkdirSync(file('brain'), { recursive: true })
    mkdirSync(file('souvenirs'), { recursive: true })
    writeFileSync(file('brain/interests.json'), JSON.stringify(Interests.parse({ version: 2, topics: Object.fromEntries(['maps', 'tides'].map((t) => [t, { weight: 40, firstSeen: '2026-11-01T10:00:00Z', lastFed: '2026-11-01T10:00:00Z', sources: [] }])) })))
    for (const [id, topic] of [['s1', 'maps'], ['s2', 'tides']]) {
      writeFileSync(file(`souvenirs/2026-11-02-${id}.json`), JSON.stringify(Souvenir.parse({ kind: 'quote', id, why: 'it stuck', content: `words about ${id}`, topics: [topic], source: { url: 'https://en.wikipedia.org/wiki/Tide', title: id, fetchedAt: '2026-11-02T10:00:00Z' } })))
    }
    const { llm, calls } = fakeLlm([output()])
    const github = fakeGithub()
    await run(handler(llm, checkerOf([{ ok: true }]), github.client))
    expect(calls[0]!.user).toContain('## Two things side by side')
    expect(WorkMeta.parse(JSON.parse(String(github.opened[0]!.files[1]!.content))).collision?.slice().sort()).toEqual(['s1', 's2'])
  })
})
