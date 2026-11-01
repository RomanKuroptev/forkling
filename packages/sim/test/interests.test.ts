import { describe, expect, it } from 'vitest'
import { Interests, type InterestSource } from '@forkling/schema'
import { fadeInterests, feedInterest, foldTopic, OBSESSION_START, OBSESSION_END, updatePhases } from '../src/interests.ts'

const T0 = '2026-11-03T07:30:00Z'
const T1 = '2026-11-04T07:30:00Z'

const hn: InterestSource = { id: 'hn:1', title: 'A CPU built in Minecraft', url: 'https://example.com/cpu', at: T0 }
const wiki: InterestSource = { id: 'wiki:Logic_gate', title: 'Logic gate', url: 'https://en.wikipedia.org/wiki/Logic_gate', at: T0 }

const empty = Interests.parse({})

describe('feedInterest', () => {
  it('starts a topic at a modest weight, with its source as the origin', () => {
    const next = feedInterest(empty, { topic: '  Logic Gates ', delta: 0.5, source: hn, nowIso: T0 })
    expect(Object.keys(next.topics)).toEqual(['logic gates'])
    const t = next.topics['logic gates']!
    expect(t.weight).toBeGreaterThan(0)
    expect(t.weight).toBeLessThan(0.5)
    expect(t.sources).toEqual([hn])
    expect(t.firstSeen).toBe(T0)
  })

  it('raises a topic each time it is fed, never past 1, and keeps the first source as origin', () => {
    let i = feedInterest(empty, { topic: 'logic gates', delta: 1, source: hn, nowIso: T0 })
    for (let n = 0; n < 6; n++) i = feedInterest(i, { topic: 'logic gates', delta: 1, source: wiki, nowIso: T1 })
    const t = i.topics['logic gates']!
    expect(t.weight).toBe(1)
    expect(t.sources[0]).toEqual(hn)
    expect(t.sources.filter((s) => s.id === 'wiki:Logic_gate')).toHaveLength(1)
    expect(t.lastFed).toBe(T1)
  })

  it('lowers a topic that bored it, and forgets it at zero', () => {
    let i = feedInterest(empty, { topic: 'socks', delta: 0.3, source: null, nowIso: T0 })
    i = feedInterest(i, { topic: 'socks', delta: -1, source: null, nowIso: T1 })
    expect(i.topics.socks).toBeUndefined()
  })

  it('clamps the delta and the topic text', () => {
    const next = feedInterest(empty, { topic: 'x'.repeat(200), delta: 50, source: null, nowIso: T0 })
    const [key, topic] = Object.entries(next.topics)[0]!
    expect(key.length).toBeLessThanOrEqual(60)
    expect(topic.weight).toBeLessThanOrEqual(1)
  })

  it('ignores an empty topic', () => {
    expect(feedInterest(empty, { topic: '   ', delta: 1, source: null, nowIso: T0 })).toEqual(empty)
  })

  it('caps how many sources a topic keeps, keeping the origin', () => {
    let i = empty
    for (let n = 0; n < 9; n++) i = feedInterest(i, { topic: 'moon', delta: 0.1, source: { ...hn, id: `hn:${n}` }, nowIso: T0 })
    const sources = i.topics.moon!.sources
    expect(sources).toHaveLength(5)
    expect(sources[0]!.id).toBe('hn:0')
    expect(sources.at(-1)!.id).toBe('hn:8')
  })

  it('does not change its input', () => {
    const before = JSON.stringify(empty)
    feedInterest(empty, { topic: 'moon', delta: 1, source: hn, nowIso: T0 })
    expect(JSON.stringify(empty)).toBe(before)
  })
})

describe('fadeInterests', () => {
  it('lowers every weight, and lets go of what has faded away', () => {
    let i = feedInterest(empty, { topic: 'moon', delta: 1, source: hn, nowIso: T0 })
    const w = i.topics.moon!.weight
    const faded = fadeInterests(i)
    expect(faded.topics.moon!.weight).toBeLessThan(w)
    for (let n = 0; n < 60; n++) i = fadeInterests(i)
    expect(i.topics.moon).toBeUndefined()
  })

  it('fades an obsession faster than an ordinary interest', () => {
    let i = feedInterest(empty, { topic: 'moon', delta: 1, source: hn, nowIso: T0 })
    i = feedInterest(i, { topic: 'tea', delta: 1, source: wiki, nowIso: T0 })
    i = { ...i, topics: { moon: { ...i.topics.moon!, weight: 0.9 }, tea: { ...i.topics.tea!, weight: 0.9 } }, current: { topic: 'moon', startedAt: T0, origin: hn } }
    const after = fadeInterests(i)
    expect(after.topics.moon!.weight).toBeLessThan(after.topics.tea!.weight)
  })
})

