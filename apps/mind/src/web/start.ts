import { isReadable } from './allowlist.ts'
import { resolveTopic, type SeenPage } from './lookup.ts'
import type { KnownSouvenir } from './trip.ts'

export type Start =
  | { ok: true; kind: 'topic' | 'feed' | 'souvenir'; value: string; url: string }
  /** `unseen`: the target is a title or an address Merge has never been shown, so there is nothing real to start from. */
  | { ok: false; reason: string; unseen?: true }

const lastSegment = (url: string): string => {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).at(-1) ?? '').replace(/_/g, ' ')
  } catch {
    return ''
  }
}

/**
 * Where a wander step starts (spec 2.4): the source of an earlier souvenir, a page Merge has seen (a link from the day's starting
 * points or from a page it read), or a topic matched with the titles of those pages. Nothing is ever guessed into an address: robots.txt
 * does not allow Wikipedia's search, and a made-up `/wiki/<Title>` is most often a 404 (issues #318 and #317). A title or an address it
 * has not seen starts nothing, and the step says so (`unseen`). An address that is not on the allowlist is refused before anything is
 * fetched. `known` says whether an address was read on an earlier trip, which counts as seen.
 */
export function resolveStart(target: string, souvenirs: readonly KnownSouvenir[], seen: readonly SeenPage[] = [], known: (url: string) => boolean = () => false): Start {
  const value = target.trim()
  if (!value) return { ok: false, reason: 'the step has no place to start from' }
  const souvenir = souvenirs.find((s) => s.id === value || `souvenirs/${s.id}` === value)
  if (souvenir) return { ok: true, kind: 'souvenir', value: souvenir.id, url: souvenir.url }
  if (/^https?:\/\//i.test(value)) {
    if (!isReadable(value)) return { ok: false, reason: `${value} is not on the allowlist` }
    if (seen.some((p) => p.url === value) || souvenirs.some((s) => s.url === value) || known(value)) return { ok: true, kind: 'feed', value, url: value }
    // An address it was never shown: the page of that title it has seen, if any, and never the address as written.
    const page = resolveTopic(lastSegment(value), seen)
    if (page && isReadable(page.url)) return { ok: true, kind: 'feed', value, url: page.url }
    return { ok: false, unseen: true, reason: `I have not seen a page at ${value}` }
  }
  const page = resolveTopic(value, seen)
  if (page && isReadable(page.url)) return { ok: true, kind: 'topic', value, url: page.url }
  return { ok: false, unseen: true, reason: `I have not seen a page called ${value}` }
}
