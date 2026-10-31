import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { ModelId, Usage } from './budget.ts'
import { Decision } from './decision.ts'

export interface LlmRequest {
  model: ModelId
  /** The stable prefix: persona, verbs, rules. Cached. */
  system: string
  /** Everything that changes from call to call. */
  user: string
  maxTokens: number
  effort: 'low' | 'medium'
}

export interface LlmResult {
  /** Null when the model refused, ran out of tokens or returned something that doesn't fit the schema. */
  decision: Decision | null
  usage: Usage
  stopReason: string | null
}

/** The mind talks to a model only through this, so tests can swap in a fake. */
export interface LlmClient {
  complete(request: LlmRequest): Promise<LlmResult>
}

/** The real thing. Reads `ANTHROPIC_API_KEY` (or whatever the SDK finds) from the environment. */
export function anthropicClient(): LlmClient {
  const client = new Anthropic()
  return {
    async complete(request) {
      const response = await client.messages.parse({
        model: request.model,
        max_tokens: request.maxTokens,
        // The prefix is identical on every call, so cache it. The volatile part comes after the breakpoint.
        system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: request.user }],
        output_config: { effort: request.effort, format: zodOutputFormat(Decision) },
      })
      return {
        decision: response.parsed_output ?? null,
        stopReason: response.stop_reason,
        usage: {
          input: response.usage.input_tokens,
          cacheRead: response.usage.cache_read_input_tokens ?? 0,
          cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
          output: response.usage.output_tokens,
        },
      }
    },
  }
}
