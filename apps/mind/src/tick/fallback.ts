import { FoundJob, PlaceRequest, type JobResult } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { fallbackDue, layoutProblems, toLandPlace, validatePlace, FALLBACK_DAYS } from '@forkling/sim'
import { pendingJobs } from '../build-worker.ts'
import { paceAhead } from '../budget.ts'
import { FOUND_BUILD_LIMITS } from '../builds/found-build.ts'
import { clampText } from '../decision.ts'
import { readRequests } from '../requests.ts'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Tick } from './context.ts'
import { constructionEnd } from './expand.ts'
import { FOUND_CONSTRUCTION_MS } from './lifecycle.ts'

/** A request that the fallback build could not make is tried again after this long, and at most this many times in all. */
export const FALLBACK_RETRY_MS = 24 * 3_600_000
export const FALLBACK_MAX_TRIES = 3

/** Every place request there is, the ones changed or written earlier in this tick taking the place of the files on disk. */
function currentRequests(t: Tick): PlaceRequest[] {
  const seen = new Set<string>()
  return [...t.newRequests, ...readRequests(t.dir)].filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
}

/**
 * A place request nobody answered in 7 days (21 if Roman said he was building it) is built by the build worker as a plain kit place
 * (spec 10.3). The tick only asks: it writes `mind/builds/found-<date>-<hhmm>.json` and makes no call. One at a time, oldest request
 * first, only while Merge is awake and spending is not ahead of the month's pace, and a request that could not be built is tried
 * again a day later, 3 times at most.
 */
export function fallbackStep(t: Tick): void {
  if (t.asleep) return
  if (pendingJobs(t.dir).some((j) => j.kind === 'found') || t.newJobs.some((j) => j.kind === 'found')) return
  if (paceAhead(t.budget, t.today)) return
  const tries = t.mind.fallbackTries ?? {}
  const next = currentRequests(t)
    .filter((r) => fallbackDue(r, t.nowMs))
    .filter((r) => {
      const x = tries[r.id]
      return !x || (x.tries < FALLBACK_MAX_TRIES && t.nowMs >= Date.parse(x.next))
    })
    .sort((a, b) => a.written.localeCompare(b.written) || a.id.localeCompare(b.id))[0]
  if (!next) return

  const base = `found-${t.today.replaceAll('-', '')}-${t.nowIso.slice(11, 16).replace(':', '')}`
  let id = base
  for (let n = 2; existsSync(join(t.dir, 'mind/builds', `${id}.json`)) || existsSync(join(t.dir, 'mind/builds', `${id}.result.json`)); n++) id = `${base}-${n}`
  t.newJobs.push(FoundJob.parse({ id, kind: 'found', requestedAt: t.nowIso, requestId: next.id }))
  t.mind.fallbackTries = { ...tries, [next.id]: { tries: (tries[next.id]?.tries ?? 0) + 1, next: new Date(t.nowMs + FALLBACK_RETRY_MS).toISOString() } }
  const text = `Nobody answered my request for ${next.name} in ${next.status === 'building' ? FALLBACK_DAYS + 14 : FALLBACK_DAYS} days, so the builders are making a plain version from the kit.`
  t.remember.push({ at: t.nowIso, kind: 'made', text, verb: 'found' })
  t.parts.push(`asked the builders for a plain ${next.name}`)
}

/**
 * The builders' answer to a fallback build (spec 10.3): the worker has checked the place, and this is the one place that writes `places/`.
 * It is checked again against the world as it is now (another place may have taken the chunk, Roman may have answered the request),
 * and if it still fits it is written with 6 hours of waking time of construction, the request becomes `self-built`, and the place is
 * noted as seen so that it is not taken for a gift. Otherwise nothing changes and the request stays open for another try.
 */
export function applyFoundResult(t: Tick, r: JobResult): { ok: boolean; text: string } {
  const request = currentRequests(t).find((x) => x.id === r.requestId)
  const name = request?.name ?? r.requestId ?? 'a place'
  if (r.status === 'failed') return { ok: false, text: `the builders could not make a plain version of ${name}${r.reason ? `: ${clampText(r.reason, 160)}` : ''}` }
  const drop = (why: string) => ({ ok: false, text: `the builders' plain version of ${name} could not be built: ${clampText(why, 160)}` })
  if (!request || !r.place) return drop('the request or the place is missing')
  if (request.status !== 'open' && request.status !== 'building') return drop(`the request is ${request.status} now`)

  const place = r.place
  const reasons: string[] = []
  if (t.places.some((p) => p.id === place.id)) reasons.push(`a place called ${place.id} already stands`)
  if (place.rooms.length > FOUND_BUILD_LIMITS.rooms) reasons.push(`a plain kit place has at most ${FOUND_BUILD_LIMITS.rooms} rooms`)
  if (place.rooms.reduce((n, room) => n + room.parts.length, 0) > FOUND_BUILD_LIMITS.parts) reasons.push(`a plain kit place has at most ${FOUND_BUILD_LIMITS.parts} parts in all`)
  if (place.exhibits.length > 0) reasons.push('a plain kit place has no exhibits')
  reasons.push(...validatePlace(place, { kit }), ...layoutProblems([...t.places.map(toLandPlace), toLandPlace(place)]))
  if (reasons.length > 0) return drop(reasons.join('; '))

  const built = { ...place, state: { ...place.state, construction: { kind: 'found' as const, finishesAt: constructionEnd(t, FOUND_CONSTRUCTION_MS) } } }
  t.placeUpdates.push(built)
  t.places = [...t.places, built]
  t.mind.placesSeen = [...new Set([...(t.mind.placesSeen ?? []), built.id])]
  t.newRequests.push(PlaceRequest.parse({ ...request, status: 'self-built', statusAt: t.nowIso }))
  t.mind.requestSeen = { ...(t.mind.requestSeen ?? {}), [request.id]: 'self-built' }
  const days = Math.max(FALLBACK_DAYS, Math.round((t.nowMs - Date.parse(request.written)) / 86_400_000))
  return { ok: true, text: `Nobody answered your request for ${name} in ${days} days, so the builders made a plain version from the kit: it is under construction and opens soon. Roman can still build the full one on the same chunk.` }
}
