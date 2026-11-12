import { MAX_TRIP_READS, Souvenir, type Trail, type TrailPage } from '@forkling/schema'
import { similarity } from '@forkling/sim'
import { WebError } from './fetch.ts'
import type { Item } from './item.ts'
import { chosenLink, clampInterest, clampReaction, cleanTopics } from './read.ts'
import type { LookOutcome } from './look.ts'
import type { Kept } from './read.ts'
import type { ReadOutcome } from './readcall.ts'

/** The most reads a day (spec 9.8). A skipped item does not count. */
export const MAX_READS_PER_DAY = 40
export const MAX_SOUVENIRS_PER_TRIP = 3
/** A souvenir this alike to an earlier one, by word 3-grams, is a copy (spec 12.2). */
export const SOUVENIR_SIMILARITY = 0.5
/** A page whose read call scored 3 or less is boring to Merge (spec 6.6). */
const BORING = 3
/** Items skipped before a read, past which a trip gives up looking for one it can read. */
const MAX_SKIPS = 2

export interface KnownSouvenir {
  id: string
  url: string
  content: string
}

export interface TripDeps {
  /** A link to an item, through the adapters. Throws a `WebError` when it cannot be read. */
  open(url: string): Promise<Item>
  /** One read call for one item, with the code's judgement of its souvenir. */
  read(item: Item): Promise<ReadOutcome>
  now(): string
  known: { souvenirs: readonly KnownSouvenir[]; readRecently(url: string): boolean }
  /** Reads the day still allows. */
  readsLeft: number
  /** Called after each model call and before the next, so the caller books its cost in time. */
  onRead?(item: Item, outcome: ReadOutcome): void
  /** A look at one of an item's pictures (spec 7.8), given what the read call made of the page. */
  look?(item: Item, picture: number, reaction: string): Promise<LookOutcome>
  /** Looks the day still allows. Missing means none. */
  looksLeft?: number
  onLook?(item: Item, outcome: LookOutcome): void
}

export interface TripInput {
  id: string
  date: string
  purpose: string
  startKind: 'topic' | 'feed' | 'souvenir'
  startValue: string
  startUrl: string
}

export interface TopicFeed {
  topic: string
  event: 'page' | 'souvenir'
  souvenirId?: string
  /** The page that gave the topic: the interest's source, so an obsession can say where it began. */
  url: string
  title: string
}

export interface HostStat {
  host: string
  reads: number
  souvenirs: number
  boring: number
  failures: number
}

export interface TripResult {
  trail: Trail
  souvenirs: Souvenir[]
  /** Dropped souvenirs and why, so the log can say. */
  dropped: { title: string; reason: string }[]
  /** What each page and souvenir feeds into the interests, in order. */
  feeds: TopicFeed[]
  /** Reads this trip used from the day's allowance: fetches that were tried, not items skipped. */
  reads: number
  /** Looks this trip made at pictures. */
  looks: number
  usd: number
  stats: HostStat[]
  notes: string[]
}

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'souvenir'

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname
  } catch {
    return 'unknown'
  }
}

const lastSegment = (url: string): string => {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).at(-1) ?? url)
  } catch {
    return url
  }
}

const describe = (error: unknown): string => (error instanceof WebError ? `${error.code}: ${error.message}` : (error as Error).message)

/**
 * A trip (spec 6.2): up to 6 reads, where the read call chooses each next link. A failed fetch counts as a read and the trip
 * goes on from the previous page's other links once; a second failure ends it. A page that cannot be read before any model
 * call (too short, read lately) does not count. Every souvenir passes the rails of spec 12.2 on top of the word-for-word check.
 * Does no writing: it returns the trail, the souvenirs and what they feed, for the tick to write.
 */
