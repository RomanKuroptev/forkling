import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { APIError } from '@anthropic-ai/sdk'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Health, MindState } from '@forkling/schema'
import { CREDIT_FIRST_WAIT_MS, CREDIT_MAX_WAIT_MS, createCreditGate, creditGuarded, CreditWaitError, isCreditError, readCreditState, withCreditGate } from '../src/credit.ts'
import type { Decision } from '../src/decision.ts'
import { buildHealthResponse } from '../src/health-response.ts'
import type { LlmClient, LlmRequest } from '../src/llm.ts'
import { loadSpecies } from '../src/species.ts'
import { createLoop } from '../src/tick/loop.ts'
import { noBatch } from './noBatch.ts'

vi.setConfig({ testTimeout: 120_000 })

const MIN = 60_000
const CREDIT_MESSAGE = 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.'
/** The error the SDK threw on 20 and 21 November. */
const creditError = () => APIError.generate(400, { type: 'error', error: { type: 'invalid_request_error', message: CREDIT_MESSAGE } }, undefined, new Headers())

describe('isCreditError', () => {
  it('is the credit-balance 400 the server saw live', () => {
    expect(isCreditError(creditError())).toBe(true)
  })

  it('is a 402, and a billing or payment error by type or message', () => {
    expect(isCreditError(APIError.generate(402, { type: 'error', error: { type: 'payment_required', message: 'Payment required' } }, undefined, new Headers()))).toBe(true)
    expect(isCreditError(APIError.generate(403, { type: 'error', error: { type: 'billing_error', message: 'Your account has a problem.' } }, undefined, new Headers()))).toBe(true)
    expect(isCreditError(new Error('This organization has a billing problem'))).toBe(true)
  })

  it('is not any other error', () => {
    expect(isCreditError(APIError.generate(400, { type: 'error', error: { type: 'invalid_request_error', message: 'max_tokens: too large' } }, undefined, new Headers()))).toBe(false)
    expect(isCreditError(APIError.generate(429, { type: 'error', error: { type: 'rate_limit_error', message: 'Too many requests' } }, undefined, new Headers()))).toBe(false)
    expect(isCreditError(APIError.generate(529, { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }, undefined, new Headers()))).toBe(false)
    expect(isCreditError(new Error('fetch failed'))).toBe(false)
    expect(isCreditError(null)).toBe(false)
  })
})

describe('the credit gate', () => {
  it('waits 10 minutes, then twice as long each time, at most 2 hours, and keeps its start', () => {
    const gate = createCreditGate()
    const t0 = Date.parse('2026-11-21T08:00:00Z')
    let now = t0
    const waits: number[] = []
    for (let i = 0; i < 7; i++) {
      const s = gate.failed(now)
      waits.push(s.waitMs)
      expect(s.since).toBe(new Date(t0).toISOString())
      now = Date.parse(s.retryAt)
    }
    expect(waits).toEqual([10, 20, 40, 80, 120, 120, 120].map((m) => m * MIN))
    expect(CREDIT_FIRST_WAIT_MS).toBe(10 * MIN)
    expect(CREDIT_MAX_WAIT_MS).toBe(120 * MIN)
  })

  it('holds until retryAt, then lets a call through; a success ends it', () => {
    const gate = createCreditGate()
    gate.failed(0)
    expect(gate.waiting(10 * MIN - 1)).not.toBeNull()
    expect(gate.waiting(10 * MIN)).toBeNull()
    expect(gate.state()).not.toBeNull()
    gate.succeeded()
    expect(gate.state()).toBeNull()
    expect(gate.failed(0).waitMs).toBe(10 * MIN)
  })

  it('says it is waiting once a window', () => {
    const gate = createCreditGate()
    expect(gate.noteOnce()).toBe(false)
    gate.failed(0)
    expect(gate.noteOnce()).toBe(true)
    expect(gate.noteOnce()).toBe(false)
    gate.failed(10 * MIN)
    expect(gate.noteOnce()).toBe(true)
  })
})

