/**
 * Measures the audit harness scores a run with (docs/spec/audit/spec.md 9.2). They are alarms for us, never rules for Merge:
 * nothing in the mind calls them. Numbers in, numbers out: no clock, no files. Topics reuse `topicClusters` and similarity reuses
 * `maxSimilarity`, so there is one meaning of "the same topic" and "the same line" in the engine.
 */
import { maxSimilarity } from './novelty.ts'
import { contentWords, topicClusters, type WrittenPage } from './topic-cluster.ts'

/** Something made or read: a title and its text, at a time. `date` is its local date; without it the UTC date of `at` is used. */
export interface TopicItem extends WrittenPage {
  date?: string
}

const dateOf = (i: TopicItem): string => i.date ?? i.at.slice(0, 10)

/** Clusters of all items and how big the biggest is. */
export function topicVariety(items: readonly TopicItem[]): { clusters: number; topShare: number; topTitles: string[] } {
  if (items.length === 0) return { clusters: 0, topShare: 0, topTitles: [] }
  const ids = topicClusters(items)
  const counts = new Map<number, number>()
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
  let top = ids[0]!
  for (const [id, n] of counts) if (n > counts.get(top)!) top = id
  return { clusters: counts.size, topShare: counts.get(top)! / items.length, topTitles: items.filter((_, i) => ids[i] === top).map((i) => i.title) }
}

export interface DayTopic {
  date: string
  /** The cluster with the most items that day (the first one seen on a tie). */
  cluster: number
  titles: string[]
}

/** The top cluster of each date that has items, in date order. Clusters are made over all items, so ids compare across days. */
export function dailyTopics(items: readonly TopicItem[]): DayTopic[] {
  const ids = topicClusters(items)
  const byDate = new Map<string, number[]>()
  items.forEach((it, i) => byDate.set(dateOf(it), [...(byDate.get(dateOf(it)) ?? []), i]))
  return [...byDate.keys()].sort().map((date) => {
    const idx = byDate.get(date)!
    const counts = new Map<number, number>()
    for (const i of idx) counts.set(ids[i]!, (counts.get(ids[i]!) ?? 0) + 1)
    let top = ids[idx[0]!]!
    for (const [id, n] of counts) if (n > counts.get(top)!) top = id
    return { date, cluster: top, titles: idx.filter((i) => ids[i] === top).map((i) => items[i]!.title) }
  })
}

const DAY_MS = 86_400_000
const nextDay = (a: string, b: string): boolean => Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`) === DAY_MS

/** The longest run of following days whose top cluster is the same. A day with nothing in it breaks a run. */
export function topicRuns(items: readonly TopicItem[]): { longest: number; from: string | null; to: string | null; titles: string[] } {
  const days = dailyTopics(items)
  let best = { longest: 0, from: null as string | null, to: null as string | null, titles: [] as string[] }
  let start = 0
  for (let i = 0; i < days.length; i++) {
    if (i > 0 && !(days[i]!.cluster === days[i - 1]!.cluster && nextDay(days[i - 1]!.date, days[i]!.date))) start = i
    const len = i - start + 1
    if (len > best.longest) best = { longest: len, from: days[start]!.date, to: days[i]!.date, titles: days.slice(start, i + 1).flatMap((d) => d.titles) }
  }
  return best
}

/** The content word that is in the most titles (counted once per title), and the share of titles it is in. Null when no title has one. */
export function topWord(titles: readonly string[]): { word: string; count: number; share: number } | null {
  const counts = new Map<string, number>()
  for (const t of titles) for (const w of new Set(contentWords(t))) counts.set(w, (counts.get(w) ?? 0) + 1)
  let best: [string, number] | null = null
  for (const [w, n] of counts) if (!best || n > best[1] || (n === best[1] && w < best[0])) best = [w, n]
  return best ? { word: best[0], count: best[1], share: best[1] / titles.length } : null
}

/** The repetition score's levels (spec 9.2): a line over 0.6 similar to one of the 5 before it is a repeat. */
export const REPEAT_WINDOW = 5
export const REPEAT_SIMILARITY = 0.6

/** Lines (thoughts, diary lines) that repeat one of the lines just before them. */
export function repetitionShare(lines: readonly string[], opts: { window?: number; threshold?: number } = {}): { repeated: number; total: number; share: number; examples: string[] } {
  const window = opts.window ?? REPEAT_WINDOW
  const threshold = opts.threshold ?? REPEAT_SIMILARITY
  const examples: string[] = []
  let repeated = 0
  lines.forEach((line, i) => {
    if (maxSimilarity(line, lines.slice(Math.max(0, i - window), i)) > threshold) {
      repeated++
      if (examples.length < 3) examples.push(line)
    }
  })
  return { repeated, total: lines.length, share: lines.length ? repeated / lines.length : 0, examples }
}

/** Rest steps as a share of waking steps, per day. A day with no waking steps is 0. */
export function restByDay(days: readonly { date: string; rest: number; waking: number }[]): { date: string; share: number }[] {
  return days.map((d) => ({ date: d.date, share: d.waking > 0 ? d.rest / d.waking : 0 }))
}

/** The longest run of values that each rose over the one before (3 means it rose 3 days in a row). */
export function risingRun(values: readonly number[]): number {
  let best = 0
  let run = 0
  for (let i = 1; i < values.length; i++) {
    run = values[i]! > values[i - 1]! ? run + 1 : 0
    best = Math.max(best, run)
  }
  return best
}

/** For each look (a visitor at 10:00 and 18:00), whether something was made after the look before it (or after `fromMs` for the first). */
export function somethingNew(a: { fromMs: number; looksMs: readonly number[]; madeMs: readonly number[] }): { atMs: number; isNew: boolean }[] {
  let prev = a.fromMs
  return a.looksMs.map((at) => {
    const since = prev
    prev = at
    return { atMs: at, isNew: a.madeMs.some((m) => m > since && m <= at) }
  })
}

/** How many kinds of things were made, and the share of the commonest. */
export function kindShares(kinds: readonly string[]): { kinds: number; total: number; top: { kind: string; share: number } | null; counts: Record<string, number> } {
  const counts: Record<string, number> = {}
  for (const k of kinds) counts[k] = (counts[k] ?? 0) + 1
  let top: string | null = null
  for (const k of Object.keys(counts)) if (top === null || counts[k]! > counts[top]!) top = k
  return { kinds: Object.keys(counts).length, total: kinds.length, top: top === null ? null : { kind: top, share: counts[top]! / kinds.length }, counts }
}
