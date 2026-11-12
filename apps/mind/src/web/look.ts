import { z } from 'zod'
import { costUsd, estimateCallUsd, estimateTokens, type Usage } from '../budget.ts'
import { IMAGE_TOKENS, thinkingFor, type LlmClient } from '../llm.ts'
import type { Fetcher } from './fetch.ts'
import type { Item } from './item.ts'
import { clampReaction, dataBlock, readSystem } from './read.ts'
import { pictureAt } from './readcall.ts'

/** The most pictures Merge may look at in a day (spec 7.8, 9.8). */
export const MAX_LOOKS_PER_DAY = 20
const HAIKU = 'claude-haiku-5-5' as const
const MAX_LOOK_TOKENS = 400
const MAX_LOOK_CHARS = 600

export const LookAnswer = z.object({
  description: z.string().describe('Up to 60 words: what you see.'),
  thought: z.string().describe('One sentence: what you think of it.'),
})

export interface LookDeps {
  llm: LlmClient | null
  fetcher: Fetcher
  seed: string
  mayCall?(estimateUsd: number): boolean
}

export interface LookOutcome {
  /** What it saw and thought, in its words; null when no look happened. */
  text: string | null
  usd: number
  usage?: Usage
  note?: string
}

/**
 * A look (spec 7.8): one Haiku call at low effort with a picture of an item, fetched by code from an allowed host (at most
 * 2 MB) and passed as data, and what Merge made of the page when it read it. Gives up to 60 words of description and a
 * thought, stored on the trail. Never throws on a model failure.
 */
export async function performLook(deps: LookDeps, item: Item, picture: number, reaction: string): Promise<LookOutcome> {
  const image = item.images[picture - 1]
  if (!image) return { text: null, usd: 0, note: `no picture ${picture}` }
  if (!deps.llm) return { text: null, usd: 0, note: 'no model' }
  const seen = await pictureAt(deps.fetcher, image.url)
  if (!seen) return { text: null, usd: 0, note: 'the picture could not be fetched' }

  const system = readSystem(deps.seed)
  const user = [
    `You are looking at a picture from a page you read. What you made of the page: ${reaction.slice(0, 400)}`,
    dataBlock('page', `The picture is on this page.`, { title: item.title, url: item.url }),
    'Say what you see in up to 60 words, then what you think of it in one sentence. Be honest about what is there.',
  ].join('\n\n')
  const estimate = estimateCallUsd(HAIKU, estimateTokens(system + user) + IMAGE_TOKENS * 6, MAX_LOOK_TOKENS)
  if (deps.mayCall && !deps.mayCall(estimate)) return { text: null, usd: 0, note: 'over the budget' }

  try {
    const r = await deps.llm.complete({ kind: 'vision', model: HAIKU, system, user, images: [seen], maxTokens: MAX_LOOK_TOKENS, effort: 'low', thinking: thinkingFor(HAIKU, 'low'), schema: LookAnswer })
    const usd = costUsd(HAIKU, r.usage)
    if (!r.parsed) return { text: null, usd, usage: r.usage, note: `no usable answer (stopped: ${r.stopReason ?? 'unknown'})` }
    const text = `${clampReaction(r.parsed.description)} ${r.parsed.thought.replace(/\s+/g, ' ').trim()}`.trim().slice(0, MAX_LOOK_CHARS)
    return { text: text || null, usd, usage: r.usage }
  } catch (error) {
    return { text: null, usd: 0, note: `the call failed: ${(error as Error).message}` }
  }
}