describe('creditGuarded', () => {
  const request = {} as LlmRequest
  it('sends nothing while waiting, starts the wait on a credit error, and ends it on a call that goes through', async () => {
    let fail = true
    let sent = 0
    const inner: LlmClient = {
      ...noBatch,
      async complete() {
        sent++
        if (fail) throw creditError()
        return { parsed: null, stopReason: 'end_turn', usage: { input: 1, cacheRead: 0, cacheWrite: 0, output: 1 } }
      },
    }
    const gate = createCreditGate()
    let now = 0
    const llm = creditGuarded(inner, gate, () => now)
    await expect(llm.complete(request)).rejects.toThrow(/credit balance/)
    expect(gate.state()?.retryAt).toBe(new Date(10 * MIN).toISOString())
    now = 5 * MIN
    await expect(llm.complete(request)).rejects.toBeInstanceOf(CreditWaitError)
    expect(sent).toBe(1)
    now = 10 * MIN
    fail = false
    await llm.complete(request)
    expect(sent).toBe(2)
    expect(gate.state()).toBeNull()
  })

  it('a batch poll neither goes out during the wait nor ends it', async () => {
    const gate = createCreditGate()
    gate.failed(0)
    let polled = 0
    const llm = creditGuarded({ ...noBatch, complete: async () => Promise.reject(new Error('no')), fetchBatch: async () => (polled++, { status: 'pending' }) }, gate, () => 0)
    await expect(llm.fetchBatch('b', MindState)).rejects.toBeInstanceOf(CreditWaitError)
    expect(polled).toBe(0)
    const later = creditGuarded({ ...noBatch, complete: async () => Promise.reject(new Error('no')), fetchBatch: async () => (polled++, { status: 'pending' }) }, gate, () => 11 * MIN)
    await later.fetchBatch('b', MindState)
    expect(polled).toBe(1)
    expect(gate.state()).not.toBeNull()
  })
})

// The loop on a fake clock, as on 20 and 21 November: the account is empty all morning and Merge has no plan for the day yet.
const templates = fileURLToPath(new URL('../../../templates/merge', import.meta.url))
const cat = loadSpecies('cat')
const AWAKE = Date.parse('2026-11-12T09:00:00Z')

