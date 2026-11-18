import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { BudgetLedger } from '@forkling/schema'
import type { LlmClient, LlmRequest, LlmResult } from '../src/llm.ts'
import { DECIDE_MAX_TOKENS, makeAsk } from '../src/tick/ask.ts'
import { TEND_MAX_TOKENS } from '../src/builds/tend.ts'
import type { Tick } from '../src/tick/context.ts'

const Answer = z.object({ a: z.string() })
const usage = { input: 100, cacheRead: 0, cacheWrite: 0, output: 50 }

function stubTick(answer: LlmResult<unknown> | Error) {
  const seen: LlmRequest[] = []
  const llm = {
    async complete(request: LlmRequest) {
      seen.push(request)
      if (answer instanceof Error) throw answer
      return answer
    },
  } as unknown as LlmClient
  const t = {
    deps: { llm },
    system: 'system',
    notes: [] as string[],
    attempts: [] as Tick['attempts'],
    calls: [] as Tick['calls'],
    prompt: undefined,
    budget: BudgetLedger.parse({ month: '2026-11' }),
    mind: {},
    nowIso: '2026-11-12T09:00:00Z',
  } as unknown as Tick
  return { t, seen }
}

describe('makeAsk: effort and thinking by call kind', () => {
  it('asks decide and morning at medium effort, also on Haiku', async () => {
    const { t, seen } = stubTick({ parsed: { a: 'x' }, usage, stopReason: 'end_turn' })
    await makeAsk(t)('decide', 'claude-haiku-5-5', 'u', Answer)
    await makeAsk(t)('morning', 'claude-haiku-5-5', 'u', Answer)
    expect(seen.map((r) => r.effort)).toEqual(['medium', 'medium'])
    expect(seen.every((r) => r.thinking === undefined)).toBe(true)
  })

  it('asks a Haiku read at low effort with thinking off, and a Sonnet reflection at medium with thinking untouched', async () => {
    const { t, seen } = stubTick({ parsed: { a: 'x' }, usage, stopReason: 'end_turn' })
    await makeAsk(t)('read', 'claude-haiku-5-5', 'u', Answer)
    await makeAsk(t)('reflection', 'claude-sonnet-5-5', 'u', Answer)
    expect(seen[0]).toMatchObject({ effort: 'low', thinking: 'off' })
    expect(seen[1]).toMatchObject({ effort: 'medium' })
    expect(seen[1]!.thinking).toBeUndefined()
  })
})

describe('output limits for the Haiku calls that think (spec 13: thinking must not cut the answer short)', () => {
  // R1 fast-forward ledgers: a morning used 2,000 to 2,300 output tokens at the median and its tail reached 3,000, the old
  // limit, so 4 mornings and a decide were cut off; a tend used about 900 and 5 of 37 stopped at its old 1,500.
  it('gives decide and morning room for thinking: twice the old 3,000', async () => {
    const { t, seen } = stubTick({ parsed: { a: 'x' }, usage, stopReason: 'end_turn' })
    await makeAsk(t)('decide', 'claude-haiku-5-5', 'u', Answer)
    await makeAsk(t)('morning', 'claude-haiku-5-5', 'u', Answer)
    expect(DECIDE_MAX_TOKENS).toBe(6000)
    expect(seen.map((r) => r.maxTokens)).toEqual([6000, 6000])
  })

  it('gives a tend twice its answer size in the table (1.5K)', () => {
    expect(TEND_MAX_TOKENS).toBe(3000)
  })
})

describe('makeAsk: a model that does not give an answer (spec 11.3)', () => {
  it('records a refusal as a failed attempt with its stop reason, and sets the failure time', async () => {
    const { t } = stubTick({ parsed: null, usage, stopReason: 'refusal' })
    const result = await makeAsk(t)('decide', 'claude-haiku-5-5', 'u', Answer)
    expect(result?.parsed).toBeNull()
    expect(t.attempts).toHaveLength(1)
    expect(t.attempts[0]).toMatchObject({ kind: 'decide', ok: false, stop: 'refusal' })
    expect(t.notes.join(' ')).toContain('refused')
    expect(t.mind.thinkFailedAt).toBe(t.nowIso)
  })

  it('records an answer cut off at its output limit as a failed attempt, still billed', async () => {
    const { t } = stubTick({ parsed: null, usage, stopReason: 'max_tokens' })
    await makeAsk(t)('decide', 'claude-haiku-5-5', 'u', Answer)
    expect(t.attempts[0]).toMatchObject({ ok: false, stop: 'cut_off' })
    expect(t.attempts[0]!.usd).toBeGreaterThan(0)
    expect(t.calls).toHaveLength(1)
    expect(t.notes.join(' ')).toContain('output limit')
  })

  it('records a good answer as ok with no stop', async () => {
    const { t } = stubTick({ parsed: { a: 'x' }, usage, stopReason: 'end_turn' })
    await makeAsk(t)('decide', 'claude-haiku-5-5', 'u', Answer)
    expect(t.attempts[0]).toMatchObject({ ok: true })
    expect(t.attempts[0]!.stop).toBeUndefined()
  })
})
