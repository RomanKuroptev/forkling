import { MAX_OPEN_WISHES, isOpenRequest, isOpenWish, type Exhibit, type Place, type RequestStatus, type Wish, type WishDraft, type WishStatus } from '@forkling/schema'
import { MAX_PLACES } from './land.ts'
import type { InterestFamily } from './interest-family.ts'

/**
 * Spec 2.5, changed by Roman on 14 November (docs/spec/w6-threshold-proposal.md): an expand needs a topic at weight **30** or more
 * (it was 50) and 3 souvenirs kept on it since the place last changed size.
 */
export const EXPAND_MIN_WEIGHT = 30
export const EXPAND_MIN_SOUVENIRS = 3
const DAY_MS = 86_400_000
const lower = (s: string) => s.toLowerCase()

/**
 * When the place last changed size (spec 2.5), as Unix ms: its newest found or expand line, or the start of its founding day.
 * A tend, a revisit, a rename and an install do not change its size.
 */
export function lastSizeChange(place: Pick<Place, 'founded' | 'history'>): number {
  let newest = -Infinity
  for (const h of place.history) if ((h.verb === 'found' || h.verb === 'expand') && Date.parse(h.at) > newest) newest = Date.parse(h.at)
  return Number.isFinite(newest) ? newest : Date.parse(`${place.founded}T00:00:00Z`)
}

export interface Kept {
  topics: readonly string[]
  source: { fetchedAt: string }
  /** The place whose exhibit holds it, or null while it is in the pile. */
  placedIn?: string | null | undefined
}

export type FoundResult = { ok: boolean; reasons: string[] }
export type ExpandAllowed = { ok: boolean; reasons: string[] }

/** An expand is earned by making when a place shows this many new works or projects since it last changed size (spec v4 2.2). */
export const EARNED_WORKS = 3

/**
 * Whether an expand on a place is allowed (spec v4 2.2, the rails only): it is not closed, not under construction and not the place
 * expanded last. There is no interest gate; the price and the points do the rest. The place's existence and the land limits are checked
 * by the plan and the patch checks.
 */
export function expandAllowed(place: Pick<Place, 'id' | 'state'>, lastExpandedPlace: string | null): ExpandAllowed {
  const reasons: string[] = []
  if (place.state.construction !== null) reasons.push('the place is under construction')
  if (place.state.closed) reasons.push('the place is closed, so it is not offered for expand')
  if (lastExpandedPlace === place.id) reasons.push('it was the last place expanded')
  return { ok: reasons.length === 0, reasons }
}

export interface ExpandEarned {
  earned: boolean
  by: 'made' | 'read' | null
  /** The family that earned it, for a read expand. */
  family: string | null
  /** The refs of the works or projects that earned it, for a made expand. */
  works: string[]
}

/**
 * Whether a place has earned the lower price of an expand (spec v4 2.2). **Made:** it shows at least 3 exhibits of kind work or project
 * added after its last change in size. **Read:** a family with weight 30 or more holds one of its tags or a topic of a souvenir shown in it,
 * and at least 3 souvenirs on topics of that family were kept since. Made is tried first. Gives the heaviest qualifying family, the first by
 * name on a tie.
 */
export function expandEarned(
  place: Pick<Place, 'id' | 'tags' | 'founded' | 'history'>,
  families: readonly InterestFamily[],
  souvenirs: readonly Kept[],
  exhibits: readonly Pick<Exhibit, 'kind' | 'ref' | 'added'>[],
): ExpandEarned {
  const since = lastSizeChange(place)
  const sinceDay = new Date(since).toISOString().slice(0, 10)
  const works = exhibits.filter((e) => (e.kind === 'work' || (e.kind as string) === 'project') && e.added > sinceDay)
  if (works.length >= EARNED_WORKS) return { earned: true, by: 'made', family: null, works: works.map((e) => e.ref ?? '') }

  const kept = souvenirs.filter((s) => Date.parse(s.source.fetchedAt) > since)
  const mine = new Set([...place.tags, ...souvenirs.filter((s) => s.placedIn === place.id).flatMap((s) => s.topics)].map(lower))
  const qualifying = families
    .filter((f) => f.weight >= EXPAND_MIN_WEIGHT && f.members.some((m: string) => mine.has(lower(m))))
    .filter((f) => {
      const names = new Set(f.members.map(lower))
      return kept.filter((s) => s.topics.some((t) => names.has(lower(t)))).length >= EXPAND_MIN_SOUVENIRS
    })
    .sort((a, b) => b.weight - a.weight || lower(a.name).localeCompare(lower(b.name)))
  if (qualifying.length > 0) return { earned: true, by: 'read', family: qualifying[0]!.name, works: [] }
  return { earned: false, by: null, family: null, works: [] }
}

