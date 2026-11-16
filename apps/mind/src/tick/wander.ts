import type { BudgetCall, InterestSource } from '@forkling/schema'
import { createPrng, fadeInterests, feedTopic, isStrangerStart, recordWake, recordWakeMood, SPARK_GAIN, updatePhases } from '@forkling/sim'
import { canSpend, recordCall, type Usage } from '../budget.ts'
import { pickDoors } from '../web/doors.ts'
import { addStats } from '../web/stats.ts'
import { MAX_LOOKS_PER_DAY, performLook } from '../web/look.ts'
import { performRead } from '../web/readcall.ts'
import { rememberSeen, type SeenPage } from '../web/lookup.ts'
import { startKey } from '../web/rails.ts'
import { frontPageLinks, imgflipTopLinks, readUrl } from '../web/sources/index.ts'
import { resolveStart } from '../web/start.ts'
import { MAX_READS_PER_DAY, runTrip } from '../web/trip.ts'
import type { Tick } from './context.ts'
import { ownNotes } from '../prompts/page.ts'
import { rememberScored } from './importance.ts'

const HAIKU = 'claude-haiku-5-5' as const
/** The front pages offer these many links to the morning, most from Wikipedia. */
const WIKIPEDIA_POINTS = 12
const ESOLANG_POINTS = 6
/** And the most-captioned meme formats of the last 30 days, the pulse of memes (spec 6.1). */
const MEME_POINTS = 6

const soft = async <T>(run: () => Promise<T>, note: (why: string) => void): Promise<T | null> => {
  try {
    return await run()
  } catch (error) {
    note((error as Error).message)
    return null
  }
}

/**
 * A new day starts in the interests: what it was into fades a little and an obsession that burnt out ends, once a day. Then
 * the front pages of the sites it may read are looked at, so the morning plan can start a wander from somewhere (and from
 * three doors outside its interests). Reading a front page is the only reading that happens before the plan.
 */
export async function morningStep(t: Tick): Promise<void> {
  if (t.thinkKind !== 'morning') return
  const { mind, today, nowIso, notes, deps, fetcher } = t
  if (mind.interestsFadedOn !== today) {
    t.interests = fadeInterests(t.interests)
    mind.interestsFadedOn = today
  }
  t.interests = updatePhases(t.interests, nowIso)
  // What it is into at wake, for the found rule of 3 days in a row (spec 2.5). The same morning twice changes nothing.
  mind.wakeMoods = recordWakeMood(mind.wakeMoods ?? [], today, t.mood)
  mind.wakeTop = recordWake(mind.wakeTop ?? [], today, Object.fromEntries(Object.entries(t.interests.topics).map(([topic, v]) => [topic, v.weight])))

  if (deps.dryRun) {
    notes.push('dry run: would look at the front pages')
    return
  }
  if (!fetcher) return
  const [wiki, esolangs, memes] = await Promise.all([
    soft(() => frontPageLinks(fetcher, 'en.wikipedia.org'), (why) => notes.push(`the Wikipedia front page could not be read: ${why}`)),
    soft(() => frontPageLinks(fetcher, 'esolangs.org'), (why) => notes.push(`the Esolang front page could not be read: ${why}`)),
    soft(() => imgflipTopLinks(fetcher, MEME_POINTS), (why) => notes.push(`the Imgflip meme formats could not be read: ${why}`)),
  ])
  const links = [...(wiki ?? []).slice(0, WIKIPEDIA_POINTS), ...(esolangs ?? []).slice(0, ESOLANG_POINTS), ...(memes ?? [])]
  t.startingPoints = pickDoors(links, t.interests, createPrng((t.forkling.seed ^ Number(today.replaceAll('-', ''))) >>> 0))
  // Kept for the day, so a replan after the morning can still name them, and the links are pages it has now seen.
  mind.points = { date: today, list: t.startingPoints.map((p) => ({ title: p.title.slice(0, 200), url: p.url.slice(0, 500), door: p.door })).slice(0, 30) }
  mind.seen = rememberSeen(mind.seen ?? [], links.map((l) => ({ title: l.title.slice(0, 200), url: l.url.slice(0, 500) })))
  mind.pausedHosts = fetcher.pausedHosts()
}

