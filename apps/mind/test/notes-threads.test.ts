import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BudgetLedger, Note } from '@forkling/schema'
import type { LlmClient, LlmResult } from '../src/llm.ts'
import { createNotesIntake } from '../src/notes-intake.ts'

const T0 = Date.parse('2026-11-16T10:00:00Z')
const DAY = 86_400_000
const usage = { input: 600, cacheRead: 0, cacheWrite: 0, output: 40 }

let dir: string
let state: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'thread-world-'))
  state = mkdtempSync(join(tmpdir(), 'thread-state-'))
  mkdirSync(join(dir, 'notes'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  rmSync(state, { recursive: true, force: true })
})

let llmCalls = 0
function make() {
  llmCalls = 0
  const llm = {
    async complete() {
      llmCalls++
      return { parsed: { label: 'ok', topics: ['fog'] }, usage, stopReason: 'end_turn' } as LlmResult<unknown>
    },
  } as unknown as LlmClient
  const fetchFake = (async () => new Response(JSON.stringify({ success: true }), { status: 200 })) as unknown as typeof fetch
  let n = 0
  return createNotesIntake({
    dir,
    stateDir: state,
    now: () => T0,
    timezone: 'Europe/Stockholm',
    llm,
    turnstileSecret: 's',
    fetch: fetchFake,
    placeIds: () => ['home', 'workshop'],
    ledger: () => BudgetLedger.parse({ month: '2026-11' }),
    salt: 'x',
    suffix: () => `s${n++}`,
  })
}

const body = (over: Record<string, unknown> = {}) => ({ name: 'V', message: 'an answer', token: 't', ...over })
const put = (over: Record<string, unknown>) => {
  const n = Note.parse({ id: 'n-2026-11-16-aa', name: 'V', message: 'first', placeId: 'workshop', at: new Date(T0 - 3_600_000).toISOString(), status: 'replied', foundAt: new Date(T0 - 3_000_000).toISOString(), reply: 'hello', ...over })
  writeFileSync(join(dir, 'notes', `${n.id}.json`), JSON.stringify(n))
  return n
}
const saved = (id: string) => Note.parse(JSON.parse(readFileSync(join(dir, 'notes', `${id}.json`), 'utf8')))
const old = (days: number) => ({ at: new Date(T0 - days * DAY).toISOString(), foundAt: new Date(T0 - days * DAY).toISOString() })

describe('answers and threads (spec v4 7)', () => {
  it('a first note is its own thread, with no replyTo', async () => {
    const r = await make().submit(body({ placeId: 'workshop' }), '1.1.1.1')
    const n = saved((r.body as unknown as { id: string }).id)
    expect(n.thread).toBe(n.id)
    expect(n.replyTo).toBeNull()
  })
  it('an answer joins the thread, answers that note, and stays at its place', async () => {
    put({})
    const r = await make().submit(body({ replyTo: 'n-2026-11-16-aa' }), '1.1.1.1')
    expect(r.status).toBe(202)
    expect(saved((r.body as unknown as { id: string }).id)).toMatchObject({ thread: 'n-2026-11-16-aa', replyTo: 'n-2026-11-16-aa', placeId: 'workshop', status: 'new' })
  })
  it('refuses an answer to a note that is not there, or one Merge has not answered, before any call', async () => {
    put({ id: 'n-2026-11-16-bb', status: 'new', foundAt: null, reply: null })
    const intake = make()
    expect((await intake.submit(body({ replyTo: 'n-nope' }), '1.1.1.1')).status).toBe(409)
    expect((await intake.submit(body({ replyTo: 'n-2026-11-16-bb' }), '1.1.1.1')).status).toBe(409)
    expect(llmCalls).toBe(0)
  })
  it('refuses an answer that is not to the newest note of the thread', async () => {
    put({})
    put({ id: 'n-2026-11-16-cc', thread: 'n-2026-11-16-aa', replyTo: 'n-2026-11-16-aa', at: new Date(T0 - 1000).toISOString() })
    const intake = make()
    expect((await intake.submit(body({ replyTo: 'n-2026-11-16-aa' }), '1.1.1.1')).status).toBe(409)
    expect((await intake.submit(body({ replyTo: 'n-2026-11-16-cc' }), '1.1.1.1')).status).toBe(202)
  })
  it('refuses an answer in a thread Merge has replied to 3 times, and one idle for 14 days', async () => {
    put({ id: 'n-2026-11-10-a1', ...old(5) })
    put({ id: 'n-2026-11-11-a2', thread: 'n-2026-11-10-a1', replyTo: 'n-2026-11-10-a1', ...old(4) })
    put({ id: 'n-2026-11-12-a3', thread: 'n-2026-11-10-a1', replyTo: 'n-2026-11-11-a2', ...old(3) })
    put({ id: 'n-2026-10-20-old', ...old(20) })
    const intake = make()
    expect((await intake.submit(body({ replyTo: 'n-2026-11-12-a3' }), '1.1.1.1')).status).toBe(409)
    expect((await intake.submit(body({ replyTo: 'n-2026-10-20-old' }), '1.1.1.1')).status).toBe(409)
  })
  it('refuses an answer to a hidden note', async () => {
    put({})
    mkdirSync(join(dir, 'mind'))
    writeFileSync(join(dir, 'mind/notes-hidden.json'), JSON.stringify({ hidden: ['n-2026-11-16-aa'] }))
    expect((await make().submit(body({ replyTo: 'n-2026-11-16-aa' }), '1.1.1.1')).status).toBe(409)
  })
  it('an answer counts in the 3 a day of a visitor', async () => {
    put({})
    const intake = make()
    for (let i = 0; i < 3; i++) await intake.submit(body(), '1.1.1.1')
    expect((await intake.submit(body({ replyTo: 'n-2026-11-16-aa' }), '1.1.1.1')).status).toBe(429)
    expect(readdirSync(join(dir, 'notes')).length).toBe(4)
  })
})
