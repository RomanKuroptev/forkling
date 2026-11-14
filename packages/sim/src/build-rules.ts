import { MAX_OPEN_PLACE_REQUESTS, MAX_OPEN_WISHES, isOpenRequest, isOpenWish, type Place, type RequestStatus, type WakeSnapshot, type Wish, type WishDraft, type WishStatus } from '@forkling/schema'
import { MAX_PLACES } from './land.ts'
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

export type ExpandResult = { ok: boolean; tag: string | null; reasons: string[] }
export type FoundResult = { ok: boolean; interest: string | null; reasons: string[] }

/**
 * Whether an expand on a place is allowed (spec 2.5, with Roman's changes of 14 November): one of the place's tags, **or a topic of
 * a souvenir shown in it**, has weight 30 or more (it was 50) and at least 3 souvenirs on that topic were kept since the place last
 * changed size, and the land is free of construction. A place's own tags are fixed when it is founded and Home's and the Workshop's
 * are never fed by reading, so what a place holds is what lets it grow. `weights` are the interest weights now. Gives the topic that
 * qualifies (the heaviest, the first by name on a tie) or every reason it does not, in plain words. (Closed places, spec 9.9, are not
 * offered for expand either; nothing closes a place yet.)
 */
export function expandCheck(place: Pick<Place, 'id' | 'tags' | 'founded' | 'history' | 'state'>, weights: Readonly<Record<string, number>>, souvenirs: readonly Kept[]): ExpandResult {
  const reasons: string[] = []
  if (place.state.construction !== null) reasons.push('the place is under construction')

  const weightOf = new Map(Object.entries(weights).map(([k, v]) => [lower(k), v]))
  const since = lastSizeChange(place)
  const kept = souvenirs.filter((s) => Date.parse(s.source.fetchedAt) > since)
  // The place's tags and the topics of what it shows, each topic once however it is spelled.
  const candidates = [...place.tags, ...souvenirs.filter((s) => s.placedIn === place.id).flatMap((s) => s.topics)].filter((t, i, all) => all.findIndex((o) => lower(o) === lower(t)) === i)
  const rows = candidates.map((tag) => ({
    tag,
    weight: weightOf.get(lower(tag)) ?? 0,
    souvenirs: kept.filter((s) => s.topics.some((t) => lower(t) === lower(tag))).length,
  }))
  const qualifying = rows.filter((r) => r.weight >= EXPAND_MIN_WEIGHT && r.souvenirs >= EXPAND_MIN_SOUVENIRS).sort((a, b) => b.weight - a.weight || lower(a.tag).localeCompare(lower(b.tag)))
  if (qualifying.length === 0) {
    const heavy = rows.filter((r) => r.weight >= EXPAND_MIN_WEIGHT)
    if (heavy.length === 0) reasons.push(`none of its tags or the topics of what it shows (${candidates.slice(0, 6).join(', ')}) has weight ${EXPAND_MIN_WEIGHT} or more`)
    else reasons.push(`a topic at weight ${EXPAND_MIN_WEIGHT} or more needs ${EXPAND_MIN_SOUVENIRS} souvenirs kept on it since the place last changed size (${heavy.map((r) => `${r.tag}: ${r.souvenirs}`).join(', ')})`)
  }
  if (reasons.length > 0) return { ok: false, tag: null, reasons }
  return { ok: true, tag: qualifying[0]!.tag, reasons: [] }
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
