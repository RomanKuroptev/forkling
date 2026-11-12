import type { Interests } from '@forkling/schema'
import { costUsd, estimateCallUsd, estimateTokens, type Usage } from '../budget.ts'
import { IMAGE_TOKENS, type LlmClient, type LlmImage } from '../llm.ts'
import type { Fetcher } from './fetch.ts'
import type { Item } from './item.ts'
import { buildReadPrompt, judgeSouvenir, READ_MAX_TOKENS, ReadAnswer, readSystem, type SouvenirOutcome } from './read.ts'
import { skipReason } from './skip.ts'

const HAIKU = 'claude-haiku-5-5' as const
const MAX_PICTURE_BYTES = 2 * 1024 * 1024

/** An item's first picture as a JPEG for the model to look at, or null (not a JPEG, over 2 MB, or the fetch failed). */
export async function pictureOf(f: Fetcher, item: Item): Promise<LlmImage | null> {
  const first = item.images[0]
  if (!first) return null
  try {
    const got = await f.bytes(first.url, { accept: 'image/jpeg,image/*' })
    if (!got.contentType.includes('jpeg') || got.bytes.length === 0 || got.bytes.length > MAX_PICTURE_BYTES) return null
    return { mediaType: 'image/jpeg', base64: Buffer.from(got.bytes).toString('base64') }
  } catch {
    return null
  }
}

export interface ReadDeps {
  llm: LlmClient | null
  fetcher: Fetcher
  /** The seed text; the cached start of the call. */
  seed: string
  purpose: string
  interests: Interests
  /** Whether a call that could cost this much may be made. Called before every call. */
  mayCall?(estimateUsd: number): boolean
  /** Skip items read in the last 30 days. */
  readRecently?(url: string): boolean
  /** Show a record's picture to the read call. */
  look?: boolean
}

export interface ReadOutcome {
  /** Null: no model, no budget, or no usable answer. */
  answer: ReadAnswer | null
  souvenir: SouvenirOutcome
  skipped?: string
  usd: number
  /** What the call used, for the budget ledger. Absent when no call was made. */
  usage?: Usage
  /** Why there is no answer, when there is not one and nothing was skipped. */
  note?: string
}

/**
 * One read call for one item: skip rules first (no model call), then the picture of a record, then Haiku at low effort with
 * the page as a data block, then the code's own judgement of the souvenir it offered. Never throws on a model failure.
 */
export async function performRead(deps: ReadDeps, item: Item): Promise<ReadOutcome> {
  const skipped = skipReason(item, deps.readRecently)
  if (skipped) return { answer: null, souvenir: {}, skipped, usd: 0 }
  if (!deps.llm) return { answer: null, souvenir: {}, usd: 0, note: 'no model' }

  const picture = deps.look !== false && item.kind === 'record' ? await pictureOf(deps.fetcher, item) : null
  const system = readSystem(deps.seed)
  const user = buildReadPrompt({ item, purpose: deps.purpose, interests: deps.interests, withImage: picture !== null })
  const estimate = estimateCallUsd(HAIKU, estimateTokens(system + user) + (picture ? IMAGE_TOKENS * 6 : 0), READ_MAX_TOKENS)
  if (deps.mayCall && !deps.mayCall(estimate)) return { answer: null, souvenir: {}, usd: 0, note: 'over the budget' }

  try {
    const r = await deps.llm.complete({ kind: 'read', model: HAIKU, system, user, images: picture ? [picture] : [], maxTokens: READ_MAX_TOKENS, effort: 'low', schema: ReadAnswer })
    const usd = costUsd(HAIKU, r.usage)
    if (!r.parsed) return { answer: null, souvenir: {}, usd, usage: r.usage, note: `no usable answer (stopped: ${r.stopReason ?? 'unknown'})` }
    return { answer: r.parsed, souvenir: judgeSouvenir(r.parsed, item), usd, usage: r.usage }
  } catch (error) {
    return { answer: null, souvenir: {}, usd: 0, note: `the call failed: ${(error as Error).message}` }
  }
}
