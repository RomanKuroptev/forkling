import type { Trail } from '@forkling/schema'
import { sameSubject } from '@forkling/sim'

/**
 * What the write step is told about what it read on a trip: the pages it really read, or that it read nothing. A trip to a topic that
 * has no page leaves a trail with only failed pages; before this, the write step never saw trails at all and wrote as if it had read.
 */
export type Reading = { kind: 'read'; pages: { title: string; reaction?: string }[] } | { kind: 'nothing'; looked: string }

const order = (a: Trail, b: Trail): number => a.date.localeCompare(b.date) || Number(a.id.split('-').at(-1)) - Number(b.id.split('-').at(-1))

/** The newest trip that was about the target: it started there, or read a page of that name. Null when no trip was. Pure. */
export function readingFor(trails: readonly Trail[], target: string): Reading | null {
  const about = [...trails].sort(order).filter((t) => sameSubject(t.start.value, target) || t.pages.some((p) => !p.failed && sameSubject(p.title, target)))
  const trail = about.at(-1)
  if (!trail) return null
  const read = trail.pages.filter((p) => !p.failed)
  if (read.length === 0) return { kind: 'nothing', looked: trail.start.value }
  return { kind: 'read', pages: read.slice(0, 5).map((p) => ({ title: p.title, ...(p.reaction ? { reaction: p.reaction } : {}) })) }
}
