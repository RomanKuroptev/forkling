import type { Interests } from '@forkling/schema'
import { foldTopic } from '@forkling/sim'

/** A page a morning may start from. A door is one outside what Merge is into (spec 12.4, "stranger's doors"). */
export interface StartingPoint {
  title: string
  url: string
  door: boolean
}

/** How many doors a morning is offered. */
export const DOORS = 3

/** Whether a title is about something Merge already cares about: an interest's words, or a title word that is an interest. */
function nearInterests(title: string, interests: Interests): boolean {
  const t = foldTopic(title)
  const words = new Set(t.split(' '))
  return Object.keys(interests.topics).some((topic) => {
    const k = foldTopic(topic)
    return k === t || t.includes(k) || k.split(' ').every((w) => words.has(w))
  })
}

/**
 * The links of the front pages as starting points, with 3 of them marked as doors: ones that match no interest, picked by
 * the seeded random draw so the same seed gives the same doors. With 3 or fewer links all of them are doors.
 */
export function pickDoors(links: readonly { title: string; url: string }[], interests: Interests, rng: { next(): number }, n = DOORS): StartingPoint[] {
  if (links.length <= n) return links.map((l) => ({ title: l.title, url: l.url, door: true }))
  const outside = links.map((l, i) => ({ l, i })).filter(({ l }) => !nearInterests(l.title, interests))
  for (let i = outside.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1))
    ;[outside[i], outside[j]] = [outside[j]!, outside[i]!]
  }
  const doors = new Set(outside.slice(0, n).map((x) => x.i))
  return links.map((l, i) => ({ title: l.title, url: l.url, door: doors.has(i) }))
}
