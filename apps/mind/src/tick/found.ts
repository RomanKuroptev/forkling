import { PlaceRequest, type Souvenir } from '@forkling/schema'
import { MAX_FOUND_PER_WEEK, chooseRequestChunk, foundCheck, foundsInWeek, hashString, openPlaceRequests, toLandPlace } from '@forkling/sim'
import { buildFoundUser, FOUND_MAX_TOKENS, FoundAnswer, requestId, toPlaceRequest } from '../builds/found.ts'
import { drawForBuild } from '../builds/draw.ts'
import { readAllSouvenirs } from '../builds/works.ts'
import { clampText } from '../decision.ts'
import { readRequests } from '../requests.ts'
import { readWishes } from '../wishes.ts'
import type { Tick } from './context.ts'
import { recordWishes } from './expand.ts'

const KEPT_SHOWN = 8

/** Every place request there is: those on disk and those written earlier in this tick. */
function allRequests(t: Tick): PlaceRequest[] {
  const seen = new Set<string>()
  return [...readRequests(t.dir), ...t.newRequests].filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
}

/**
 * Whether a found is allowed now (spec 2.5, 10.3, with Roman's 14 November numbers): an interest at 40 or more at wake on 3 days in a
 * row that no place carries as a tag, fewer than 2 place requests open, and room in the world. The 1 a week rail is checked beside it.
 */
export function foundGate(t: Tick) {
  const requests = allRequests(t)
  const check = foundCheck({ today: t.today, wakeTop: t.mind.wakeTop ?? [], places: t.places.map((p) => ({ tags: p.tags })), requests })
  return { check, requests }
}

/** The interest Merge could ask for a place for right now, or null: the gate is open and no found was written in the last 7 days. */
export function foundableInterest(t: Tick): string | null {
  const { check } = foundGate(t)
  return check.ok && foundsInWeek(t.mind.founds ?? [], t.nowMs) < MAX_FOUND_PER_WEEK ? check.interest : null
}

/**
 * A found step has run its time (spec 2.4, 10.3): one Haiku call (Sonnet if the step is deep) writes a request to Roman in Merge's own
 * words, checked by code, and `requests/<id>.md` keeps it with a chunk the rule of 4.2 picked and nothing else decided for it. The
 * conditions are checked again here, since the world may have changed since the plan. A request that breaks a rule is not written and
 * does not count against the 1 a week. Roman builds it, or the fallback does after 7 days (slice 7).
 */
export async function foundStep(t: Tick): Promise<void> {
  const pending = t.pendingFound
  if (!pending) return
  const { step, index } = pending
  const name = clampText((step.targetId ?? '').trim(), 40)
  const rest = (why: string) => {
    t.notes.push(`found ${name}: ${why}`)
    const text = `My found of ${name || 'a place'} could not start (${clampText(why, 160)}), so I rested instead.`
    t.remember.push({ at: t.nowIso, kind: 'event', text, verb: 'found' })
    t.justNow.push(text)
  }
  const fail = (why: string) => {
    t.notes.push(`found ${name}: ${why}`)
    t.remember.push({ at: t.nowIso, kind: 'event', text: `My request for ${name} was not written (${clampText(why, 160)}), so nothing was asked.`, verb: 'found' })
    t.justNow.push(`Your request for ${name} did not work: ${clampText(why, 160)}`)
  }
  if (name.length < 3) return rest('a new place needs a name of 3 to 40 characters')
  if (foundsInWeek(t.mind.founds ?? [], t.nowMs) >= MAX_FOUND_PER_WEEK) return rest(`found is ${MAX_FOUND_PER_WEEK} a week`)
  const { check, requests } = foundGate(t)
  if (!check.ok || check.interest === null) return rest(check.reasons.join('; '))
  const interest = check.interest

  const souvenirs: Souvenir[] = [...readAllSouvenirs(t.dir), ...t.newSouvenirs].filter((s, i, all) => all.findIndex((o) => o.id === s.id) === i)
  const kept = souvenirs
    .filter((s) => s.topics.some((topic) => topic.toLowerCase() === interest.toLowerCase()))
    .slice(-KEPT_SHOWN)
    .reverse()
    .map((s) => ({ id: s.id, kind: s.kind, content: s.content, why: s.why }))
  const draw = drawForBuild(t.dir, { seed: t.forkling.seed, key: `found:${t.today}:${index}`, interests: t.interests })
  const interests = Object.keys(t.interests.topics)
  const known = new Map(readWishes(t.dir).map((w) => [w.id, w]))
  for (const w of t.wishUpdates) known.set(w.id, w)
  const user = buildFoundUser({
    name,
    reason: step.reason,
    interest,
    kept,
    places: t.places.map((p) => ({ id: p.id, name: p.name, tags: p.tags, purpose: p.purpose })),
    interests,
    openWishes: [...known.values()].filter((w) => w.status === 'open' || w.status === 'building').map((w) => ({ name: w.name, count: w.count })),
    constraint: draw.constraint,
    collision: draw.collision ?? undefined,
  })
  const model = step.deep ? 'claude-sonnet-5-5' : 'claude-haiku-5-5'
  const result = await t.ask('found', model, user, FoundAnswer, FOUND_MAX_TOKENS)
  if (!result) return
  const answer = FoundAnswer.safeParse(result.parsed)
  if (!answer.success) {
    t.notes.push(`no usable request (stopped: ${result.stopReason ?? 'unknown'})`)
    t.remember.push({ at: t.nowIso, kind: 'event', text: `My request for ${name} gave nothing usable, so nothing was asked.`, verb: 'found' })
    return
  }

  const id = requestId(name, new Set([...requests.map((r) => r.id), ...t.places.map((p) => p.id)]))
  const context = { name, interest, id, chunk: [0, 0] as const, nowIso: t.nowIso, interests, placeIds: new Set(t.places.map((p) => p.id)), souvenirIds: new Set(souvenirs.map((s) => s.id)) }
  const converted = toPlaceRequest(answer.data, context)
  if (!converted.ok) return fail(converted.reason)

  // Where it stands comes from the rule of 4.2: an open request has staked its chunk, and a new one may touch it.
  const staked = openPlaceRequests(requests).map((r) => ({ chunk: r.chunk, tags: r.tags }))
  const chunk = chooseRequestChunk(t.places.map(toLandPlace), staked, { tags: converted.request.tags, related: converted.request.related }, (t.forkling.seed ^ hashString(id)) >>> 0)
  if (!chunk) return rest('the world has no room for another place')
  const request = PlaceRequest.parse({ ...converted.request, chunk: [...chunk] })

  t.newRequests.push(request)
  recordWishes(t, converted.wishes, `found ${name}`)
  t.mind.founds = [...(t.mind.founds ?? []), t.nowIso].slice(-10)
  const refusal = answer.data.constraintRefusal?.trim()
  if (refusal) t.remember.push({ at: t.nowIso, kind: 'event', text: clampText(`I refused the constraint "${draw.constraint}" for the request for ${name}: ${refusal}`, 300), verb: 'found' })
  t.remember.push({ at: t.nowIso, kind: 'made', text: `Asked Roman for a place: ${name} (${interest}).`, verb: 'found', goalRef: `today:${index}` })
  t.parts.push(`asked Roman for ${name}`)
}
