import Anthropic from '@anthropic-ai/sdk'
import { transformJSONSchema } from '@anthropic-ai/sdk/lib/transform-json-schema'
import { z } from 'zod'
import type { ModelId, Usage } from './budget.ts'

/** What a call is for. Goes into the ledger, and lets a test fake answer each kind in turn. */
export type CallKind = 'morning' | 'weekly' | 'goalreview' | 'decide' | 'sleep' | 'read' | 'art' | 'vision' | 'design' | 'voice' | 'thought' | 'tinker' | 'repair' | 'sketch' | 'rework' | 'tend' | 'revisit' | 'expand' | 'found' | 'foundbuild' | 'reflection' | 'sleeplate' | 'screen' | 'reply' | 'session'

/** A picture for the model to look at: the eye-cam frame. */
export interface LlmImage {
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'
  base64: string
}

/** What a 512 px frame costs in input tokens, near enough for a budget guard. */
export const IMAGE_TOKENS = 350

export interface LlmRequest<T = unknown> {
  kind: CallKind
  model: ModelId
  /** The stable prefix: persona, verbs, rules. Cached. */
  system: string
  /** Everything that changes from call to call. */
  user: string
  /** Pictures that come before the text of `user`. */
  images?: readonly LlmImage[]
  maxTokens: number
  effort: 'low' | 'medium'
  /** `off` sends `thinking: {type: 'disabled'}`. Only for Haiku at low effort; Sonnet's thinking cannot be switched off. */
  thinking?: 'off'
  /** The shape of the answer, as structured output. */
  schema: z.ZodType<T>
}

/** Effort per call kind (spec 13). The calls that decide, reflect or review think at medium; the rest are low. */
const MEDIUM_KINDS: ReadonlySet<CallKind> = new Set(['morning', 'decide', 'weekly', 'goalreview', 'tinker', 'repair', 'sketch', 'tend', 'found', 'reflection'])
export const effortFor = (kind: CallKind): 'low' | 'medium' => (MEDIUM_KINDS.has(kind) ? 'medium' : 'low')

/** Haiku 5.5 thinks by default and accepts `disabled` at effort `high` or below, so low-effort Haiku rows run without it (spec 13). */
export const thinkingFor = (model: ModelId, effort: 'low' | 'medium'): 'off' | undefined => (model === 'claude-haiku-5-5' && effort === 'low' ? 'off' : undefined)

/** Why a call that came back gave no answer (spec 11.3). A refusal is never retried with the same input. */
export type StopFailure = 'refusal' | 'cut_off' | 'unparsed'
export function stopFailure(stopReason: string | null, parsed: unknown): StopFailure | null {
  if (stopReason === 'refusal') return 'refusal'
  if (parsed !== null && parsed !== undefined) return null
  return stopReason === 'max_tokens' ? 'cut_off' : 'unparsed'
}

export interface LlmResult<T = unknown> {
  /** Null when the model refused, ran out of tokens or returned something that doesn't fit the schema. */
  parsed: T | null
  /** Why the text did not parse (not JSON, or the first schema issues), for the tick log. Absent when it parsed. */
  parseError?: string
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
  /** Cancels a batch that is still running, so a request that has gone late can be run as a normal call without being paid for twice. */
  cancelBatch(id: string): Promise<void>
}

const BATCH_REQUEST_ID = 'request'

/** The user turn of a call: plain text, or the pictures followed by the text. */
export function userContent(user: string, images: readonly LlmImage[] = []) {
  if (images.length === 0) return user
  return [
    ...images.map((image) => ({ type: 'image' as const, source: { type: 'base64' as const, media_type: image.mediaType, data: image.base64 } })),
    { type: 'text' as const, text: user },
  ]
}

function usageOf(u: { input_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null; output_tokens: number }): Usage {
  return { input: u.input_tokens, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, output: u.output_tokens }
}

