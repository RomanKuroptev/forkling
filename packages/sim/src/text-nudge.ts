import { foldTopic } from './interests.ts'
import { maxSimilarity, words, wornPhrases } from './novelty.ts'

/** A written text: a plaque, essay, letter or reply (spec 12.3). Only `at` and `text` matter. */
export interface TextLike {
  id: string
  at: string
  text: string
}

export interface TextNudge {
  id: string
  why: string
}

/** Spec 12.3: a text over 0.35 like one of the last 30 of its kind, or holding more than 1 worn phrase. */
export const WRITING_LOOKBACK = 30
export const WRITING_SIMILARITY = 0.35
/** Spec 12.3: a diary entry with the same first 5 words as one of the last 14, or over 0.3 like one. */
export const DIARY_LOOKBACK = 14
export const DIARY_PREFIX_WORDS = 5
export const DIARY_SIMILARITY = 0.3

const byTime = <T extends { at: string }>(list: readonly T[]) => [...list].sort((a, b) => a.at.localeCompare(b.at))

/**
 * The repeated-writing nudge (spec 12.3), measured and never enforced. Only texts written since `sinceMs` are reported, but each is
 * compared with the 30 before it. Nothing here rejects a text.
 */
export function writingNudges(texts: readonly TextLike[], opts: { sinceMs: number }): TextNudge[] {
  const list = byTime(texts)
  const out: TextNudge[] = []
  list.forEach((t, i) => {
    if (Date.parse(t.at) < opts.sinceMs) return
    const earlier = list.slice(Math.max(0, i - WRITING_LOOKBACK), i).map((e) => e.text)
    if (earlier.length === 0) return
    if (maxSimilarity(t.text, earlier) > WRITING_SIMILARITY) return void out.push({ id: t.id, why: 'it is like an earlier text' })
    const mine = ` ${words(t.text).join(' ')} `
    const worn = wornPhrases(earlier).filter((p) => mine.includes(` ${p.phrase} `))
    if (worn.length > 1) out.push({ id: t.id, why: `it holds ${worn.length} worn phrases` })
  })
  return out
}

export interface DiaryLike {
  date: string
  text: string
}

/** The repeated-diary nudge (spec 12.3): the same first 5 words as one of the last 14 entries, or over 0.3 like one. The id of a nudge is the entry's date. */
export function diaryNudges(entries: readonly DiaryLike[], opts: { sinceMs: number }): TextNudge[] {
  const list = [...entries].sort((a, b) => a.date.localeCompare(b.date))
  const start = (text: string) => words(text).slice(0, DIARY_PREFIX_WORDS).join(' ')
  const out: TextNudge[] = []
  list.forEach((e, i) => {
    if (Date.parse(`${e.date}T00:00:00Z`) < opts.sinceMs) return
    const earlier = list.slice(Math.max(0, i - DIARY_LOOKBACK), i)
    if (earlier.length === 0) return
    const first = start(e.text)
    if (words(e.text).length >= DIARY_PREFIX_WORDS && earlier.some((o) => start(o.text) === first)) return void out.push({ id: e.date, why: 'it starts like an earlier entry' })
    if (maxSimilarity(e.text, earlier.map((o) => o.text)) > DIARY_SIMILARITY) out.push({ id: e.date, why: 'it is like an earlier entry' })
  })
  return out
}

export interface TextNovelty {
  /** Texts written since the window opened (writings and diary entries). */
  texts: number
  /** The average, over those texts, of each one's highest similarity with the texts of its kind before it. */
  meanMaxSimilarity: number
  repeatedWriting: number
  repeatedDiary: number
}

/** The text numbers of the week in `mind/health.json` (spec 12.6). */
export function textNovelty(input: { writings: readonly TextLike[]; diaries: readonly DiaryLike[]; sinceMs: number }): TextNovelty {
  const scores: number[] = []
  const score = (own: string, earlier: string[]) => scores.push(earlier.length === 0 ? 0 : maxSimilarity(own, earlier))
  const writings = byTime(input.writings)
  writings.forEach((t, i) => {
    if (Date.parse(t.at) >= input.sinceMs) score(t.text, writings.slice(Math.max(0, i - WRITING_LOOKBACK), i).map((e) => e.text))
  })
  const diaries = [...input.diaries].sort((a, b) => a.date.localeCompare(b.date))
  diaries.forEach((d, i) => {
    if (Date.parse(`${d.date}T00:00:00Z`) >= input.sinceMs) score(d.text, diaries.slice(Math.max(0, i - DIARY_LOOKBACK), i).map((e) => e.text))
  })
  return {
    texts: scores.length,
    meanMaxSimilarity: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
    repeatedWriting: new Set(writingNudges(input.writings, { sinceMs: input.sinceMs }).map((n) => n.id)).size,
    repeatedDiary: new Set(diaryNudges(input.diaries, { sinceMs: input.sinceMs }).map((n) => n.id)).size,
  }
}

export interface DoorDay {
  date: string
  trips: number
  /** Trips that started through a stranger's door: one of the morning's three doors, or a topic outside the top 5 interests. */
  strangers: number
}

/** The door numbers of the week (spec 12.3, 12.6): the share of trips through a stranger's door, and the finished days that had trips and none. */
export function doorStats(days: readonly DoorDay[], today: string): { trips: number; strangers: number; share: number; noDoorDays: number } {
  const trips = days.reduce((n, d) => n + d.trips, 0)
  const strangers = days.reduce((n, d) => n + d.strangers, 0)
  return { trips, strangers, share: trips ? strangers / trips : 0, noDoorDays: days.filter((d) => d.date < today && d.trips > 0 && d.strangers === 0).length }
}

export interface DrawWork {
  made: string
  status: string
  constraint: { refused: boolean } | null
  collision: readonly string[] | null
}

/** Collisions used and constraints offered and refused by the week's works (spec 12.6). A scrapped work does not count. */
export function drawStats(works: readonly DrawWork[], opts: { sinceMs: number }): { collisionsUsed: number; constraintsOffered: number; constraintsRefused: number } {
  const recent = works.filter((w) => w.status !== 'scrap' && Date.parse(w.made) >= opts.sinceMs)
  return {
    collisionsUsed: recent.filter((w) => w.collision !== null).length,
    constraintsOffered: recent.filter((w) => w.constraint !== null).length,
    constraintsRefused: recent.filter((w) => w.constraint?.refused).length,
  }
}

export interface BoredomInput {
  repeatedWork: number
  repeatedPlace: number
  stuck: number
  repeatedWriting: number
  repeatedDiary: number
}

/** How many times the nudges would have fired today (spec 12.4 item 8). The weekly ones (one host, weekend revisit, no stranger's door) are not a day's. */
export const boredomCount = (i: BoredomInput): number => i.repeatedWork + i.repeatedPlace + i.stuck + i.repeatedWriting + i.repeatedDiary
export const BOREDOM_FROM = 3

/**
 * Whether a trip started through a stranger's door (spec 12.3, 12.4 item 3): one of the morning's three doors, or a topic that is not
 * among the top 5 interests. Going back to an earlier souvenir, or following a front-page link that is not a door, is not.
 */
export function isStrangerStart(start: { kind: 'topic' | 'feed' | 'souvenir'; value: string; url: string }, doorUrls: readonly string[], topInterests: readonly string[]): boolean {
  if (start.kind === 'souvenir') return false
  if (start.kind === 'feed') return doorUrls.includes(start.url)
  const fold = (s: string) => foldTopic(s)
  return !topInterests.some((t) => fold(t) === fold(start.value))
}