describe('updatePhases', () => {
  const hot = (topic: string, weight: number, sources: InterestSource[] = [hn]): Interests => ({
    ...empty,
    topics: { [topic]: { weight, firstSeen: T0, lastFed: T0, sources } },
  })

  it('starts an obsession when a topic passes the threshold, remembering where it came from', () => {
    const next = updatePhases(hot('logic gates', OBSESSION_START), T1)
    expect(next.current).toEqual({ topic: 'logic gates', startedAt: T1, origin: hn })
  })

  it('does not start one below the threshold', () => {
    expect(updatePhases(hot('logic gates', OBSESSION_START - 0.05), T1).current).toBeNull()
  })

  it('cannot start one for a topic with no known source', () => {
    expect(updatePhases(hot('mystery', 0.95, []), T1).current).toBeNull()
  })

  it('picks the strongest topic when several are over', () => {
    const i: Interests = { ...hot('a', 0.85), topics: { ...hot('a', 0.85).topics, b: { weight: 0.95, firstSeen: T0, lastFed: T0, sources: [wiki] } } }
    expect(updatePhases(i, T1).current?.topic).toBe('b')
  })

  it('keeps an obsession going while the topic is still above the end mark', () => {
    const i = { ...hot('logic gates', OBSESSION_END + 0.05), current: { topic: 'logic gates', startedAt: T0, origin: hn } }
    expect(updatePhases(i, T1).current?.topic).toBe('logic gates')
  })

  it('ends it when the topic burns out, and keeps it as a past phase', () => {
    const i = { ...hot('logic gates', OBSESSION_END - 0.05), current: { topic: 'logic gates', startedAt: T0, origin: hn } }
    const next = updatePhases(i, T1)
    expect(next.current).toBeNull()
    expect(next.past).toEqual([{ topic: 'logic gates', startedAt: T0, origin: hn, endedAt: T1 }])
  })

  it('ends it when the topic is gone altogether', () => {
    const next = updatePhases({ ...empty, current: { topic: 'gone', startedAt: T0, origin: hn } }, T1)
    expect(next.current).toBeNull()
    expect(next.past).toHaveLength(1)
  })

  it('does not start a new obsession in the same step that ends the last, and never repeats the one that just ended', () => {
    const i: Interests = { ...hot('a', 0.2), current: { topic: 'a', startedAt: T0, origin: hn } }
    i.topics.b = { weight: 0.95, firstSeen: T0, lastFed: T0, sources: [wiki] }
    const next = updatePhases(i, T1)
    expect(next.current).toBeNull()
    expect(updatePhases(next, T1).current?.topic).toBe('b')
  })

  it('keeps at most thirty past phases', () => {
    const past = Array.from({ length: 30 }, (_, n) => ({ topic: `t${n}`, startedAt: T0, origin: hn, endedAt: T0 }))
    const next = updatePhases({ ...empty, past, current: { topic: 'x', startedAt: T0, origin: hn } }, T1)
    expect(next.past).toHaveLength(30)
    expect(next.past.at(-1)!.topic).toBe('x')
  })
})

const day = (n: number) => new Date(Date.parse(T0) + n * 86_400_000).toISOString()

/** Fed to the point of obsession on day 0. */
function obsessed(): Interests {
  let i = empty
  for (let n = 0; n < 4; n++) i = feedInterest(i, { topic: 'logic gates', delta: 1, source: hn, nowIso: day(0) })
  return updatePhases(i, day(0))
}

