import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { z } from 'zod'
import type { ModelId, Usage } from './budget.ts'

/** What a call is for. Goes into the ledger, and lets a test fake answer each kind in turn. */
export type CallKind = 'morning' | 'weekly' | 'decide' | 'bedtime' | 'memory'

export interface LlmRequest<T = unknown> {
  kind: CallKind
  model: ModelId
  /** The stable prefix: persona, verbs, rules. Cached. */
  system: string
  /** Everything that changes from call to call. */
  user: string
  maxTokens: number
  effort: 'low' | 'medium'
  /** The shape of the answer, as structured output. */
  schema: z.ZodType<T>
}

export interface LlmResult<T = unknown> {
  /** Null when the model refused, ran out of tokens or returned something that doesn't fit the schema. */
  parsed: T | null
  usage: Usage
  stopReason: string | null
}

export type BatchOutcome =
  | { status: 'pending' }
  | { status: 'failed'; reason: string }
  | { status: 'done'; parsed: unknown; usage: Usage }

/** The mind talks to a model only through this, so tests can swap in a fake. */
export interface LlmClient {
  complete<T>(request: LlmRequest<T>): Promise<LlmResult<T>>
  /** Queues one request on the Batch API (half price, answered within a day) and returns its id. */
  submitBatch(request: LlmRequest): Promise<string>
  fetchBatch(id: string, schema: z.ZodType): Promise<BatchOutcome>
}

const BATCH_REQUEST_ID = 'request'

function usageOf(u: { input_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null; output_tokens: number }): Usage {
  return { input: u.input_tokens, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, output: u.output_tokens }
}

/** The real thing. Reads `ANTHROPIC_API_KEY` (or whatever the SDK finds) from the environment. */
export function anthropicClient(): LlmClient {
  const client = new Anthropic()
  /** The request body shared by a live call and a batched one. The prefix is identical on every call, so cache it. */
  const params = (request: LlmRequest) => ({
    model: request.model,
    max_tokens: request.maxTokens,
    system: [{ type: 'text' as const, text: request.system, cache_control: { type: 'ephemeral' as const } }],
    messages: [{ role: 'user' as const, content: request.user }],
    output_config: { effort: request.effort, format: zodOutputFormat(request.schema) },
  })
  return {
    async complete<T>(request: LlmRequest<T>): Promise<LlmResult<T>> {
      const response = await client.messages.parse(params(request))
      return { parsed: (response.parsed_output as T | null | undefined) ?? null, stopReason: response.stop_reason, usage: usageOf(response.usage) }
    },
    async submitBatch(request) {
      const batch = await client.messages.batches.create({ requests: [{ custom_id: BATCH_REQUEST_ID, params: params(request) }] })
      return batch.id
    },
    async fetchBatch(id, schema) {
      const batch = await client.messages.batches.retrieve(id)
      if (batch.processing_status !== 'ended') return { status: 'pending' }
      for await (const item of await client.messages.batches.results(id)) {
        if (item.result.type !== 'succeeded') return { status: 'failed', reason: item.result.type }
        const message = item.result.message
        const text = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
        let parsed: unknown = null
        try {
          const checked = schema.safeParse(JSON.parse(text))
          parsed = checked.success ? checked.data : null
        } catch {
          parsed = null
        }
        return { status: 'done', parsed, usage: usageOf(message.usage) }
      }
      return { status: 'failed', reason: 'no result' }
    },
  }
}
