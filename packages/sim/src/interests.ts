import type { Interests, InterestSource, Obsession } from '@forkling/schema'

/** A topic this strong turns into an obsession. */
export const OBSESSION_START = 0.8
/** An obsession ends when its topic has faded below this. */
export const OBSESSION_END = 0.3

/** How much of a full delta moves a weight, so a topic takes a few feedings to become anything. */
const FEED_STEP = 0.4
/** What is left of a weight after a day. Obsessions burn out faster, so they end unless something keeps feeding them. */
const DAILY_KEEP = 0.92
const OBSESSION_DAILY_KEEP = 0.8
const FORGET_BELOW = 0.05
const MAX_SOURCES = 5
const MAX_PAST = 30
const MAX_TOPIC = 60

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const round3 = (n: number) => Math.round(n * 1000) / 1000

export interface Feeding {
  /** In its own words; trimmed, lowercased and cut to a sane length to be a key. */
  topic: string
  /** -1 to 1. */
  delta: number
  /** The feed item or page that caused it, or null. */
  source: InterestSource | null
  nowIso: string
}

/** Something it read made a topic more or less interesting. Pure. */
export function feedInterest(interests: Interests, feeding: Feeding): Interests {
  const key = feeding.topic.trim().toLowerCase().slice(0, MAX_TOPIC).trim()
  if (!key || !Number.isFinite(feeding.delta)) return interests
  const old = interests.topics[key]
  const weight = round3(clamp((old?.weight ?? 0) + clamp(feeding.delta, -1, 1) * FEED_STEP, 0, 1))
  const topics = { ...interests.topics }
  if (weight <= 0) {
    delete topics[key]
    return { ...interests, topics }
  }
  let sources = old?.sources ?? []
  if (feeding.source && !sources.some((s) => s.id === feeding.source!.id)) {
    // The first source is the origin and stays; after that only the latest few.
    sources = sources.length < MAX_SOURCES ? [...sources, feeding.source] : [sources[0]!, ...sources.slice(2), feeding.source]
  }
  topics[key] = { weight, firstSeen: old?.firstSeen ?? feeding.nowIso, lastFed: feeding.nowIso, sources }
  return { ...interests, topics }
}

/** One day passes: every weight falls, an obsessed-over topic faster. What has faded away is forgotten. Pure. */
export function fadeInterests(interests: Interests): Interests {
  const topics: Interests['topics'] = {}
  for (const [key, topic] of Object.entries(interests.topics)) {
    const weight = round3(topic.weight * (interests.current?.topic === key ? OBSESSION_DAILY_KEEP : DAILY_KEEP))
    if (weight >= FORGET_BELOW) topics[key] = { ...topic, weight }
  }
  return { ...interests, topics }
}

/**
 * Starts an obsession when a topic spikes (and has a known source to trace it to), ends one when its topic has burned
 * out, and keeps the ended ones as past phases. One change per call. Pure.
 */
export function updatePhases(interests: Interests, nowIso: string): Interests {
  const { current } = interests
  if (current) {
    const weight = interests.topics[current.topic]?.weight ?? 0
    if (weight >= OBSESSION_END) return interests
    return { ...interests, current: null, past: [...interests.past, { ...current, endedAt: nowIso }].slice(-MAX_PAST) }
  }
  let best: { topic: string; weight: number; origin: InterestSource } | null = null
  for (const [topic, t] of Object.entries(interests.topics)) {
    const origin = t.sources[0]
    if (origin && t.weight >= OBSESSION_START && (!best || t.weight > best.weight)) best = { topic, weight: t.weight, origin }
  }
  if (!best) return interests
  const started: Obsession = { topic: best.topic, startedAt: nowIso, origin: best.origin }
  return { ...interests, current: started }
}
