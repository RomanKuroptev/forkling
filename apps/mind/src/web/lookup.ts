import { contentWords, foldTopic } from '@forkling/sim'

/** A page Merge has really seen: a link shown to it on a trip or on a front page. */
export interface SeenPage {
  title: string
  url: string
}

/** The pages kept as seen: the newest 100. */
export const MAX_SEEN = 100

const lastSegment = (url: string): string => {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).at(-1) ?? '').replace(/_/g, ' ')
  } catch {
    return ''
  }
}

/**
 * The page a topic means, found among the pages Merge has seen, or null. There is no search: Wikipedia's robots.txt allows none, so
 * a topic Merge types is matched against real titles, never invented into an address. A title matches when it is the topic in another
 * spelling, or when it holds every content word of the topic; the shortest title wins, and the newest page among equals.
 */
export function resolveTopic(topic: string, seen: readonly SeenPage[]): SeenPage | null {
  const wanted = foldTopic(topic)
  const words = new Set(contentWords(topic))
  if (!wanted || words.size === 0) return null
  const newestFirst = [...seen].reverse()
  const exact = newestFirst.find((p) => foldTopic(p.title) === wanted || foldTopic(lastSegment(p.url)) === wanted)
  if (exact) return exact
  let best: { page: SeenPage; size: number } | null = null
  for (const page of newestFirst) {
    const have = new Set(contentWords(page.title))
    if (![...words].every((w) => have.has(w))) continue
    if (!best || have.size < best.size) best = { page, size: have.size }
  }
  return best?.page ?? null
}

/** Adds pages to the ring of pages seen: the newest last, once per address (the latest title wins), at most `max`. Pure. */
export function rememberSeen(ring: readonly SeenPage[], add: readonly SeenPage[], max = MAX_SEEN): SeenPage[] {
  let out = [...ring]
  for (const page of add) out = [...out.filter((p) => p.url !== page.url), page]
  return out.slice(-max)
}

/** How many real titles the planner is shown. */
export const SHOWN_SEEN = 12

/** The newest pages seen that are not among `not` (the starting points, already listed) and were not read lately: what the planner may go to. Pure. */
export function unreadSeen(seen: readonly SeenPage[], o: { not: readonly string[]; readRecently(url: string): boolean }, limit = SHOWN_SEEN): SeenPage[] {
  const skip = new Set(o.not)
  return [...seen].reverse().filter((p) => !skip.has(p.url) && !o.readRecently(p.url)).slice(0, limit)
}
