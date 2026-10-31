import { describe, expect, it } from 'vitest'
import { Interests, type InterestSource } from '@forkling/schema'
import { fadeInterests, feedInterest, OBSESSION_START, OBSESSION_END, updatePhases } from '../src/interests.ts'

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
