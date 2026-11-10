import { describe, expect, it } from 'vitest'
import { maxSimilarity, samenessProfile, shingles, similarity, words, wornPhrases } from '../src/novelty.ts'

describe('words', () => {
  it('lowercases and drops punctuation', () => {
    expect(words("I'm the CAT, again... (sigh)")).toEqual(['im', 'the', 'cat', 'again', 'sigh'])
  })

  it('keeps letters and digits from any script', () => {
    expect(words('Café 42 — ünïcode!')).toEqual(['café', '42', 'ünïcode'])
  })

  it('is empty for empty or symbol-only text', () => {
    expect(words('')).toEqual([])
    expect(words('... !!! —')).toEqual([])
  })
})

describe('shingles', () => {
  it('makes word 3-grams', () => {
    expect([...shingles('a b c d')]).toEqual(['a b c', 'b c d'])
  })

  it('uses the whole text as one shingle when it has fewer than 3 words', () => {
    expect([...shingles('Hello there')]).toEqual(['hello there'])
    expect([...shingles('')]).toEqual([])
  })
})

describe('similarity (Jaccard of word 3-grams)', () => {
  it('is 1 for identical text, ignoring case and punctuation', () => {
    expect(similarity('The fog came in again.', 'the fog came in again')).toBe(1)
  })

  it('is 0 when nothing is shared, and for empty text', () => {
    expect(similarity('one two three four', 'five six seven eight')).toBe(0)
    expect(similarity('', '')).toBe(0)
    expect(similarity('', 'some words here')).toBe(0)
  })

  it('is the shared share of all 3-grams', () => {
    // a b c d -> {abc, bcd}; b c d e -> {bcd, cde}; shared 1 of 3
    expect(similarity('a b c d', 'b c d e')).toBeCloseTo(1 / 3)
  })

  it('is symmetric', () => {
    const a = 'I read about lighthouses and kept a quote'
    const b = 'I read about radio and kept a souvenir'
    expect(similarity(a, b)).toBe(similarity(b, a))
  })
})

describe('maxSimilarity', () => {
  it('is the highest similarity against the others, 0 with none', () => {
    expect(maxSimilarity('a b c d', [])).toBe(0)
    expect(maxSimilarity('a b c d', ['x y z', 'a b c d', 'b c d e'])).toBe(1)
  })
})

describe('wornPhrases', () => {
  const texts = [
    'Another day of staring into the void of the internet.',
    'I spent the morning staring into the void again.',
    'More staring into the void, but with snacks.',
    'Staring into the void is my cardio.',
    'Something completely different today.',
  ]

  it('finds 3 to 5 word phrases used 4 or more times, most frequent first', () => {
    const worn = wornPhrases(texts)
    expect(worn[0]).toEqual({ phrase: 'staring into the void', count: 4 })
  })

  it('drops a shorter phrase inside a longer worn phrase with the same count', () => {
    const phrases = wornPhrases(texts).map((w) => w.phrase)
    expect(phrases).not.toContain('staring into the')
    expect(phrases).not.toContain('into the void')
  })

  it('ignores phrases under the threshold', () => {
    expect(wornPhrases(texts, { threshold: 5 })).toEqual([])
  })

  it('keeps at most the limit, deterministically', () => {
    const many = Array.from({ length: 4 }, () => 'a b c d e f g h i j k l m n o p')
    const worn = wornPhrases(many, { limit: 3 })
    expect(worn).toHaveLength(3)
    expect(wornPhrases(many, { limit: 3 })).toEqual(worn)
  })
})

describe('samenessProfile', () => {
  it('scores each text against the ones before it in the window', () => {
    const profile = samenessProfile(['a b c d', 'a b c d', 'x y z w'], { window: 10, thresholds: [0.3, 0.6] })
    expect(profile.count).toBe(3)
    expect(profile.scores).toEqual([0, 1, 0])
    expect(profile.max).toBe(1)
    expect(profile.mean).toBeCloseTo(1 / 3)
    expect(profile.over).toEqual({ '0.3': 1, '0.6': 1 })
  })

  it('only looks back as far as the window', () => {
    const profile = samenessProfile(['a b c d', 'q r s t', 'a b c d'], { window: 1, thresholds: [] })
    expect(profile.scores).toEqual([0, 0, 0])
  })

  it('gives percentiles of the scores', () => {
    const profile = samenessProfile(['a b c d', 'a b c d', 'a b c d', 'z z z z'], { window: 10, thresholds: [] })
    expect(profile.p50).toBe(1)
    expect(profile.p90).toBe(1)
  })

  it('is all zero for no texts', () => {
    expect(samenessProfile([], { window: 5, thresholds: [0.5] })).toEqual({
      count: 0, scores: [], mean: 0, p50: 0, p90: 0, max: 0, over: { '0.5': 0 },
    })
  })
})
