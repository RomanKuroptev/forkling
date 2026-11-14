import { PlaceRequest, isOpenRequest, type Place, type Wish } from '@forkling/schema'
import { readRequests } from '../requests.ts'
import { readWishes } from '../wishes.ts'
import { requestId } from '../builds/found.ts'
import { clampText } from '../decision.ts'
import type { Tick } from './context.ts'
import { constructionEnd } from './expand.ts'

/** Spec 4.5: a found place goes through 6 hours of waking time of construction when it lands. */
export const FOUND_CONSTRUCTION_MS = 6 * 3_600_000
/** Spec 10.3: a wish with no status after 30 days closes as unanswered. */
export const WISH_CLOSE_DAYS = 30
const MAX_PENDING = 10
const MAX_FROM_ROMAN = 8
const DAY_MS = 86_400_000

const sameChunk = (a: readonly [number, number], b: readonly [number, number]) => a[0] === b[0] && a[1] === b[1]

/**
 * The life of a request, a wish and a place Roman builds (spec 10.3), looked at once a tick, before the builders' results are taken in:
 * - A place that lands in the world (a file the mind has not seen) starts 6 hours of waking time of construction (unless Roman set
 *   one), gets a history line that says who had the idea and who built it, and answers the request staked on its chunk (that request
 *   becomes `built`); with no such request it is filed as a gift. Merge is told once.
 * - A status Roman sets on a request or a wish is told to the next decide call once, with his words as data and never as an
 *   instruction (the trigger line names only the place and the status).
 * - A wish with no status 30 days after it was written closes as `unanswered`, and Merge may wish again.
 * The first time it looks, the places that are there are noted and nothing is done to them.
 */
