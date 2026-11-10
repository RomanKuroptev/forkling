/**
 * Sameness measures (spec 12.1). Pure, no model calls.
 *
 * Similarity is the Jaccard overlap of word 3-grams after lowercasing and dropping punctuation. It catches copies and
 * near copies; it does not catch the same idea in new words, and nothing here claims to.
 */

/** Lowercase words, punctuation dropped. Apostrophes join ("I'm" -> "im"); letters and digits of any script count. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

/** Word 3-grams. A text of 1 or 2 words is one shingle of its own, so two identical short texts still match. */
export function shingles(text: string, n = 3): Set<string> {
  const w = words(text)
  if (w.length === 0) return new Set()
  if (w.length < n) return new Set([w.join(' ')])
  const out = new Set<string>()
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '))
  return out
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let shared = 0
  for (const s of a) if (b.has(s)) shared++
  return shared / (a.size + b.size - shared)
}

/** 0 is nothing shared, 1 is identical. Empty text shares nothing. */
export function similarity(a: string, b: string): number {
  return jaccard(shingles(a), shingles(b))
}

/** The highest similarity of `text` against any of `others`, 0 when there are none. */
export function maxSimilarity(text: string, others: readonly string[]): number {
  const mine = shingles(text)
  let best = 0
  for (const other of others) best = Math.max(best, jaccard(mine, shingles(other)))
  return best
}

export interface WornPhrase {
  phrase: string
  count: number
}

export interface WornOptions {
  /** Shortest phrase in words. */
  min?: number
  /** Longest phrase in words. */
  max?: number
  /** Uses at which a phrase is worn. */
  threshold?: number
  /** Most phrases kept. */
  limit?: number
}

/**
 * Phrases of 3 to 5 words used 4 or more times across the texts, most frequent first, at most 30. A shorter phrase
 * that only ever appears inside a longer worn one (same count) is dropped, so "staring into the void" is listed once
 * rather than with its pieces. Ties go to the longer phrase, then alphabetical order, so the result is deterministic.
 */
export function wornPhrases(texts: readonly string[], options: WornOptions = {}): WornPhrase[] {
  const { min = 3, max = 5, threshold = 4, limit = 30 } = options
  const counts = new Map<string, number>()
  for (const text of texts) {
    const w = words(text)
    for (let n = min; n <= max; n++) {
      for (let i = 0; i + n <= w.length; i++) {
        const phrase = w.slice(i, i + n).join(' ')
        counts.set(phrase, (counts.get(phrase) ?? 0) + 1)
      }
    }
  }
  const worn = [...counts].filter(([, c]) => c >= threshold).map(([phrase, count]) => ({ phrase, count }))
  const kept = worn.filter(
    (w) => !worn.some((o) => o.count === w.count && o.phrase.length > w.phrase.length && ` ${o.phrase} `.includes(` ${w.phrase} `)),
  )
  kept.sort((a, b) => b.count - a.count || b.phrase.split(' ').length - a.phrase.split(' ').length || a.phrase.localeCompare(b.phrase))
  return kept.slice(0, limit)
}

export interface SamenessProfile {
  count: number
  /** Each text's highest similarity with the texts before it, within the window. */
  scores: number[]
  mean: number
  p50: number
  p90: number
  max: number
  /** How many scores are over each threshold, keyed by the threshold as written. */
  over: Record<string, number>
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0
}

/**
 * How much a run of texts repeats itself: for each text, its highest similarity with the `window` texts before it.
 * Used to calibrate the thresholds in spec 12 against what real repetition scores.
 */
export function samenessProfile(texts: readonly string[], options: { window: number; thresholds: readonly number[] }): SamenessProfile {
  const sets = texts.map((t) => shingles(t))
  const scores = sets.map((mine, i) => {
    let best = 0
    for (let j = Math.max(0, i - options.window); j < i; j++) best = Math.max(best, jaccard(mine, sets[j] ?? new Set()))
    return best
  })
  const sorted = [...scores].sort((a, b) => a - b)
  const over: Record<string, number> = {}
  for (const t of options.thresholds) over[String(t)] = scores.filter((s) => s > t).length
  return {
    count: scores.length,
    scores,
    mean: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
    p50: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
    max: sorted[sorted.length - 1] ?? 0,
    over,
  }
}