const step = (verb: string, target: string | null, minutes: number, reason: string) => ({ verb, target, reason, minutes, wantId: null, deep: null, size: null })
const plan: Decision = {
  thought: 'A quiet start.',
  longGoal: null,
  dropLongGoal: false,
  plan: [step('rest', null, 30, 'I want a slow start.'), step('rest', null, 30, 'Still slow.'), step('rest', null, 30, 'Time to think it over.')],
  planReason: 'A slow day.',
  stayUpLate: null,
}

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'credit-'))
  copyFileSync(join(templates, 'forkling.json'), join(dir, 'forkling.json'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('the loop with an empty account', () => {
  function setup() {
    const clock = { ms: AWAKE }
    const account = { empty: true }
    const sent: { at: number; kind: string }[] = []
    const inner: LlmClient = {
      ...noBatch,
      async complete<T>(req: LlmRequest<T>) {
        sent.push({ at: clock.ms, kind: req.kind })
        if (account.empty) throw creditError()
        const parsed = req.kind === 'thought' ? { thought: 'Hm.', scores: [], surprise: 1, action: 'continue', reason: null } : plan
        return { parsed: parsed as T, stopReason: 'end_turn', usage: { input: 800, cacheRead: 0, cacheWrite: 0, output: 200 } }
      },
    }
    const gated = withCreditGate(dir, inner, () => clock.ms)
    const loop = createLoop({ dir, clock: () => clock.ms, git: null, deps: { ...gated, pack: cat.pack, behaviors: cat.behaviors, speciesPersona: cat.persona, engine: 'test' } })
    const runFor = async (minutes: number) => {
      const end = clock.ms + minutes * MIN
      while (clock.ms < end) {
        await loop.tickOnce()
        clock.ms += loop.nextDelayMs()
      }
    }
    return { clock, account, sent, runFor }
  }
  const lines = () =>
    readdirSync(join(dir, 'mind/ticks')).flatMap((f) =>
      readFileSync(join(dir, 'mind/ticks', f), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as { calls: { ok: boolean }[]; notes: string[] }),
    )
  const state = () => MindState.parse(JSON.parse(readFileSync(join(dir, 'mind/state.json'), 'utf8')))
  const health = () => Health.parse(JSON.parse(readFileSync(join(dir, 'mind/health.json'), 'utf8')))

  it('makes one call, waits quietly, then retries at 10, 20 and 40 minutes; a call that goes through ends the wait', async () => {
    const { clock, account, sent, runFor } = setup()
    await runFor(9)
    expect(sent.map((s) => s.at)).toEqual([AWAKE])
    // Quiet ticks: one failed call in the log, and the wait said once.
    expect(lines().flatMap((l) => l.calls).filter((c) => !c.ok)).toHaveLength(1)
    expect(lines().flatMap((l) => l.notes).filter((n) => n.startsWith('credit empty: waiting until'))).toHaveLength(1)
    expect(state().credit).toMatchObject({ since: new Date(AWAKE).toISOString(), retryAt: new Date(AWAKE + 10 * MIN).toISOString() })
    expect(health()).toMatchObject({ credit: 'empty', creditEmptySince: new Date(AWAKE).toISOString(), creditRetryAt: new Date(AWAKE + 10 * MIN).toISOString() })
    expect(health().warnings[0]).toBe(`credit empty since ${new Date(AWAKE).toISOString()}, next try ${new Date(AWAKE + 10 * MIN).toISOString()}`)
    const r = buildHealthResponse(dir, clock.ms)
    expect(r).toMatchObject({ credit: 'empty', creditEmptySince: new Date(AWAKE).toISOString(), creditRetryAt: new Date(AWAKE + 10 * MIN).toISOString() })
    expect(r.warnings.filter((w) => w.startsWith('credit empty'))).toEqual([`credit empty since ${new Date(AWAKE).toISOString()}, next try ${new Date(AWAKE + 10 * MIN).toISOString()}`])

    await runFor(61) // to 70 minutes in: retries at 10, 30 and 70 minutes
    expect(sent.map((s) => (s.at - AWAKE) / MIN)).toEqual([0, 10, 30])
    await runFor(1)
    expect(sent.map((s) => (s.at - AWAKE) / MIN)).toEqual([0, 10, 30, 70])
    expect(lines().flatMap((l) => l.calls).filter((c) => !c.ok)).toHaveLength(4)
    expect(lines().flatMap((l) => l.notes).filter((n) => n.startsWith('credit empty: waiting until'))).toHaveLength(4)
    expect(state().credit).toMatchObject({ since: new Date(AWAKE).toISOString(), waitMs: 80 * MIN })

    // Roman tops up the account. The next try (at 150 minutes) goes through, and the wait is over.
    account.empty = false
    await runFor(80)
    expect(sent.filter((s) => s.at < AWAKE + 150 * MIN)).toHaveLength(4)
    expect(sent.length).toBeGreaterThan(4)
    expect(sent[4]!.at).toBe(AWAKE + 150 * MIN)
    expect(state().credit).toBeUndefined()
    expect(buildHealthResponse(dir, clock.ms)).toMatchObject({ credit: 'ok' })
    expect(buildHealthResponse(dir, clock.ms).creditEmptySince).toBeUndefined()
  })

  it('goes on waiting after a restart: the wait is read back from mind/state.json', async () => {
    const first = setup()
    await first.runFor(1)
    expect(readCreditState(dir)?.retryAt).toBe(new Date(AWAKE + 10 * MIN).toISOString())
    const again = withCreditGate(dir, { ...noBatch, complete: async () => Promise.reject(new Error('should not be sent')) }, () => AWAKE + 5 * MIN)
    expect(again.credit?.waiting(AWAKE + 5 * MIN)?.retryAt).toBe(new Date(AWAKE + 10 * MIN).toISOString())
    await expect(again.llm!.complete({} as LlmRequest)).rejects.toBeInstanceOf(CreditWaitError)
  })
})
