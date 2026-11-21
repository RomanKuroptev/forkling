import { canSpend, effectiveCapUsd, costUsd, estimateCallUsd, estimateTokens, MAX_PROMPT_TOKENS, recordCall } from '../budget.ts'
import type { BudgetCall } from '@forkling/schema'
import { effortFor, stopFailure, thinkingFor } from '../llm.ts'
import { clampText } from '../decision.ts'
import type { Ask, Tick } from './context.ts'

/**
 * The credit back-off as this tick sees it: the wait while it holds, else null. The first tick of a window that sees it says so in
 * the tick log, once (Roman, 21 Nov); a call that is not made is not a failed call.
 */
export function creditWait(t: Tick): { retryAt: string } | null {
  const wait = t.deps.credit?.waiting(t.nowMs) ?? null
  if (wait && t.deps.credit!.noteOnce()) t.notes.push(`credit empty: waiting until ${wait.retryAt}`)
  return wait
}

/**
 * The output limit of a decide or morning call (Haiku at medium effort, so it thinks, and thinking is billed as output).
 * Spec 13 sizes the answer at 1.5K and keeps thinking from cutting it short. The R1 fast-forward ledgers measured the real
 * output: a morning at 2,000 to 2,300 tokens at the median with its tail at the old limit of 3,000 (4 mornings and a decide
 * cut off). Twice that keeps the tail whole; a full answer still costs only what it uses.
 */
export const DECIDE_MAX_TOKENS = 6000

/** Why a call was not made at all, as `ask` records it. Anything else on a failed attempt means the call was made and failed. */
export const NO_CALL_REASONS: ReadonlySet<string> = new Set(['prompt too long', 'no credentials', 'monthly budget reached'])

/** Every call to a model goes through here, so every one meets the same guards: prompt size, dry run, key, budget. */
export function makeAsk(t: Tick): Ask {
  return async (kind, model, user, schema, maxTokens = DECIDE_MAX_TOKENS) => {
    const { deps, system, notes } = t
    // A thought tick and a reflection run on their own clocks: their failures and times must not hold back or restart the decide cool-down.
    const decides = kind !== 'thought' && kind !== 'reflection'
    const tried = (ok: boolean, error?: string, usd = 0, stop?: 'refusal' | 'cut_off') =>
      t.attempts.push({ kind, model, usd, ok, ...(error ? { error: clampText(error, 200) } : {}), ...(stop ? { stop } : {}) })
    const tokens = estimateTokens(system) + estimateTokens(user)
    const maxUsd = estimateCallUsd(model, tokens, maxTokens)
    t.prompt ??= { model, kind, system, user, tokens, maxUsd }
    if (tokens > MAX_PROMPT_TOKENS) {
      notes.push(`prompt too long (about ${tokens} tokens): no call`)
      tried(false, 'prompt too long')
    } else if (deps.dryRun) {
      notes.push(`dry run: ${kind} call to ${model}, about ${tokens} tokens, at most $${maxUsd.toFixed(4)}`)
    } else if (creditWait(t)) {
      // The account cannot pay: nothing is asked, and nothing is written as a failed call.
    } else if (!deps.llm) {
      notes.push('no credentials: no call')
      tried(false, 'no credentials')
    } else if (!canSpend(t.budget, maxUsd, t.credits)) {
      notes.push(`monthly budget reached ($${t.budget.spentUsd.toFixed(2)} of $${effectiveCapUsd(t.budget, t.credits)}): no call`)
      tried(false, 'monthly budget reached')
    } else {
      try {
        const effort = effortFor(kind)
        const thinking = thinkingFor(model, effort)
        const result = await deps.llm.complete({ kind, model, system, user, maxTokens, effort, ...(thinking ? { thinking } : {}), schema })
        const call: BudgetCall = { at: t.nowIso, kind, model, ...result.usage, usd: costUsd(model, result.usage) }
        t.calls.push(call)
        t.budget = recordCall(t.budget, call)
        if (decides) t.mind.lastThinkAt = t.nowIso
        const failure = stopFailure(result.stopReason, result.parsed)
        if (failure === 'refusal' || failure === 'cut_off') {
          // Billed, but no answer: a failed call (spec 11.3). Nothing retries it with the same input.
          notes.push(failure === 'refusal' ? `${kind} call refused by the model: no retry with the same input` : `${kind} answer cut off at its output limit (${maxTokens} tokens)`)
          if (decides) t.mind.thinkFailedAt = t.nowIso
          tried(false, failure === 'refusal' ? 'refused' : 'cut off at the output limit', call.usd, failure)
        } else tried(true, undefined, call.usd)
        return result
      } catch (e) {
        notes.push(`call failed: ${(e as Error).message}`)
        if (decides) t.mind.thinkFailedAt = t.nowIso
        tried(false, (e as Error).message)
        creditWait(t)
      }
    }
    return null
  }
}
