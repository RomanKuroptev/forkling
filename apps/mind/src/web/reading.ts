import type { Trail } from '@forkling/schema'
import { sameSubject } from '@forkling/sim'

/**
 * What the write step is told about what it read on a trip: the pages it really read, or that it read nothing. A trip to a topic that
 * has no page leaves a trail with only failed pages; before this, the write step never saw trails at all and wrote as if it had read.
 */
/** How a trail marks a page skipped by the 30-day rule (`web/skip.ts`, `web/trip.ts`). */
export const READ_LATELY_SKIP = 'skipped: read in the last 30 days'

/** A trip that read nothing because the page it started from was read in the last 30 days. Pure. */
export const startedReadLately = (t: Pick<Trail, 'pages'>): boolean => t.pages[0]?.failed === READ_LATELY_SKIP && t.pages.every((p) => p.failed)

export type Reading = { kind: 'read'; pages: { title: string; reaction?: string }[] } | { kind: 'nothing'; looked: string }

const order = (a: Trail, b: Trail): number => a.date.localeCompare(b.date) || Number(a.id.split('-').at(-1)) - Number(b.id.split('-').at(-1))

/** The newest trip that was about the target: it started there, or read a page of that name. Null when no trip was. Pure. */
export function readingFor(trails: readonly Trail[], target: string): Reading | null {
  const about = [...trails].sort(order).filter((t) => sameSubject(t.start.value, target) || t.pages.some((p) => !p.failed && sameSubject(p.title, target)))
  // A trip that only met pages it read lately (the 30-day rule) read nothing new: what it knows is the earlier trip that read them.
  const lately = startedReadLately
  const trail = [...about].reverse().find((t) => !lately(t)) ?? about.at(-1)
  if (!trail) return null
  const read = trail.pages.filter((p) => !p.failed)
  if (read.length === 0) return { kind: 'nothing', looked: trail.start.value }
  return { kind: 'read', pages: read.slice(0, 5).map((p) => ({ title: p.title, ...(p.reaction ? { reaction: p.reaction } : {}) })) }
}
