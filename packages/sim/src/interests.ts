import { MAX_INTEREST_HISTORY, type InterestChange, type Interests, type InterestSource, type Obsession } from '@forkling/schema'

/** A topic this strong turns into an obsession. */
export const OBSESSION_START = 80
/** An obsession ends when its topic has faded below this. */
export const OBSESSION_END = 30

/** How much of a full delta moves a weight, so a topic takes a few feedings to become anything. */
const FEED_STEP = 40
/** What is left of a weight after a day. Obsessions burn out faster, so they end unless something keeps feeding them. */
const DAILY_KEEP = 0.92
const OBSESSION_DAILY_KEEP = 0.8
const FORGET_BELOW = 5
/** At most this many topics are kept; the lowest goes first (spec 3.1). */
export const MAX_TOPICS = 40
const MAX_WORDS = 4
const MAX_WEIGHT = 100
/** Points a change adds to a topic's weight (spec 3.1). */
export const EVENT_POINTS = { page: 4, souvenir: 10, note: 6 } as const
const MAX_SOURCES = 5
const MAX_PAST = 30
const MAX_TOPIC = 60
/** Reading about an obsession feeds it less each day it has lasted, and not at all after this many days. */
const OBSESSION_FEED_DAYS = 3
/** An obsession that ended may not start again on the same topic for this many days. */
const RELAPSE_COOLDOWN_DAYS = 14
const DAY_MS = 86_400_000

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const round3 = (n: number) => Math.round(n * 1000) / 1000

