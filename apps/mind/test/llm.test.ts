import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { anthropicClient, effortFor, requestParams, stopFailure, thinkingFor, userContent } from '../src/llm.ts'

describe('userContent', () => {
  it('is the plain text when there is no picture', () => {
    expect(userContent('hello')).toBe('hello')
    expect(userContent('hello', [])).toBe('hello')
  })

  it('puts the pictures first and the text last', () => {
    const content = userContent('what is this?', [{ mediaType: 'image/jpeg', base64: 'AAAA' }])
    expect(content).toEqual([
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } },
      { type: 'text', text: 'what is this?' },
    ])
  })
})

describe('effortFor (spec 13: effort per call kind)', () => {
  it('is medium for the calls that decide, reflect or review, and low for the rest', () => {
    for (const kind of ['morning', 'decide', 'reflection', 'weekly', 'tinker', 'repair', 'sketch'] as const) expect(effortFor(kind)).toBe('medium')
    for (const kind of ['read', 'vision', 'sleep', 'art', 'design', 'voice', 'thought'] as const) expect(effortFor(kind)).toBe('low')
  })
})

describe('thinkingFor', () => {
  it('switches thinking off for Haiku at low effort only', () => {
    expect(thinkingFor('claude-haiku-5-5', 'low')).toBe('off')
    expect(thinkingFor('claude-haiku-5-5', 'medium')).toBeUndefined()
  })

  it('leaves Sonnet alone: its thinking cannot be disabled (the spec 13 note)', () => {
    expect(thinkingFor('claude-sonnet-5-5', 'low')).toBeUndefined()
    expect(thinkingFor('claude-sonnet-5-5', 'medium')).toBeUndefined()
  })
})

describe('requestParams', () => {
  const base = { kind: 'read' as const, system: 's', user: 'u', maxTokens: 100, schema: z.object({ a: z.string() }) }

  it('sends thinking: disabled when the request asks for it, and nothing about thinking otherwise', () => {
    const off = requestParams({ ...base, model: 'claude-haiku-5-5', effort: 'low', thinking: 'off' })
    expect(off.thinking).toEqual({ type: 'disabled' })
    expect(off.output_config.effort).toBe('low')
    expect('thinking' in requestParams({ ...base, model: 'claude-haiku-5-5', effort: 'medium' })).toBe(false)
  })
})

describe('stopFailure (spec 11.3)', () => {
  it('is null for an answer that parsed', () => {
    expect(stopFailure('end_turn', { a: 1 })).toBeNull()
  })

  it('tells a refusal from a cut-off answer from one that does not fit the schema', () => {
    expect(stopFailure('refusal', null)).toBe('refusal')
    expect(stopFailure('max_tokens', null)).toBe('cut_off')
    expect(stopFailure('end_turn', null)).toBe('unparsed')
    expect(stopFailure(null, null)).toBe('unparsed')
  })

  it('counts a refusal as a refusal even if something parsed', () => {
    expect(stopFailure('refusal', { a: 1 })).toBe('refusal')
  })
})

describe('anthropicClient: an answer cut off in the middle still comes back as a cut-off, with its cost', () => {
  const Answer = z.object({ title: z.string(), n: z.number() })
  const usage = { input_tokens: 1200, output_tokens: 600, cache_read_input_tokens: 0, cache_creation_input_tokens: 300 }
  const clientWith = (message: unknown) => anthropicClient({ messages: { create: async () => message, batches: {} } } as never)
  const request = { kind: 'sketch' as const, model: 'claude-sonnet-5-5' as const, system: 's', user: 'u', maxTokens: 600, effort: 'medium' as const, schema: Answer }

  it('gives null, the stop reason and the usage when the JSON stops half way (the SDK parser used to throw, and the cost was never booked)', async () => {
    const r = await clientWith({ content: [{ type: 'text', text: '{"title": "A boat on a pon' }], stop_reason: 'max_tokens', usage }).complete(request)
    expect(r.parsed).toBeNull()
    expect(r.stopReason).toBe('max_tokens')
    expect(r.usage).toEqual({ input: 1200, cacheRead: 0, cacheWrite: 300, output: 600 })
    expect(stopFailure(r.stopReason, r.parsed)).toBe('cut_off')
  })

  it('gives the parsed answer when it fits the schema', async () => {
    const r = await clientWith({ content: [{ type: 'thinking', thinking: '...' }, { type: 'text', text: '{"title": "A boat", "n": 3}' }], stop_reason: 'end_turn', usage }).complete(request)
    expect(r.parsed).toEqual({ title: 'A boat', n: 3 })
  })

  it('gives null and an unparsed failure when the answer is whole but does not fit the schema', async () => {
    const r = await clientWith({ content: [{ type: 'text', text: '{"title": 7}' }], stop_reason: 'end_turn', usage }).complete(request)
    expect(r.parsed).toBeNull()
    expect(stopFailure(r.stopReason, r.parsed)).toBe('unparsed')
  })
})
