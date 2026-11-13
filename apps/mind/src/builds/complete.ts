import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BudgetLedger, type BudgetCall } from '@forkling/schema'
import { canSpend, costUsd, estimateCallUsd, estimateTokens, MAX_PROMPT_TOKENS, monthOf, recordCall, rollLedger } from '../budget.ts'
import { effortFor, thinkingFor, type LlmClient } from '../llm.ts'
import { buildSystem } from '../prompts.ts'
import { DEFAULT_SEED } from '../seed.ts'
import type { Complete } from './tinker.ts'

const readJson = (dir: string, rel: string): unknown => {
  try {
    return existsSync(join(dir, rel)) ? JSON.parse(readFileSync(join(dir, rel), 'utf8')) : null
  } catch {
    return null
  }
}

/**
 * The model call a build worker's handler makes: the system prompt from the seed, the guards the tick's `ask` has (the prompt
 * size and the month's budget, read once from the ledger), and a list of what each call cost. Nothing is booked here: the worker
 * never writes `brain/budget.json`, so the costs go back in the result for the mind to book (spec 2.2).
 */
export function createWorkerComplete(o: { dir: string; llm: LlmClient; nowMs: number }): { complete: Complete; calls: BudgetCall[]; nowIso: string } {
  const nowIso = new Date(o.nowMs).toISOString()
  const seed = existsSync(join(o.dir, 'self/seed.md')) ? readFileSync(join(o.dir, 'self/seed.md'), 'utf8') : DEFAULT_SEED
  const system = buildSystem({ seed })
  const timezone = (readJson(o.dir, 'forkling.json') as { timezone?: string } | null)?.timezone ?? 'Europe/Stockholm'
  const stored = BudgetLedger.safeParse(readJson(o.dir, 'brain/budget.json'))
  let ledger = rollLedger(stored.success ? stored.data : BudgetLedger.parse({ month: monthOf(timezone, o.nowMs) }), monthOf(timezone, o.nowMs))
  const calls: BudgetCall[] = []

  const complete: Complete = async (kind, model, user, schema, maxTokens) => {
    const tokens = estimateTokens(system) + estimateTokens(user)
    if (tokens > MAX_PROMPT_TOKENS || !canSpend(ledger, estimateCallUsd(model, tokens, maxTokens))) return null
    const effort = effortFor(kind)
    const thinking = thinkingFor(model, effort)
    const result = await o.llm.complete({ kind, model, system, user, maxTokens, effort, ...(thinking ? { thinking } : {}), schema })
    const call: BudgetCall = { at: nowIso, kind, model, ...result.usage, usd: costUsd(model, result.usage) }
    calls.push(call)
    ledger = recordCall(ledger, call)
    return result
  }
  return { complete, calls, nowIso }
}
