import { MemorySlots, type BudgetCall } from '@forkling/schema'
import { canSpend, costUsd, estimateCallUsd, estimateTokens, MAX_PROMPT_TOKENS, recordCall } from '../budget.ts'
import { buildMemoryUser, renderSummary } from '../reflect.ts'
import { readText } from '../world.ts'
import type { Tick } from './context.ts'

const MEMORY_OUTPUT_TOKENS = 3000

/** Overnight the memory is rewritten on the Batch API, at half price: sent once after the diary, collected when ready. */
export async function memoryStep(t: Tick): Promise<void> {
  const { deps, notes, mind, nowIso, evening, system } = t
  if (mind.memoryBatch) {
    if (!deps.dryRun && deps.llm) {
      try {
        const outcome = await deps.llm.fetchBatch(mind.memoryBatch.id, MemorySlots)
        if (outcome.status === 'pending') {
          notes.push('the memory rewrite is still running')
        } else {
          mind.memoryBatch = null
          if (outcome.status === 'failed') {
            notes.push(`the memory rewrite ${outcome.reason}: keeping the old memory`)
          } else {
            const call: BudgetCall = { at: nowIso, kind: 'memory', model: 'claude-haiku-5-5', ...outcome.usage, usd: costUsd('claude-haiku-5-5', outcome.usage, { batch: true }) }
            t.calls.push(call)
            t.budget = recordCall(t.budget, call)
            const slots = MemorySlots.safeParse(outcome.parsed)
            t.summaryNext = slots.success ? renderSummary(slots.data) : null
            if (t.summaryNext) t.parts.push('rewrote its memory')
            else notes.push('the memory rewrite had nothing usable: keeping the old memory')
          }
        }
      } catch (e) {
        notes.push(`could not check the memory rewrite: ${(e as Error).message}`)
      }
    }
  } else if (t.asleep && mind.lastReflectDate === evening && mind.lastMemoryDate !== evening) {
    const diary = t.journal?.text ?? readText(t.dir, `journal/${evening}.md`)
    const user = buildMemoryUser({ date: evening, summary: t.w.summary, journal: diary, beliefs: t.beliefs })
    const tokens = estimateTokens(system) + estimateTokens(user)
    const maxUsd = estimateCallUsd('claude-haiku-5-5', tokens, MEMORY_OUTPUT_TOKENS) / 2
    t.prompt ??= { model: 'claude-haiku-5-5', kind: 'memory', system, user, tokens, maxUsd }
    if (tokens > MAX_PROMPT_TOKENS) {
      notes.push(`prompt too long (about ${tokens} tokens): no memory rewrite`)
    } else if (deps.dryRun) {
      notes.push(`dry run: memory rewrite on the Batch API, about ${tokens} tokens, at most $${maxUsd.toFixed(4)}`)
    } else if (!deps.llm) {
      notes.push('no credentials: no memory rewrite')
    } else if (!canSpend(t.budget, maxUsd)) {
      notes.push(`monthly budget reached ($${t.budget.spentUsd.toFixed(2)} of $${t.budget.capUsd}): no memory rewrite`)
    } else {
      try {
        const id = await deps.llm.submitBatch({ kind: 'memory', model: 'claude-haiku-5-5', system, user, maxTokens: MEMORY_OUTPUT_TOKENS, effort: 'low', schema: MemorySlots })
        mind.memoryBatch = { id, date: evening }
        mind.lastMemoryDate = evening
        t.parts.push('sent its memory off to be rewritten')
      } catch (e) {
        notes.push(`could not send the memory rewrite: ${(e as Error).message}`)
      }
    }
  }
}