export async function runTrip(deps: TripDeps, input: TripInput): Promise<TripResult> {
  const pages: TrailPage[] = []
  const souvenirs: Souvenir[] = []
  const dropped: TripResult['dropped'] = []
  const feeds: TopicFeed[] = []
  const stats = new Map<string, HostStat>()
  const notes: string[] = []
  const visited = new Set<string>()
  const attempted = new Set<string>()
  let reads = 0
  let failures = 0
  let skips = 0
  let looks = 0
  let usd = 0

  const stat = (host: string): HostStat => {
    let s = stats.get(host)
    if (!s) stats.set(host, (s = { host, reads: 0, souvenirs: 0, boring: 0, failures: 0 }))
    return s
  }
  const limit = Math.min(MAX_TRIP_READS, deps.readsLeft)
  if (limit <= 0) notes.push('no reads left today')

  /** The links of the last page read that the trip has not tried: where it goes when something fails. */
  let previous: Item | null = null
  const untried = () => previous?.links.filter((l) => !attempted.has(l.url) && !visited.has(l.url)) ?? []

  let url: string | null = limit > 0 ? input.startUrl : null
  while (url !== null && reads < limit) {
    attempted.add(url)
    let item: Item
    try {
      item = await deps.open(url)
    } catch (error) {
      reads++
      failures++
      const reason = describe(error)
      pages.push({ url: url.slice(0, 500), title: lastSegment(url).slice(0, 200), fetchedAt: deps.now(), failed: reason.slice(0, 200), topics: [] })
      stat(hostOf(url)).reads++
      stat(hostOf(url)).failures++
      notes.push(`could not read ${url}: ${reason}`)
      url = failures >= 2 ? null : (untried()[0]?.url ?? null)
      continue
    }

    const outcome = await deps.read(item)
    usd += outcome.usd
    deps.onRead?.(item, outcome)

    if (outcome.skipped) {
      skips++
      notes.push(`skipped ${item.title}: ${outcome.skipped}`)
      if (pages.length === 0) pages.push({ url: item.url.slice(0, 500), title: item.title.slice(0, 200), fetchedAt: deps.now(), failed: `skipped: ${outcome.skipped}`.slice(0, 200), topics: [] })
      url = skips >= MAX_SKIPS ? null : (untried()[0]?.url ?? null)
      continue
    }

    reads++
    const host = item.source
    stat(host).reads++
    if (!outcome.answer) {
      const why = outcome.note ?? 'no usable answer'
      notes.push(`${item.title}: ${why}`)
      pages.push({ url: item.url.slice(0, 500), title: item.title.slice(0, 200), fetchedAt: deps.now(), failed: why.slice(0, 200), topics: [] })
      break
    }

    visited.add(item.url)
    const answer = outcome.answer
    const topics = cleanTopics(answer.topics)
    const interest = clampInterest(answer.interest)
    if (interest <= BORING) stat(host).boring++
    const page: TrailPage = { url: item.url.slice(0, 500), title: item.title.slice(0, 200), fetchedAt: deps.now(), reaction: clampReaction(answer.reaction), topics, interest }

    for (const topic of topics) feeds.push({ topic, event: 'page', url: item.url, title: item.title })

    // A look at a picture it asked for, within the day's 20 (spec 7.8).
    const want = answer.look
    if (want !== null && deps.look && Number.isInteger(want) && want >= 1 && want <= item.images.length && looks < (deps.looksLeft ?? 0)) {
      looks++
      const seen = await deps.look(item, want, page.reaction ?? '')
      usd += seen.usd
      deps.onLook?.(item, seen)
      if (seen.text) page.look = seen.text.slice(0, 600)
      else notes.push(`look at ${item.title}: ${seen.note ?? 'nothing seen'}`)
    }

    const kept = outcome.souvenir.kept
    if (outcome.souvenir.dropped) dropped.push({ title: item.title, reason: outcome.souvenir.dropped })
    if (kept) {
      const made = makeSouvenir({ kept, item, topics, date: input.date, now: deps.now(), have: souvenirs, known: deps.known.souvenirs })
      if (made.ok) {
        souvenirs.push(made.souvenir)
        page.souvenirId = made.souvenir.id
        stat(host).souvenirs++
        for (const topic of topics) feeds.push({ topic, event: 'souvenir', souvenirId: made.souvenir.id, url: item.url, title: item.title })
      } else {
        dropped.push({ title: item.title, reason: made.reason })
      }
    }
    pages.push(page)
    previous = item

    const next = chosenLink(answer, item)
    url = next && !visited.has(next.url) && !attempted.has(next.url) ? next.url : null
  }

  if (pages.length === 0) pages.push({ url: input.startUrl.slice(0, 500), title: lastSegment(input.startUrl).slice(0, 200), fetchedAt: deps.now(), failed: notes.at(-1)?.slice(0, 200) ?? 'not read', topics: [] })
  for (const d of dropped) notes.push(`souvenir dropped (${d.title}): ${d.reason}`)

  return {
    trail: { id: input.id, date: input.date, purpose: input.purpose.slice(0, 300), start: { kind: input.startKind, value: input.startValue.slice(0, 300) }, pages },
    souvenirs,
    dropped,
    feeds,
    reads,
    looks,
    usd,
    stats: [...stats.values()],
    notes,
  }
}

type Made = { ok: true; souvenir: Souvenir } | { ok: false; reason: string }

/** A kept souvenir as a file, after the rails of spec 12.2: one a page, no near copies, 3 a trip. */
function makeSouvenir(a: { kept: Kept; item: Item; topics: string[]; date: string; now: string; have: readonly Souvenir[]; known: readonly KnownSouvenir[] }): Made {
  const { kept, item, have, known } = a
  if (have.length >= MAX_SOUVENIRS_PER_TRIP) return { ok: false, reason: `at most ${MAX_SOUVENIRS_PER_TRIP} souvenirs a trip` }
  const earlier = [...known.map((k) => ({ url: k.url, content: k.content, id: k.id })), ...have.map((s) => ({ url: s.source.url, content: s.content, id: s.id }))]
  if (earlier.some((e) => e.url === item.url)) return { ok: false, reason: 'same source as an earlier souvenir' }
  if (kept.kind === 'image') {
    if (earlier.some((e) => e.content === kept.content)) return { ok: false, reason: 'the same picture as an earlier souvenir' }
  } else if (earlier.some((e) => similarity(e.content, kept.content) > SOUVENIR_SIMILARITY)) return { ok: false, reason: 'a near copy of an earlier souvenir' }

  const taken = new Set(earlier.map((e) => e.id))
  const base = `${a.date}-${slug(item.title)}`
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`

  const common = { id, why: kept.why.slice(0, 300), topics: a.topics, source: { url: item.url.slice(0, 500), title: item.title.slice(0, 200), fetchedAt: a.now }, licence: null, placedIn: null }
  const shape =
    kept.kind === 'image'
      ? { ...common, kind: 'image', content: kept.content, licence: kept.licence, credit: kept.credit }
      : kept.kind === 'fact'
        ? { ...common, kind: 'fact', content: kept.content, evidence: kept.evidence }
        : { ...common, kind: 'quote', content: kept.content }
  const parsed = Souvenir.safeParse(shape)
  return parsed.success ? { ok: true, souvenir: parsed.data } : { ok: false, reason: 'it did not fit the souvenir format' }
}
