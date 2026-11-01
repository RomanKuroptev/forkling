import { canSpend, costUsd, estimateCallUsd, estimateTokens, MAX_PROMPT_TOKENS, recordCall } from '../budget.ts'
import type { BudgetCall } from '@forkling/schema'
import type { Ask, Tick } from './context.ts'

export const MAX_OUTPUT_TOKENS = 3000

/** Every call to a model goes through here, so every one meets the same guards: prompt size, dry run, key, budget. */
export function makeAsk(t: Tick): Ask {
  return async (kind, model, user, schema, maxTokens = MAX_OUTPUT_TOKENS) => {
    const { deps, system, notes } = t
    const tokens = estimateTokens(system) + estimateTokens(user)
    const maxUsd = estimateCallUsd(model, tokens, maxTokens)
    t.prompt ??= { model, kind, system, user, tokens, maxUsd }
    if (tokens > MAX_PROMPT_TOKENS) {
      notes.push(`prompt too long (about ${tokens} tokens): no call`)
    } else if (deps.dryRun) {
      notes.push(`dry run: ${kind} call to ${model}, about ${tokens} tokens, at most $${maxUsd.toFixed(4)}`)
    } else if (!deps.llm) {
      notes.push('no credentials: no call')
    } else if (!canSpend(t.budget, maxUsd)) {
      notes.push(`monthly budget reached ($${t.budget.spentUsd.toFixed(2)} of $${t.budget.capUsd}): no call`)
    } else {
      try {
        const effort = model === 'claude-sonnet-5-5' ? 'medium' : 'low'
        const result = await deps.llm.complete({ kind, model, system, user, maxTokens, effort, schema })
        const call: BudgetCall = { at: t.nowIso, kind, model, ...result.usage, usd: costUsd(model, result.usage) }
        t.calls.push(call)
        t.budget = recordCall(t.budget, call)
        t.mind.lastThinkAt = t.nowIso
        return result
      } catch (e) {
        notes.push(`call failed: ${(e as Error).message}`)
        t.mind.thinkFailedAt = t.nowIso
      }
    }
    return null
  }
}