type SchemaNode = Record<string, unknown>
const isNode = (v: unknown): v is SchemaNode => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Calls `visit` on each pair of nodes the SDK's transform keeps in the same place (`oneOf` becomes `anyOf`). */
function walkPairs(raw: SchemaNode, strict: SchemaNode, visit: (raw: SchemaNode, strict: SchemaNode) => void): void {
  visit(raw, strict)
  const defs = raw.$defs
  if (isNode(defs) && isNode(strict.$defs)) for (const [name, def] of Object.entries(defs)) if (isNode(def) && isNode(strict.$defs[name])) walkPairs(def, strict.$defs[name] as SchemaNode, visit)
  if (raw.$ref !== undefined) return
  const variants = (raw.anyOf ?? raw.oneOf ?? raw.allOf) as unknown
  const strictVariants = (strict.anyOf ?? strict.allOf) as unknown
  if (Array.isArray(variants) && Array.isArray(strictVariants)) variants.forEach((v, i) => isNode(v) && isNode(strictVariants[i]) && walkPairs(v, strictVariants[i] as SchemaNode, visit))
  if (isNode(raw.properties) && isNode(strict.properties)) {
    for (const [key, prop] of Object.entries(raw.properties)) if (isNode(prop) && isNode(strict.properties[key])) walkPairs(prop, strict.properties[key] as SchemaNode, visit)
  }
  if (isNode(raw.items) && isNode(strict.items)) walkPairs(raw.items, strict.items, visit)
}

/**
 * The structured-output format for a schema. The SDK's `zodOutputFormat` (1.3.0) moves `enum` and `const` into the
 * description as text, so the API never enforced them: a sketch whose kind was not one of the six parsed as nothing and was
 * lost (R1 fast-forward, 22 and 25 November). The API supports both, so they are put back where the zod schema has them.
 */
export function outputFormat(schema: z.ZodType): { type: 'json_schema'; schema: SchemaNode } {
  const raw = z.toJSONSchema(schema, { reused: 'ref' }) as SchemaNode
  const stripped = structuredClone(raw)
  // Taken out before the transform, so it does not write them into the description, and put back after.
  walkPairs(stripped, stripped, (node) => {
    delete node.enum
    delete node.const
  })
  const strict = transformJSONSchema(stripped) as SchemaNode
  walkPairs(raw, strict, (from, to) => {
    if (Array.isArray(from.enum)) to.enum = from.enum
    if (from.const !== undefined) to.const = from.const
  })
  return { type: 'json_schema', schema: strict }
}

/** The answer's text checked against the schema, or why it does not fit (the first three issues). */
export function parseAnswer<T>(text: string, schema: z.ZodType<T>): { parsed: T | null; error?: string } {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { parsed: null, error: 'the answer is not JSON' }
  }
  const checked = schema.safeParse(json)
  if (checked.success) return { parsed: checked.data }
  const issues = checked.error.issues.slice(0, 3).map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
  return { parsed: null, error: issues.join('; ') }
}

/** The request body shared by a live call and a batched one. The prefix is identical on every call, so cache it. */
export function requestParams(request: LlmRequest) {
  return {
    model: request.model,
    max_tokens: request.maxTokens,
    system: [{ type: 'text' as const, text: request.system, cache_control: { type: 'ephemeral' as const } }],
    messages: [{ role: 'user' as const, content: userContent(request.user, request.images) }],
    output_config: { effort: request.effort, format: outputFormat(request.schema) },
    ...(request.thinking === 'off' ? { thinking: { type: 'disabled' as const } } : {}),
  }
}

/** The real thing. Reads `ANTHROPIC_API_KEY` (or whatever the SDK finds) from the environment. */
export function anthropicClient(client: Anthropic = new Anthropic()): LlmClient {
  const params = requestParams
  return {
    async complete<T>(request: LlmRequest<T>): Promise<LlmResult<T>> {
      // `messages.parse` throws when the answer stops in the middle of its JSON, and then neither the stop reason nor the cost
      // gets back (a tend that ran out of tokens showed as "call failed" and was never booked). So the text is parsed here, as
      // a batch result is: a cut-off answer is a null with its stop reason and usage.
      const response = await client.messages.create(params(request))
      const text = response.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
      const { parsed, error } = parseAnswer(text, request.schema)
      return { parsed, ...(error ? { parseError: error } : {}), stopReason: response.stop_reason, usage: usageOf(response.usage) }
    },
    async submitBatch(request) {
      const batch = await client.messages.batches.create({ requests: [{ custom_id: BATCH_REQUEST_ID, params: params(request) }] })
      return batch.id
    },
    async cancelBatch(id) {
      await client.messages.batches.cancel(id)
    },
    async fetchBatch(id, schema) {
      const batch = await client.messages.batches.retrieve(id)
      if (batch.processing_status !== 'ended') return { status: 'pending' }
      for await (const item of await client.messages.batches.results(id)) {
        if (item.result.type !== 'succeeded') return { status: 'failed', reason: item.result.type }
        const message = item.result.message
        const text = message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
        return { status: 'done', parsed: parseAnswer(text, schema).parsed, usage: usageOf(message.usage) }
      }
      return { status: 'failed', reason: 'no result' }
    },
  }
}