export interface RequestLike {
  kind: 'place' | 'gift'
  status: RequestStatus
}

/** Place requests that are open or being built: they count against the 2 of spec 10.3. */
export const openPlaceRequests = <T extends RequestLike>(requests: readonly T[]): T[] => requests.filter((r) => r.kind === 'place' && isOpenRequest(r))
export const openWishes = <T extends { status: WishStatus }>(wishes: readonly T[]): T[] => wishes.filter(isOpenWish)

/** How many found requests were written in the last 7 days (the rail is 1 a week, spec 2.4). */
export function foundsInWeek(founds: readonly string[], nowMs: number): number {
  return founds.filter((f) => nowMs - Date.parse(f) < 7 * DAY_MS).length
}

/** Spec v4 2.3: a founding is built from the kit as soon as its text is written (it was 7 days, waiting for Roman). */
export const FALLBACK_DAYS = 0

/**
 * Whether the kit build is due for a founding at a moment: an open place request is due as soon as it is written (`FALLBACK_DAYS` is 0).
 * Roman's old status `building` no longer holds it off. An answered, declined, withdrawn or self-built request is never due, and neither is a gift.
 */
export function fallbackDue(request: { kind: 'place' | 'gift'; status: RequestStatus; written: string }, nowMs: number): boolean {
  if (request.kind !== 'place') return false
  return (request.status === 'open' || request.status === 'building') && nowMs >= Date.parse(request.written) + FALLBACK_DAYS * DAY_MS
}

export interface FoundInput {
  places: readonly { tags: readonly string[]; state: { construction: { kind: string } | null } }[]
  requests: readonly RequestLike[]
}

/**
 * Whether a found is allowed (spec v4 2.3, the rails only): no place is under construction from an earlier found, and the world has room
 * for another place (open requests counted). There is no interest gate. The 1 a week rail is `foundsInWeek`, kept with the other plan
 * rails, and the name rules are checked by the plan and the found step.
 */
export function foundCheck(i: FoundInput): FoundResult {
  const reasons: string[] = []
  if (i.places.some((p) => p.state.construction?.kind === 'found')) reasons.push('a place you founded is still being built')
  const open = openPlaceRequests(i.requests).length
  if (i.places.length + open >= MAX_PLACES) reasons.push(`the world is full (${MAX_PLACES} places, open foundings included)`)
  return { ok: reasons.length === 0, reasons }
}

/** A wish's id: its name as a slug, up to 40 characters. */
export function wishId(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
  return slug || 'wish'
}

/**
 * What a call's wishes do to `wishes/` (spec 5.3, 10.3): wishing a part that is already open (or being built) adds to its count; a
 * new part is a new wish, unless 5 are open, when it is dropped (the name comes back in `dropped`). A closed wish with the same name
 * does not take the new one: the new wish gets the next free id. Returns only the wishes to write, and changes nothing it was given.
 */
export function addWishes(existing: readonly Wish[], drafts: readonly WishDraft[], nowIso: string): { wishes: Wish[]; dropped: string[] } {
  const all = new Map(existing.map((w) => [w.id, w]))
  const touched = new Set<string>()
  const dropped: string[] = []
  for (const d of drafts) {
    const id = wishId(d.name)
    const open = all.get(id)
    if (open && isOpenWish(open)) {
      all.set(id, { ...open, count: Math.min(open.count + 1, 999) })
      touched.add(id)
      continue
    }
    if ([...all.values()].filter(isOpenWish).length >= MAX_OPEN_WISHES) {
      dropped.push(d.name)
      continue
    }
    let fresh = id
    for (let n = 2; all.has(fresh); n++) fresh = `${id.slice(0, 36)}-${n}`
    all.set(fresh, { id: fresh, name: d.name, description: d.description, forPlace: d.forPlace, count: 1, written: nowIso, status: 'open', statusAt: null, note: null })
    touched.add(fresh)
  }
  return { wishes: [...touched].map((id) => all.get(id)!), dropped }
}