describe('an obsession cannot feed itself', () => {
  const weightAfterFeeding = (i: Interests, d: number) => feedInterest(i, { topic: 'logic gates', delta: 1, source: wiki, nowIso: day(d) }).topics['logic gates']!.weight
  const settled = (): Interests => ({ ...obsessed(), topics: { 'logic gates': { ...obsessed().topics['logic gates']!, weight: 0.5 } } })

  it('gains less from reading the longer it has lasted, and nothing after three days', () => {
    const i = settled()
    expect(i.current?.topic).toBe('logic gates')
    const gain = (d: number) => weightAfterFeeding(i, d) - 0.5
    expect(gain(0)).toBeGreaterThan(gain(1))
    expect(gain(1)).toBeGreaterThan(gain(2))
    expect(gain(3)).toBe(0)
    expect(gain(10)).toBe(0)
  })

  it('still loses fully from something that bored it', () => {
    const lowered = feedInterest(settled(), { topic: 'logic gates', delta: -1, source: null, nowIso: day(5) })
    expect(lowered.topics['logic gates']!.weight).toBeLessThan(0.5)
  })

  it('does not slow the start of an interest that is not an obsession yet', () => {
    const fresh = feedInterest(empty, { topic: 'moss', delta: 1, source: null, nowIso: day(9) })
    expect(fresh.topics.moss!.weight).toBeCloseTo(0.4, 3)
  })

  it('burns out within a week even if it is read about four times every day', () => {
    let i = obsessed()
    let endedOn = -1
    for (let d = 1; d <= 12 && endedOn < 0; d++) {
      for (let n = 0; n < 4; n++) i = feedInterest(i, { topic: 'logic gates', delta: 1, source: wiki, nowIso: day(d) })
      i = updatePhases(fadeInterests(i), day(d))
      if (!i.current) endedOn = d
    }
    expect(endedOn).toBeGreaterThan(0)
    expect(endedOn).toBeLessThanOrEqual(8)
    expect(i.past.at(-1)?.topic).toBe('logic gates')
  })
})

describe('the same topic under another spelling', () => {
  it('folds case, punctuation and simple plurals when comparing', () => {
    expect(foldTopic('Octopuses')).toBe(foldTopic('octopus'))
    expect(foldTopic('Logic gates!')).toBe(foldTopic('logic gate'))
    expect(foldTopic('Libraries')).toBe(foldTopic('library'))
    expect(foldTopic('Boxes')).toBe(foldTopic('box'))
    expect(foldTopic('moss')).not.toBe(foldTopic('mos'))
    expect(foldTopic('glass')).toBe('glass')
    expect(foldTopic('news')).toBe('news')
  })

  it('feeds the topic it already has, and keeps the spelling it first used', () => {
    let i = feedInterest(empty, { topic: 'Logic Gates', delta: 0.5, source: hn, nowIso: T0 })
    i = feedInterest(i, { topic: 'logic gate', delta: 0.5, source: wiki, nowIso: T1 })
    expect(Object.keys(i.topics)).toEqual(['logic gates'])
    expect(i.topics['logic gates']!.weight).toBeGreaterThan(0.3)
  })

  it('merges duplicates that are already there, when a day passes', () => {
    const dup = Interests.parse({
      topics: {
        octopus: { weight: 0.5, firstSeen: T1, lastFed: T1, sources: [hn] },
        octopuses: { weight: 0.4, firstSeen: T0, lastFed: T0, sources: [wiki] },
      },
    })
    const merged = fadeInterests(dup)
    expect(Object.keys(merged.topics)).toEqual(['octopus'])
    expect(merged.topics.octopus!.firstSeen).toBe(T0)
    expect(merged.topics.octopus!.lastFed).toBe(T1)
    expect(merged.topics.octopus!.sources.map((x) => x.id)).toEqual(['hn:1', 'wiki:Logic_gate'])
    // 0.9 together, less a day's fade.
    expect(merged.topics.octopus!.weight).toBeCloseTo(0.9 * 0.92, 2)
  })
})

describe('relapse', () => {
  it('does not start an obsession on a topic that ended in the last two weeks', () => {
    let i = obsessed()
    i = { ...i, topics: { 'logic gates': { ...i.topics['logic gates']!, weight: 0.1 } } }
    i = updatePhases(i, day(5)) // it burns out
    expect(i.current).toBeNull()
    // Fed to a spike again soon after.
    for (let n = 0; n < 6; n++) i = feedInterest(i, { topic: 'logic gates', delta: 1, source: wiki, nowIso: day(8) })
    expect(i.topics['logic gates']!.weight).toBeGreaterThanOrEqual(OBSESSION_START)
    expect(updatePhases(i, day(8)).current).toBeNull()
    expect(updatePhases(i, day(5 + 14)).current?.topic).toBe('logic gates')
  })

  it('lets another topic become the obsession in the meantime', () => {
    let i = obsessed()
    i = updatePhases({ ...i, topics: { 'logic gates': { ...i.topics['logic gates']!, weight: 0.1 } } }, day(5))
    for (let n = 0; n < 4; n++) i = feedInterest(i, { topic: 'moss', delta: 1, source: hn, nowIso: day(6) })
    expect(updatePhases(i, day(6)).current?.topic).toBe('moss')
  })
})