/**
 * A wander step has run its time: a trip (spec 6.2). Up to 6 reads on allowed sites, each a fetch by code and one Haiku call
 * whose answer the code checks. It writes a trail and the souvenirs that passed their checks, moves the interests (each change
 * pointing at the trail), and counts its reads against the day's 40. Never runs in a dry run or without the web and a model.
 */
export async function tripStep(t: Tick): Promise<void> {
  const pending = t.pendingTrip
  if (!pending) return
  const { step } = pending
  const { notes, remember, justNow, nowIso, today, parts } = t
  const skip = (why: string) => {
    notes.push(`wander: ${why}`)
    remember.push({ at: nowIso, kind: 'event', text: `Could not go wandering: ${why}.`, verb: 'wander', engine: true })
    justNow.push(`could not wander: ${why}`)
  }
  if (t.deps.dryRun) {
    notes.push('dry run: would wander')
    return
  }
  const { fetcher } = t
  const llm = t.deps.llm
  if (!fetcher) return skip('there is no way to reach the web this tick')
  if (!llm) return skip('there is no model this tick')
  const readsLeft = MAX_READS_PER_DAY - t.trips.reads
  if (readsLeft <= 0) return skip(`the ${MAX_READS_PER_DAY} reads of the day are used`)
  // A topic is matched with the titles of pages it has really seen (no search: robots.txt allows none), before its own page is tried.
  const pool: SeenPage[] = [...(t.mind.seen ?? []), ...t.startingPoints.map((p) => ({ title: p.title, url: p.url }))]
  const start = resolveStart(step.targetId ?? '', t.wander.souvenirs, pool)
  if (!start.ok) return skip(start.reason)

  /** A model call booked in the ledger and the tick log. A call that never happened is only noted. */
  const book = (kind: 'read' | 'vision', usage: Usage | undefined, usd: number, ok: boolean, note: string | undefined) => {
    if (usage) {
      const call: BudgetCall = { at: nowIso, kind, model: HAIKU, ...usage, usd }
      t.calls.push(call)
      t.budget = recordCall(t.budget, call)
      t.attempts.push({ kind, model: HAIKU, usd, ok })
    } else if (note) {
      t.attempts.push({ kind, model: HAIKU, usd: 0, ok: false, error: note.slice(0, 200) })
    }
  }
  const id = `${today}-${t.wander.trailsToday + t.newTrails.length + 1}`
  const result = await runTrip(
    {
      open: (url) => readUrl(fetcher, url),
      read: (item) =>
        performRead({ llm, fetcher, seed: ownNotes(t.page, t.w.seed), purpose: step.reason, interests: t.interests, mayCall: (usd) => canSpend(t.budget, usd), readRecently: t.wander.readRecently }, item),
      now: () => nowIso,
      known: { souvenirs: t.wander.souvenirs, readRecently: t.wander.readRecently },
      readsLeft,
      look: (item, picture, reaction) => performLook({ llm, fetcher, seed: ownNotes(t.page, t.w.seed), mayCall: (usd) => canSpend(t.budget, usd) }, item, picture, reaction),
      looksLeft: MAX_LOOKS_PER_DAY - t.trips.looks,
      // Booked at once, so the guard sees the cost before the next call.
      onRead: (_item, outcome) => book('read', outcome.usage, outcome.usd, outcome.answer !== null, outcome.note),
      onLook: (_item, outcome) => book('vision', outcome.usage, outcome.usd, outcome.text !== null, outcome.note),
    },
    { id, date: today, purpose: step.reason, startKind: start.kind, startValue: start.value, startUrl: start.url },
  )

  const before = t.interests
  t.newTrails.push(result.trail)
  t.newSouvenirs.push(...result.souvenirs)
  for (const feed of result.feeds) {
    const source: InterestSource = { id: (feed.souvenirId ?? `trail:${id}`).slice(0, 80), title: feed.title.slice(0, 200), url: feed.url.slice(0, 300), at: nowIso }
    t.interests = feedTopic(t.interests, { topic: feed.topic, event: feed.event, trail: id, source, nowIso })
  }
  // The topic a trip raised the most, if by 15 or more, is a spark for the next decide call.
  const gains = [...new Set(result.feeds.map((f) => f.topic))].map((topic) => {
    const key = Object.keys(t.interests.topics).find((k) => k === topic) ?? topic
    return { topic, gain: (t.interests.topics[key]?.weight ?? 0) - (before.topics[key]?.weight ?? 0) }
  })
  const best = gains.sort((a, b) => b.gain - a.gain)[0]
  if (best && best.gain >= SPARK_GAIN && (t.mind.sparked?.date !== today || t.mind.sparked.count < 2)) {
    t.mind.sparked = { date: today, count: t.mind.sparked?.date === today ? t.mind.sparked.count : 0, pending: { topic: best.topic.slice(0, 60), gain: best.gain } }
  }
  t.mind.seen = rememberSeen(t.mind.seen ?? [], result.seen)
  t.mind.trips = { date: today, reads: t.trips.reads + result.reads, trips: t.trips.trips + 1, looks: t.trips.looks + result.looks, starts: [...t.trips.starts, startKey(start.value)].slice(-60) }
  t.trips = t.mind.trips
  // Where the trip started, for the week's share of trips through a stranger's door (spec 12.3): measured, never enforced.
  const top = Object.entries(before.topics).sort((a, b) => b[1].weight - a[1].weight).slice(0, 5).map(([topic]) => topic)
  const stranger = isStrangerStart(start, t.startingPoints.filter((p) => p.door).map((p) => p.url), top)
  const day = t.mind.doorDays?.find((d) => d.date === today)
  t.mind.doorDays = [...(t.mind.doorDays ?? []).filter((d) => d.date !== today), { date: today, trips: (day?.trips ?? 0) + 1, strangers: (day?.strangers ?? 0) + (stranger ? 1 : 0) }].sort((a, b) => a.date.localeCompare(b.date)).slice(-7)
  t.sources = addStats(t.sources, today, result.stats)
  t.mind.pausedHosts = fetcher.pausedHosts()
  for (const _ of result.souvenirs) t.moodEvents.push('souvenirKept')

  notes.push(...result.notes.slice(0, 10))
  // A trip that found no page to read says so in plain words, so nothing written after it can pretend it read something.
  if (result.trail.pages.every((p) => p.failed)) {
    const why = start.kind === 'topic' && start.found === 'guess' ? 'there is no page of that name' : 'the page could not be read'
    remember.push({ at: nowIso, kind: 'reading', text: `Looked for ${start.value} and found nothing to read (${why}), so I read nothing about it.`, verb: 'wander', goalRef: `today:${pending.index}` })
    justNow.push(`looked for ${start.value}: found nothing to read, so read nothing`)
    parts.push(`looked for ${start.value}, read nothing`)
    return
  }
  const kept = result.souvenirs.length
  const summary = `${result.trail.pages.length} page${result.trail.pages.length === 1 ? '' : 's'}${kept > 0 ? `, kept ${kept} souvenir${kept === 1 ? '' : 's'}` : ''}`
  remember.push({ at: nowIso, kind: 'reading', text: `Wandered from ${start.value}: ${summary}.`, verb: 'wander', goalRef: `today:${pending.index}` })
  for (const s of result.souvenirs) rememberScored(t, { at: nowIso, kind: 'made', text: `Kept a souvenir from ${s.source.title}: "${s.content}"`, verb: 'wander', goalRef: `today:${pending.index}` }, 'souvenirKept')
  justNow.push(`wandered from ${start.value}: ${summary}`)
  parts.push(`wandered from ${start.value}`)
}