function foldWord(word: string): string {
  if (word.length >= 5 && word.endsWith('ies')) return `${word.slice(0, -3)}y`
  if (word.length >= 5 && /(s|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2)
  if (word.length >= 5 && word.endsWith('s') && !/(ss|us|is)$/.test(word)) return word.slice(0, -1)
  return word
}

/**
 * What two spellings of a topic share, for telling whether they are the same topic: case, punctuation and a simple plural
 * on the last word. It is only used to compare; a topic keeps the spelling it first had.
 */
export function foldTopic(topic: string): string {
  const words = topic
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return ''
  words[words.length - 1] = foldWord(words[words.length - 1]!)
  return words.join(' ')
}

export interface Feeding {
  /** In its own words; trimmed, lowercased and cut to a sane length to be a key. */
  topic: string
  /** -1 to 1. */
  delta: number
  /** The feed item or page that caused it, or null. */
  source: InterestSource | null
  nowIso: string
}

export interface TopicFeeding {
  topic: string
  event: keyof typeof EVENT_POINTS
  /** The trail (trip) that caused it, or null. */
  trail: string | null
  source: InterestSource | null
  nowIso: string
}

/** A topic is 1 to 4 lowercase words, so a long phrase is cut to its first four. */
function keyOf(topic: string): string {
  return topic.trim().toLowerCase().slice(0, MAX_TOPIC).trim().split(/\s+/).filter(Boolean).slice(0, MAX_WORDS).join(' ')
}

/** Keeps the strongest 40: the lowest weight goes first, then the one fed longest ago, then the one added first. */
function capTopics(topics: Interests['topics']): Interests['topics'] {
  const keys = Object.keys(topics)
  if (keys.length <= MAX_TOPICS) return topics
  const drop = new Set(
    keys
      .map((key, order) => ({ key, order }))
      .sort((a, b) => topics[a.key]!.weight - topics[b.key]!.weight || topics[a.key]!.lastFed.localeCompare(topics[b.key]!.lastFed) || a.order - b.order)
      .slice(0, keys.length - MAX_TOPICS)
      .map((x) => x.key),
  )
  return Object.fromEntries(keys.filter((k) => !drop.has(k)).map((k) => [k, topics[k]!]))
}

/** Moves one topic by `points` (negative lowers it). The one place a weight changes by feeding. Pure. */
function move(interests: Interests, typedTopic: string, points: number, record: Pick<InterestChange, 'event' | 'trail'>, source: InterestSource | null, nowIso: string): Interests {
  const typed = keyOf(typedTopic)
  if (!typed || !Number.isFinite(points)) return interests
  // Another spelling of a topic it already has is that topic.
  const key = Object.keys(interests.topics).find((k) => foldTopic(k) === foldTopic(typed)) ?? typed
  const old = interests.topics[key]
  // An obsession cannot keep itself alive: reading about it counts for less each day it has lasted, and for nothing after a few.
  const obsession = interests.current?.topic === key ? interests.current : null
  const ageDays = obsession ? (Date.parse(nowIso) - Date.parse(obsession.startedAt)) / DAY_MS : 0
  const taper = obsession && points > 0 ? clamp(1 - ageDays / OBSESSION_FEED_DAYS, 0, 1) : 1
  const weight = round3(clamp((old?.weight ?? 0) + points * taper, 0, MAX_WEIGHT))
  const topics = { ...interests.topics }
  if (weight <= 0) {
    delete topics[key]
    return { ...interests, topics }
  }
  let sources = old?.sources ?? []
  if (source && !sources.some((s) => s.id === source.id)) {
    // The first source is the origin and stays; after that only the latest few.
    sources = sources.length < MAX_SOURCES ? [...sources, source] : [sources[0]!, ...sources.slice(2), source]
  }
  const change = round3(weight - (old?.weight ?? 0))
  const history = [...(old?.history ?? []), { at: nowIso, change, ...record }].slice(-MAX_INTEREST_HISTORY)
  topics[key] = { weight, firstSeen: old?.firstSeen ?? nowIso, lastFed: nowIso, sources, history }
  return { ...interests, topics: capTopics(topics) }
}

/** Something it read made a topic more or less interesting (a pet-era reading, a delta from -1 to 1). Pure. */
export function feedInterest(interests: Interests, feeding: Feeding): Interests {
  if (!Number.isFinite(feeding.delta)) return interests
  return move(interests, feeding.topic, clamp(feeding.delta, -1, 1) * FEED_STEP, { event: 'reading', trail: null }, feeding.source, feeding.nowIso)
}

/** A trip fed a topic: +4 for a page that lists it, +10 for a souvenir kept, +6 for a visitor note (spec 3.1). Pure. */
export function feedTopic(interests: Interests, feeding: TopicFeeding): Interests {
  return move(interests, feeding.topic, EVENT_POINTS[feeding.event], { event: feeding.event, trail: feeding.trail }, feeding.source, feeding.nowIso)
}

/** One day passes: every weight falls, an obsessed-over topic faster. What has faded away is forgotten. Pure. */
export function fadeInterests(interests: Interests): Interests {
  const merged = mergeTopics(interests)
  const topics: Interests['topics'] = {}
  for (const [key, topic] of Object.entries(merged.topics)) {
    const weight = round3(topic.weight * (merged.current?.topic === key ? OBSESSION_DAILY_KEEP : DAILY_KEEP))
    if (weight >= FORGET_BELOW) topics[key] = { ...topic, weight }
  }
  return { ...merged, topics }
}

/** Topics that are one topic under different spellings become one: the strongest spelling stays and the weights add up. Pure. */
function mergeTopics(interests: Interests): Interests {
  const groups = new Map<string, string[]>()
  for (const key of Object.keys(interests.topics)) groups.set(foldTopic(key), [...(groups.get(foldTopic(key)) ?? []), key])
  if ([...groups.values()].every((keys) => keys.length === 1)) return interests
  const topics: Interests['topics'] = {}
  const rename = new Map<string, string>()
  for (const keys of groups.values()) {
    const ranked = [...keys].sort((a, b) => interests.topics[b]!.weight - interests.topics[a]!.weight)
    const keep = ranked[0]!
    const all = ranked.map((k) => interests.topics[k]!)
    topics[keep] = {
      weight: round3(Math.min(MAX_WEIGHT, all.reduce((sum, t) => sum + t.weight, 0))),
      firstSeen: all.map((t) => t.firstSeen).sort()[0]!,
      lastFed: all.map((t) => t.lastFed).sort().at(-1)!,
      sources: all.flatMap((t) => t.sources).filter((s, i, list) => list.findIndex((o) => o.id === s.id) === i).slice(0, MAX_SOURCES),
      history: all.flatMap((t) => t.history).sort((a, b) => a.at.localeCompare(b.at)).slice(-MAX_INTEREST_HISTORY),
    }
    for (const k of keys) rename.set(k, keep)
  }
  return {
    ...interests,
    topics,
    current: interests.current ? { ...interests.current, topic: rename.get(interests.current.topic) ?? interests.current.topic } : null,
    past: interests.past.map((p) => ({ ...p, topic: rename.get(p.topic) ?? p.topic })),
  }
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
  const nowMs = Date.parse(nowIso)
  for (const [topic, t] of Object.entries(interests.topics)) {
    // A topic it has only just got over does not start again at once.
    if (interests.past.some((p) => foldTopic(p.topic) === foldTopic(topic) && nowMs - Date.parse(p.endedAt) < RELAPSE_COOLDOWN_DAYS * DAY_MS)) continue
    const origin = t.sources[0]
    if (origin && t.weight >= OBSESSION_START && (!best || t.weight > best.weight)) best = { topic, weight: t.weight, origin }
  }
  if (!best) return interests
  const started: Obsession = { topic: best.topic, startedAt: nowIso, origin: best.origin }
  return { ...interests, current: started }
}