export function lifecycleStep(t: Tick): void {
  const { mind } = t
  const requests = readRequests(t.dir)
  const wishes = readWishes(t.dir)
  const requestSeen = { ...(mind.requestSeen ?? {}) }
  const wishSeen = { ...(mind.wishSeen ?? {}) }

  /** News for the next decide call: a line in the trigger, Roman's words (if any) as data, a line in the stream. */
  const announce = (id: string, text: string, romans?: string, verb = 'found') => {
    const jobs = mind.jobs ?? { seen: [], pending: [] }
    jobs.pending = [...jobs.pending, { id, text: clampText(text, 300) }].slice(-MAX_PENDING)
    mind.jobs = jobs
    if (romans) mind.fromRoman = [...(mind.fromRoman ?? []), { id, text: clampText(romans, 700) }].slice(-MAX_FROM_ROMAN)
    t.remember.push({ at: t.nowIso, kind: 'event', text: clampText(text, 300), verb })
    t.parts.push(text.length > 60 ? `${text.slice(0, 57)}...` : text)
  }
  const roman = (name: string, status: string, note: string | null) => `${name} | ${status}${note ? ` | ${note}` : ''}`

  // 1. Places that land.
  const placeIds = t.places.map((p) => p.id)
  if (mind.placesSeen === undefined) {
    mind.placesSeen = placeIds
  } else {
    const seen = new Set(mind.placesSeen)
    for (const place of t.places.filter((p) => !seen.has(p.id))) landPlace(place)
    mind.placesSeen = placeIds
  }

  function landPlace(place: Place): void {
    const match = requests.find((r) => sameChunk(r.chunk, place.chunk) && (isOpenRequest(r) || r.status === 'built'))
    const asked = match?.kind === 'place'
    const history = { at: t.nowIso, verb: 'found' as const, summary: asked ? 'Asked for by Merge, built by Roman with Claude Code.' : 'A gift from Roman.' }
    const construction = place.state.construction ?? { kind: 'found' as const, finishesAt: constructionEnd(t, FOUND_CONSTRUCTION_MS) }
    const landed: Place = { ...place, state: { ...place.state, construction }, history: [...place.history, history].slice(-50) }
    t.placeUpdates.push(landed)
    t.places = t.places.map((p) => (p.id === landed.id ? landed : p))

    if (match && isOpenRequest(match)) {
      t.newRequests.push(PlaceRequest.parse({ ...match, status: 'built', statusAt: t.nowIso }))
    } else if (!match) {
      const taken = new Set([...requests.map((r) => r.id), ...t.newRequests.map((r) => r.id)])
      const id = requestId(place.id, taken)
      const gift = PlaceRequest.parse({
        id,
        kind: 'gift',
        name: place.name.length >= 3 ? clampText(place.name, 40) : place.id.padEnd(3, '-'),
        purpose: clampText(place.purpose || place.name, 160),
        tags: (place.tags.length > 0 ? place.tags : ['unsorted']).slice(0, 3).map((x) => clampText(x, 60)),
        chunk: [...place.chunk],
        related: place.related.slice(0, 3),
        souvenirs: [],
        written: t.nowIso,
        status: 'built',
        statusAt: t.nowIso,
        note: null,
        body: 'Built by Roman without a request.',
      })
      t.newRequests.push(gift)
      requestSeen[id] = 'built'
    }
    if (match) requestSeen[match.id] = 'built'
    t.moodEvents.push('buildAccepted')
    announce(
      `place:${place.id}`,
      `Roman built ${place.name}${asked ? ', the place you asked for' : ', a place you did not ask for'}: it is under construction and opens soon.`,
      match?.note ? roman(place.name, 'built', match.note) : undefined,
    )
  }

  // 2. A status Roman sets on a request. A request a place just answered is `built` now, not as the file says.
  const live = [...requests.filter((r) => !t.newRequests.some((n) => n.id === r.id)), ...t.newRequests]
  for (const r of live) {
    const prev = requestSeen[r.id]
    if (prev === r.status) continue
    requestSeen[r.id] = r.status
    // The mind wrote it open, or has just put it into a status itself.
    if (prev === undefined && r.status === 'open') continue
    if (r.status === 'self-built' || r.status === 'withdrawn' || r.status === 'open') continue
    if (r.status === 'built') t.moodEvents.push('buildAccepted')
    announce(
      `request:${r.id}:${r.status}`,
      r.kind === 'gift' ? `Roman built something you did not ask for: ${r.name}.` : `Roman answered your request for ${r.name}: ${r.status}.`,
      roman(r.name, r.status, r.note),
    )
  }
  mind.requestSeen = Object.fromEntries(Object.entries(requestSeen).filter(([id]) => live.some((r) => r.id === id)))

  // 3. A status Roman sets on a wish, and the wishes nobody answered.
  for (const w of wishes) closeOrAnnounce(w)
  mind.wishSeen = Object.fromEntries(Object.entries(wishSeen).filter(([id]) => wishes.some((w) => w.id === id)))

  function closeOrAnnounce(w: Wish): void {
    const prev = wishSeen[w.id]
    if (prev !== w.status) {
      wishSeen[w.id] = w.status
      if (!(prev === undefined && w.status === 'open') && w.status !== 'unanswered' && w.status !== 'withdrawn' && w.status !== 'open') {
        announce(`wish:${w.id}:${w.status}`, `Roman answered your wish for ${w.name}: ${w.status}.`, roman(w.name, w.status, w.note))
      }
    }
    if (w.status === 'open' && t.nowMs - Date.parse(w.written) >= WISH_CLOSE_DAYS * DAY_MS) {
      t.wishUpdates = [...t.wishUpdates.filter((x) => x.id !== w.id), { ...w, status: 'unanswered', statusAt: t.nowIso }]
      wishSeen[w.id] = 'unanswered'
      t.remember.push({ at: t.nowIso, kind: 'event', text: `My wish for ${w.name} went ${WISH_CLOSE_DAYS} days with no answer, so it is closed. I may wish for it again.`, verb: 'found' })
    }
  }
}
