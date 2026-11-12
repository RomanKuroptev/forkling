import { canSpend, costUsd, estimateCallUsd, estimateTokens, MAX_PROMPT_TOKENS, recordCall } from '../budget.ts'
import type { BudgetCall } from '@forkling/schema'
import { effortFor, stopFailure, thinkingFor } from '../llm.ts'
import { clampText } from '../decision.ts'
import type { Ask, Tick } from './context.ts'

export const MAX_OUTPUT_TOKENS = 3000

/** Why a call was not made at all, as `ask` records it. Anything else on a failed attempt means the call was made and failed. */
export const NO_CALL_REASONS: ReadonlySet<string> = new Set(['prompt too long', 'no credentials', 'monthly budget reached'])

/** Every call to a model goes through here, so every one meets the same guards: prompt size, dry run, key, budget. */
export function makeAsk(t: Tick): Ask {
  return async (kind, model, user, schema, maxTokens = MAX_OUTPUT_TOKENS) => {
    const { deps, system, notes } = t
    // A thought tick runs on its own clock: its failures and times must not hold back or restart the decide cool-down.
    const decides = kind !== 'thought'
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
    } else if (!deps.llm) {
      notes.push('no credentials: no call')
      tried(false, 'no credentials')
    } else if (!canSpend(t.budget, maxUsd)) {
      notes.push(`monthly budget reached ($${t.budget.spentUsd.toFixed(2)} of $${t.budget.capUsd}): no call`)
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
      }
    }
    return null
  }
}
