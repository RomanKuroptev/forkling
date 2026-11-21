import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MindState } from '@forkling/schema'
import type { LlmClient } from './llm.ts'

/**
 * The back-off on an empty account (Roman, 21 November). On 20 and 21 November the Anthropic credit ran out and the loop asked
 * for the morning plan again at almost every reflex tick: 1,650 failed calls in a day. Now a credit or billing error stops every
 * model call for 10 minutes, then 20, doubling to at most 2 hours, until a call goes through.
 */
export const CREDIT_FIRST_WAIT_MS = 10 * 60_000
export const CREDIT_MAX_WAIT_MS = 2 * 60 * 60_000

/** The back-off as it is kept in `mind/state.json` (`credit`), so a restarted server goes on waiting. */
export interface CreditState {
  /** When the first credit error of this run of them came. */
  since: string
  /** No model call before this. */
  retryAt: string
  /** The wait that set `retryAt`; the next one is twice this, at most 2 hours. */
  waitMs: number
}

const field = (value: unknown, key: string): unknown => (typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined)
const text = (value: unknown): string => (typeof value === 'string' ? value : '')

/**
 * Whether an error from the API says the account cannot pay: a 400 `invalid_request_error` about the credit balance, a 402, or an
 * error whose type or message is about billing or payment. The SDK's `APIError` carries `status`, `message` and the body as `error`
 * (`{ type: 'error', error: { type, message } }`); a plain error is read by its message alone.
 */
export function isCreditError(e: unknown): boolean {
  const status = field(e, 'status')
  if (status === 402) return true
  const body = field(e, 'error')
  const inner = field(body, 'error') ?? body
  const type = text(field(inner, 'type'))
  const words = [text(field(e, 'message')), text(field(inner, 'message')), type].join(' ').toLowerCase()
  if (/credit balance/.test(words)) return true
  if (/billing|payment/.test(type.toLowerCase())) return true
  return /\bbilling\b|\bpayment required\b|\bpayment method\b/.test(words)
}

/** A call that was not made because the credit is empty and the back-off has not passed. */
export class CreditWaitError extends Error {
  readonly state: CreditState
  constructor(state: CreditState) {
    super(`credit empty: waiting until ${state.retryAt}`)
    this.state = state
    this.name = 'CreditWaitError'
  }
}

export interface CreditGate {
  /** The back-off while it holds (no call before `retryAt`), or null when a call may be made. */
  waiting(nowMs: number): CreditState | null
  /** The back-off as it stands, or null when the credit is fine. It stays set after `retryAt` until a call goes through. */
  state(): CreditState | null
  /** A credit error: wait 10 minutes the first time, then twice the last wait, at most 2 hours. */
  failed(nowMs: number): CreditState
  /** A call went through: the back-off is over. */
  succeeded(): void
  /** True once for each back-off window, so the tick log says "credit empty: waiting until ..." once and not every tick. */
  noteOnce(): boolean
}

export function nextCreditState(prev: CreditState | null, nowMs: number): CreditState {
  const waitMs = prev ? Math.min(CREDIT_MAX_WAIT_MS, prev.waitMs * 2) : CREDIT_FIRST_WAIT_MS
  return { since: prev?.since ?? new Date(nowMs).toISOString(), retryAt: new Date(nowMs + waitMs).toISOString(), waitMs }
}

/** Held in memory by the server loop (or one Actions tick), started from what `mind/state.json` kept. */
export function createCreditGate(initial: CreditState | null = null): CreditGate {
  let current = initial
  let notedFor: string | null = null
  return {
    waiting: (nowMs) => (current && nowMs < Date.parse(current.retryAt) ? current : null),
    state: () => current,
    failed(nowMs) {
      current = nextCreditState(current, nowMs)
      return current
    },
    succeeded() {
      current = null
      notedFor = null
    },
    noteOnce() {
      if (!current || notedFor === current.retryAt) return false
      notedFor = current.retryAt
      return true
    },
  }
}

/**
 * The model client behind the gate: while it waits nothing is sent (a `CreditWaitError` instead), a credit error starts or
 * lengthens the wait, and a call that spends (a call or a batch sent) ends it. Polling or cancelling a batch spends nothing, so
 * it neither ends the wait nor goes out during it.
 */
export function creditGuarded(llm: LlmClient, gate: CreditGate, clock: () => number): LlmClient {
  const guard = async <T>(spends: boolean, call: () => Promise<T>): Promise<T> => {
    const wait = gate.waiting(clock())
    if (wait) throw new CreditWaitError(wait)
    try {
      const result = await call()
      if (spends) gate.succeeded()
      return result
    } catch (e) {
      if (isCreditError(e)) gate.failed(clock())
      throw e
    }
  }
  return {
    complete: (request) => guard(true, () => llm.complete(request)),
    submitBatch: (request) => guard(true, () => llm.submitBatch(request)),
    fetchBatch: (id, schema) => guard(false, () => llm.fetchBatch(id, schema)),
    cancelBatch: (id) => guard(false, () => llm.cancelBatch(id)),
  }
}

/** The warning on `/health` and in `mind/health.json`. */
export const creditWarning = (s: CreditState): string => `credit empty since ${s.since}, next try ${s.retryAt}`

/** The back-off `mind/state.json` kept from the last tick, or null: how a restarted server (or the next Actions tick) goes on waiting. */
export function readCreditState(dir: string): CreditState | null {
  try {
    const parsed = MindState.safeParse(JSON.parse(readFileSync(join(dir, 'mind/state.json'), 'utf8')))
    return parsed.success ? (parsed.data.credit ?? null) : null
  } catch {
    return null
  }
}

/** The tick's `llm` and `credit` together: the client behind a gate started from the world's state. No client, no gate. */
export function withCreditGate(dir: string, llm: LlmClient | null, clock: () => number): { llm: LlmClient | null; credit?: CreditGate } {
  if (!llm) return { llm: null }
  const credit = createCreditGate(readCreditState(dir))
  return { llm: creditGuarded(llm, credit, clock), credit }
}
