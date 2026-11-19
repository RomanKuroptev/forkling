import { describe, expect, it } from 'vitest'
import { dailyTopics, kindShares, repetitionShare, restByDay, risingRun, somethingNew, topicRuns, topicVariety, topWord } from '../src/behaviour-measures.ts'

const loopText = 'feedback loop circuit oscillator signal returns again feedback loop circuit oscillator signal'
const item = (date: string, title: string, text = title) => ({ at: `${date}T10:00:00Z`, title, text })

describe('topicVariety', () => {
  it('counts clusters and the share of the biggest', () => {
    const items = [
      item('2026-11-19', 'Loop one', loopText),
      item('2026-11-19', 'Loop two', loopText),
      item('2026-11-20', 'Loop three', loopText),
      item('2026-11-20', 'Sand dunes', 'sand dunes ripple desert grain wind barchan'),
    ]
    const v = topicVariety(items)
    expect(v.clusters).toBe(2)
    expect(v.topShare).toBeCloseTo(0.75)
    expect(v.topTitles).toEqual(['Loop one', 'Loop two', 'Loop three'])
  })
  it('is empty for nothing', () => {
    expect(topicVariety([])).toEqual({ clusters: 0, topShare: 0, topTitles: [] })
  })
})

describe('dailyTopics and topicRuns', () => {
  const days = ['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23']
  it('finds the longest run of days with the same top cluster', () => {
    const items = [
      ...days.slice(0, 4).map((d, i) => item(d, `Loop ${i}`, loopText)),
      item('2026-11-23', 'Moths', 'moth wing lamp night flutter dust scale'),
    ]
    expect(dailyTopics(items).map((d) => d.date)).toEqual(days)
    const r = topicRuns(items)
    expect(r.longest).toBe(4)
    expect(r.from).toBe('2026-11-19')
    expect(r.to).toBe('2026-11-22')
    expect(r.titles).toContain('Loop 0')
  })
  it('a day with nothing breaks a run', () => {
    const items = [item('2026-11-19', 'Loop a', loopText), item('2026-11-21', 'Loop b', loopText)]
    expect(topicRuns(items).longest).toBe(1)
  })
  it('different topics every day give runs of 1', () => {
    const items = [item('2026-11-19', 'Moths', 'moth wing lamp'), item('2026-11-20', 'Sand', 'sand dune grain')]
    expect(topicRuns(items).longest).toBe(1)
  })
  it('nothing gives 0', () => {
    expect(topicRuns([]).longest).toBe(0)
  })
})

describe('topWord', () => {
  it('finds the content word in the most titles, plurals folded', () => {
    const w = topWord(['Loop pedal', 'Two loops', 'Sand', 'A loop of string'])
    expect(w).toEqual({ word: 'loop', count: 3, share: 0.75 })
  })
  it('counts a word once per title', () => {
    expect(topWord(['loop loop loop', 'sand'])).toEqual({ word: 'loop', count: 1, share: 0.5 })
  })
  it('null for no words', () => {
    expect(topWord([])).toBeNull()
    expect(topWord(['a', 'the'])).toBeNull()
  })
})

describe('repetitionShare', () => {
  it('counts lines over 0.6 similar to one of the last 5', () => {
    const lines = ['the lamp is on again tonight', 'the lamp is on again tonight', 'a moth went quiet by the shelf', 'some fog waited at noon']
    const r = repetitionShare(lines)
    expect(r).toEqual({ repeated: 1, total: 4, share: 0.25, examples: ['the lamp is on again tonight'] })
  })
  it('only looks back as far as the window', () => {
    const lines = ['the lamp is on again tonight', 'one', 'two', 'three', 'four', 'five', 'the lamp is on again tonight']
    expect(repetitionShare(lines).repeated).toBe(0)
    expect(repetitionShare(lines, { window: 6 }).repeated).toBe(1)
  })
  it('is 0 of 0 for nothing', () => {
    expect(repetitionShare([])).toEqual({ repeated: 0, total: 0, share: 0, examples: [] })
  })
})

describe('restByDay and risingRun', () => {
  it('gives the rest share of waking steps per day', () => {
    expect(restByDay([{ date: 'a', rest: 2, waking: 8 }, { date: 'b', rest: 0, waking: 0 }])).toEqual([
      { date: 'a', share: 0.25 },
      { date: 'b', share: 0 },
    ])
  })
  it('counts the longest run of days that each rose', () => {
    expect(risingRun([0.1, 0.2, 0.3, 0.4, 0.2])).toBe(3)
    expect(risingRun([0.3, 0.3, 0.3])).toBe(0)
    expect(risingRun([0.1, 0.2, 0.1, 0.2])).toBe(1)
    expect(risingRun([])).toBe(0)
  })
})

describe('somethingNew', () => {
  it('says for each look whether something was made since the last look', () => {
    const looks = [100, 200, 300]
    expect(somethingNew({ fromMs: 0, looksMs: looks, madeMs: [50, 250] })).toEqual([
      { atMs: 100, isNew: true },
      { atMs: 200, isNew: false },
      { atMs: 300, isNew: true },
    ])
  })
  it('a thing made exactly at a look counts for that look', () => {
    expect(somethingNew({ fromMs: 0, looksMs: [100], madeMs: [100] })).toEqual([{ atMs: 100, isNew: true }])
  })
})

describe('kindShares', () => {
  it('counts kinds and the biggest share', () => {
    expect(kindShares(['art', 'art', 'game', 'meme'])).toEqual({ kinds: 3, total: 4, top: { kind: 'art', share: 0.5 }, counts: { art: 2, game: 1, meme: 1 } })
  })
  it('handles nothing', () => {
    expect(kindShares([])).toEqual({ kinds: 0, total: 0, top: null, counts: {} })
  })
})
