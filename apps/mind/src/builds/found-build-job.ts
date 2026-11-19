import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FoundJob, type Place, type PlaceRequest } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { chooseRequestChunk, chunkKey, fallbackDue, hashString, layoutProblems, localDate, openPlaceRequests, toLandPlace, validatePlace } from '@forkling/sim'
import type { BuildHandler } from '../build-worker.ts'
import { clampText } from '../decision.ts'
import type { LlmClient } from '../llm.ts'
import { readPlaces } from '../places.ts'
import { readRequests } from '../requests.ts'
import { createWorkerComplete, unpackResult } from './complete.ts'
import { FOUND_BUILD_LIMITS, FOUND_BUILD_MAX_TOKENS, FoundBuildAnswer, buildFoundBuildUser, toFoundBuildPlace } from './found-build.ts'
import { requestId } from './found.ts'

const SONNET = 'claude-sonnet-5-5'

export interface FoundBuildHandlerOptions {
  /** The world, read only: this handler never writes in it. */
  dir: string
  /** Null when there is no key: the job waits. */
  llm: LlmClient | null
  now: () => number
}

const readJson = (dir: string, rel: string): unknown => {
  try {
    return existsSync(join(dir, rel)) ? JSON.parse(readFileSync(join(dir, rel), 'utf8')) : null
  } catch {
    return null
  }
}

const NEIGHBOURS: readonly [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]

/**
 * The build worker's fallback job (spec 10.2, 10.3): a place request nobody answered in 7 days (21 if Roman said he was building it) gets
 * a plain kit place of 1 to 2 rooms and at most 30 parts, from one Sonnet call at low effort. The request's own name and purpose are
 * used and the exhibits are empty. The place stands on the request's chunk when that is free and touches a place, otherwise where
 * the rule of 4.2 puts it. **It writes nothing in the world and never the ledger**: the checked place and what the calls cost go back
 * in the result, and the loop checks it again and writes `places/`. A place that breaks a rule gets one repair call with every reason.
 */
export function createFoundBuildHandler(o: FoundBuildHandlerOptions): BuildHandler {
  return async (raw) => {
    const parsed = FoundJob.safeParse(raw)
    if (!parsed.success) return { status: 'failed', reason: 'the request is not a found request' }
    const job = parsed.data
    const llm = o.llm
    if (!llm) return { status: 'later' }
    const fail = (reason: string, calls?: ReturnType<typeof createWorkerComplete>['calls']) => ({ status: 'failed' as const, reason, extra: { requestId: job.requestId, ...(calls ? { calls } : {}) } })

    const nowMs = o.now()
    const requests = readRequests(o.dir)
    const request: PlaceRequest | undefined = requests.find((r) => r.id === job.requestId)
    if (!request) return fail(`the request ${job.requestId} is not here any more`)
    if (request.status !== 'open' && request.status !== 'building') return fail(`the request is ${request.status} now`)
    if (!fallbackDue(request, nowMs)) return fail('the fallback is not due yet for this request')

    const places = readPlaces(o.dir)
    const lands = places.map(toLandPlace)
    const forkling = readJson(o.dir, 'forkling.json') as { seed?: number; timezone?: string } | null
    const seed = forkling?.seed ?? 0

    // Where it stands: the request's chunk if no place has it and it touches a place, else the rule of 4.2 (other open requests have staked theirs).
    const occupied = new Set(lands.map((l) => chunkKey(l.chunk)))
    const touches = (c: readonly [number, number]) => NEIGHBOURS.some(([dx, dz]) => occupied.has(chunkKey([c[0] + dx, c[1] + dz])))
    let chunk: readonly [number, number] | null = request.chunk
    if (occupied.has(chunkKey(request.chunk)) || !touches(request.chunk)) {
      const staked = openPlaceRequests(requests.filter((r) => r.id !== request.id)).map((r) => ({ chunk: r.chunk, tags: r.tags }))
      chunk = chooseRequestChunk(lands, staked, { tags: request.tags, related: request.related }, (seed ^ hashString(request.id)) >>> 0)
    }
    if (!chunk) return fail('the world has no room for another place')

    const { complete, calls, nowIso } = createWorkerComplete({ dir: o.dir, llm, nowMs })
    const placeId = requestId(request.name, new Set(places.map((p) => p.id)))
    const today = localDate(forkling?.timezone ?? 'Europe/Stockholm', nowMs)
    const user = buildFoundBuildUser({ request, kit, chunk })

    /** The answer as a place, or every reason it is not one. */
    const judge = (a: FoundBuildAnswer): { ok: true; place: Place } | { ok: false; reasons: string[] } => {
      const reasons: string[] = []
      if (a.rooms.length > FOUND_BUILD_LIMITS.rooms) reasons.push(`a plain kit place has at most ${FOUND_BUILD_LIMITS.rooms} rooms (it has ${a.rooms.length})`)
      const count = a.rooms.reduce((n, r) => n + r.parts.length, 0)
      if (count > FOUND_BUILD_LIMITS.parts) reasons.push(`a plain kit place has at most ${FOUND_BUILD_LIMITS.parts} parts in all (it has ${count})`)
      let place: Place
      try {
        place = toFoundBuildPlace(a, { request, placeId, chunk, nowIso, today })
      } catch (e) {
        return { ok: false, reasons: [...reasons, `the answer is not a place: ${e instanceof Error ? e.message.slice(0, 160) : 'it does not fit the schema'}`] }
      }
      reasons.push(...validatePlace(place, { kit }), ...layoutProblems([...lands, toLandPlace(place)]))
      return reasons.length > 0 ? { ok: false, reasons } : { ok: true, place }
    }

    const first = unpackResult(await complete('foundbuild', SONNET, user, FoundBuildAnswer, FOUND_BUILD_MAX_TOKENS))
    if (!first.ok) return fail(first.reason, calls)
    let verdict = judge(first.answer)
    if (!verdict.ok) {
      const again = [
        '## Your place did not pass its check',
        ...verdict.reasons.map((r) => `- ${r}`),
        '',
        'The answer that failed:',
        JSON.stringify(first.answer),
        '',
        'What you were asked, again:',
        user,
        '',
        'Answer again with a whole new answer that passes. Keep what you were building and change only what is wrong.',
      ].join('\n')
      const second = unpackResult(await complete('repair', SONNET, again, FoundBuildAnswer, FOUND_BUILD_MAX_TOKENS))
      if (!second.ok) return fail(clampText(`${verdict.reasons.join('; ')} (and the second try gave nothing: ${second.reason})`, 300), calls)
      verdict = judge(second.answer)
      if (!verdict.ok) return fail(clampText(verdict.reasons.join('; '), 300), calls)
    }
    return { status: 'done', extra: { requestId: request.id, place: verdict.place, calls } }
  }
}
