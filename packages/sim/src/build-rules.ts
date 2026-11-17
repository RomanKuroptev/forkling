import { MAX_OPEN_PLACE_REQUESTS, MAX_OPEN_WISHES, isOpenRequest, isOpenWish, type Exhibit, type Place, type RequestStatus, type WakeSnapshot, type Wish, type WishDraft, type WishStatus } from '@forkling/schema'
import { MAX_PLACES } from './land.ts'
import type { InterestFamily } from './interest-family.ts'
import { addDays } from './sleep.ts'

export type { WakeSnapshot }

/**
 * Spec 2.5, changed by Roman on 14 November (docs/spec/w6-threshold-proposal.md): an expand needs a topic at weight **30** or more
 * (it was 50) and 3 souvenirs kept on it since the place last changed size.
 */
export const EXPAND_MIN_WEIGHT = 30
export const EXPAND_MIN_SOUVENIRS = 3
/** Spec 2.5, changed the same day: a found needs an interest at **40** or more (it was 70) at wake on 3 days in a row. */
export const WAKE_TOP_MIN = 40
export const FOUND_STREAK_DAYS = 3

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

export type FoundResult = { ok: boolean; interest: string | null; reasons: string[] }
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

/** Notes the interests at 40 or more on a wake day, keeping the last 3 days (the same day replaces itself). */
export function recordWake(wakeTop: readonly WakeSnapshot[], date: string, weights: Readonly<Record<string, number>>): WakeSnapshot[] {
  const topics = Object.fromEntries(Object.entries(weights).filter(([, w]) => w >= WAKE_TOP_MIN))
  return [...wakeTop.filter((s) => s.date !== date), { date, topics }].sort((a, b) => a.date.localeCompare(b.date)).slice(-FOUND_STREAK_DAYS)
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

/** Spec 10.3: a place request nobody has answered 7 days after it was written is built by the build worker as a plain kit place. */
export const FALLBACK_DAYS = 7
/** Spec 10.3: Roman's status `building` holds the fallback off for 14 more days. */
export const BUILDING_HOLD_DAYS = 14

/**
 * Whether the fallback build is due for a request at a moment: an open place request is due 7 days after it was written, one Roman has
 * marked `building` 14 days after that. An answered, declined, withdrawn or self-built request is never due, and neither is a gift.
 */
export function fallbackDue(request: { kind: 'place' | 'gift'; status: RequestStatus; written: string }, nowMs: number): boolean {
  if (request.kind !== 'place') return false
  const days = request.status === 'open' ? FALLBACK_DAYS : request.status === 'building' ? FALLBACK_DAYS + BUILDING_HOLD_DAYS : null
  return days !== null && nowMs >= Date.parse(request.written) + days * DAY_MS
}

export interface FoundInput {
  /** The local date of this wake. */
  today: string
  wakeTop: readonly WakeSnapshot[]
  places: readonly { tags: readonly string[] }[]
  requests: readonly (RequestLike & { tags: readonly string[] })[]
}

/**
 * Whether a found is allowed (spec 2.5, 10.3): an interest at 40 or more at wake on 3 days in a row that no place carries as a
 * tag (and no open request already asks for), fewer than 2 place requests open, and room in the world for another place.
 * Gives the interest (the heaviest today, the first by name on a tie) or every reason it is not. The 1 a week rail is
 * `foundsInWeek`, kept with the other plan rails.
 */
export function foundCheck(i: FoundInput): FoundResult {
  const reasons: string[] = []
  const open = openPlaceRequests(i.requests)
  if (open.length >= MAX_OPEN_PLACE_REQUESTS) reasons.push(`${open.length} place requests are already open (the most is ${MAX_OPEN_PLACE_REQUESTS})`)
  if (i.places.length + open.length >= MAX_PLACES) reasons.push(`the world is full (${MAX_PLACES} places, open requests included)`)

  const days = Array.from({ length: FOUND_STREAK_DAYS }, (_, n) => addDays(i.today, -n))
  const snapshots = days.map((d) => i.wakeTop.find((s) => s.date === d))
  const streak = snapshots.every((s) => s !== undefined) ? Object.entries(snapshots[0]!.topics).filter(([name]) => snapshots.every((s) => lower(name) in lowerKeys(s!.topics))) : []
  const taken = new Set([...i.places.flatMap((p) => p.tags), ...open.flatMap((r) => r.tags)].map(lower))
  const free = streak.filter(([name]) => !taken.has(lower(name))).sort((a, b) => b[1] - a[1] || lower(a[0]).localeCompare(lower(b[0])))
  if (free.length === 0) {
    reasons.push(
      streak.length === 0
        ? `no interest has weight ${WAKE_TOP_MIN} or more on ${FOUND_STREAK_DAYS} days in a row`
        : 'every interest that has earned a place already has one, or an open request for one',
    )
  }
  if (reasons.length > 0) return { ok: false, interest: null, reasons }
  return { ok: true, interest: free[0]![0], reasons: [] }
}

const lowerKeys = (topics: Readonly<Record<string, number>>) => Object.fromEntries(Object.keys(topics).map((k) => [lower(k), true]))

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
