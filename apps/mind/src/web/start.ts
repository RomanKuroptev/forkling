import { isReadable } from './allowlist.ts'
import { wikipediaTopicLink } from './item.ts'
import { resolveTopic, type SeenPage } from './lookup.ts'
import type { KnownSouvenir } from './trip.ts'

export type Start =
  | { ok: true; kind: 'topic'; value: string; url: string; /** `seen`: a page Merge was shown that has this title. `guess`: the topic's own Wikipedia page, which may not exist. */ found: 'seen' | 'guess' }
  | { ok: true; kind: 'feed' | 'souvenir'; value: string; url: string }
  | { ok: false; reason: string }

/**
 * Where a wander step starts (spec 2.4): the source of an earlier souvenir, a link from the day's starting points, or a topic.
 * A topic is matched with the titles of pages Merge has really seen (robots.txt does not allow Wikipedia's search or random
 * pages, so there is no search); if none matches, the topic's own `/wiki/` page is tried, and it may not exist, in which case the
 * trip reads nothing and says so. An address that is not on the allowlist is refused here, before anything is fetched.
 */
export function resolveStart(target: string, souvenirs: readonly KnownSouvenir[], seen: readonly SeenPage[] = []): Start {
  const value = target.trim()
  if (!value) return { ok: false, reason: 'the step has no place to start from' }
  const souvenir = souvenirs.find((s) => s.id === value || `souvenirs/${s.id}` === value)
  if (souvenir) return { ok: true, kind: 'souvenir', value: souvenir.id, url: souvenir.url }
  if (/^https?:\/\//i.test(value)) return isReadable(value) ? { ok: true, kind: 'feed', value, url: value } : { ok: false, reason: `${value} is not on the allowlist` }
  const page = resolveTopic(value, seen)
  if (page && isReadable(page.url)) return { ok: true, kind: 'topic', value, url: page.url, found: 'seen' }
  return { ok: true, kind: 'topic', value, url: wikipediaTopicLink(value).url, found: 'guess' }
}
