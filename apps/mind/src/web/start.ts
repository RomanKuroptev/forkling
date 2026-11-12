import { isReadable } from './allowlist.ts'
import { wikipediaTopicLink } from './item.ts'
import type { KnownSouvenir } from './trip.ts'

export type Start = { ok: true; kind: 'topic' | 'feed' | 'souvenir'; value: string; url: string } | { ok: false; reason: string }

/**
 * Where a wander step starts (spec 2.4): a topic (straight to the Wikipedia page of that name: robots.txt does not allow
 * the search or random pages), a link from the day's starting points, or the source of an earlier souvenir. An address that is
 * not on the allowlist is refused here, before anything is fetched.
 */
export function resolveStart(target: string, souvenirs: readonly KnownSouvenir[]): Start {
  const value = target.trim()
  if (!value) return { ok: false, reason: 'the step has no place to start from' }
  const souvenir = souvenirs.find((s) => s.id === value || `souvenirs/${s.id}` === value)
  if (souvenir) return { ok: true, kind: 'souvenir', value: souvenir.id, url: souvenir.url }
  if (/^https?:\/\//i.test(value)) return isReadable(value) ? { ok: true, kind: 'feed', value, url: value } : { ok: false, reason: `${value} is not on the allowlist` }
  return { ok: true, kind: 'topic', value, url: wikipediaTopicLink(value).url }
}
