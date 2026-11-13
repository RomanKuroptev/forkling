import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ExpandJob, type JobResult, type Souvenir } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { addWakingMs, addWishes, expandCheck, validatePlacePatch } from '@forkling/sim'
import { pendingJobs } from '../build-worker.ts'
import { paceAhead } from '../budget.ts'
import { refFile } from '../builds/tend.ts'
import { readAllSouvenirs } from '../builds/works.ts'
import { clampText } from '../decision.ts'
import { readWishes } from '../wishes.ts'
import type { Tick } from './context.ts'

/** Spec 4.5: an accepted expand starts a construction of 3 hours of waking time. */
export const EXPAND_CONSTRUCTION_MS = 3 * 3_600_000

/** The interest weights as they are now, for the conditions of spec 2.5. */
const weightsOf = (t: Tick): Record<string, number> => Object.fromEntries(Object.entries(t.interests.topics).map(([topic, v]) => [topic, v.weight]))

/** Every souvenir kept, those on disk and those kept earlier in this tick. */
function allSouvenirs(t: Tick): Souvenir[] {
  const seen = new Set<string>()
  return [...readAllSouvenirs(t.dir), ...t.newSouvenirs].filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
}

/** The places that have earned an expand (spec 2.5), each with the tag that earned it. */
export function expandablePlaces(t: Tick): { id: string; tag: string }[] {
  const souvenirs = allSouvenirs(t)
  const weights = weightsOf(t)
  return t.places.flatMap((p) => {
    const check = expandCheck(p, weights, souvenirs)
    return check.ok && check.tag !== null ? [{ id: p.id, tag: check.tag }] : []
  })
}

/**
 * An expand step has run its time. The change is not made in the tick: the step asks the build worker for it with a job file
 * (spec 2.4, 10.2), and the result comes back later (`applyExpandResult`). One at a time, and never while spending is ahead of
 * the month's pace (spec 13). The conditions of 2.5 are checked again here, since the world may have changed since the plan.
 */
export function expandStep(t: Tick): void {
  const pending = t.pendingExpand
  if (!pending) return
  const { step, index } = pending
  const place = t.places.find((p) => p.id === step.targetId)
  if (!place) return
  const rest = (why: string) => {
    t.notes.push(`expand ${place.id}: ${why}`)
    const text = `My expand of ${place.name} could not start (${clampText(why, 160)}), so I rested instead.`
    t.remember.push({ at: t.nowIso, kind: 'event', text, verb: 'expand' })
    t.justNow.push(text)
  }
  if (pendingJobs(t.dir).some((j) => j.kind === 'expand') || t.newJobs.some((j) => j.kind === 'expand')) return rest('an expansion is already being built')
  if (paceAhead(t.budget, t.today)) return rest("spending is ahead of the month's pace, so building waits")
  if (t.mind.lastExpandedPlace === place.id) return rest('it was the last place I expanded')
  const check = expandCheck(place, weightsOf(t), allSouvenirs(t))
  if (!check.ok) return rest(check.reasons.join('; '))

  const base = `expand-${t.today.replaceAll('-', '')}-${t.nowIso.slice(11, 16).replace(':', '')}`
  let id = base
  for (let n = 2; existsSync(join(t.dir, 'mind/builds', `${id}.json`)) || existsSync(join(t.dir, 'mind/builds', `${id}.result.json`)); n++) id = `${base}-${n}`
  t.newJobs.push(ExpandJob.parse({ id, kind: 'expand', requestedAt: t.nowIso, placeId: place.id, reason: clampText(step.reason, 200) }))
  t.mind.lastExpandedPlace = place.id
  t.remember.push({ at: t.nowIso, kind: 'made', text: `Asked the builders to expand ${place.name}.`, verb: 'expand', goalRef: `today:${index}` })
  t.parts.push(`asked for an expansion of ${place.name}`)
}

/** The place an expand was asked for, from its request file: a result that failed before the worker named it still answers to it. */
function requestedPlace(dir: string, id: string): string | undefined {
  try {
    const job = ExpandJob.safeParse(JSON.parse(readFileSync(join(dir, 'mind/builds', `${id}.json`), 'utf8')))
    return job.success ? job.data.placeId : undefined
  } catch {
    return undefined
  }
}

/**
 * The builders' answer to an expand (spec 10.2, W6): the worker has checked the change and returned it, and this is the one place
 * that writes `places/`. The change is checked again against the place as it is now (a tend may have changed it, and the
 * conditions of 2.5 must still hold); if it still fits, the place gets it, with a construction of 3 hours of waking time (spec
 * 4.5), and the wishes are written or counted up (spec 5.3). Otherwise nothing changes. Says in plain words what happened.
 */
export function applyExpandResult(t: Tick, r: JobResult): { ok: boolean; text: string } {
  const placeId = r.placeId ?? requestedPlace(t.dir, r.id)
  const place = t.places.find((p) => p.id === placeId)
  const name = place?.name ?? placeId ?? 'a place'
  if (r.status === 'failed') return { ok: false, text: `the builders could not expand ${name}${r.reason ? `: ${clampText(r.reason, 160)}` : ''}` }
  const drop = (why: string) => ({ ok: false, text: `the builders' expansion of ${name} could not be built: ${clampText(why, 160)}` })
  if (!place || !r.patch) return drop('the place or the change is missing')

  const check = expandCheck(place, weightsOf(t), allSouvenirs(t))
  if (!check.ok) return drop(check.reasons.join('; '))
  const checked = validatePlacePatch(place, r.patch, {
    kit,
    nowIso: t.nowIso,
    placeIds: new Set(t.places.map((p) => p.id)),
    exists: (ref) => {
      const f = refFile(ref)
      return f !== null && existsSync(join(t.dir, f))
    },
  })
  if (!checked.ok) return drop(checked.reasons.join('; '))

  const finishesAt = new Date(addWakingMs(t.nowMs, EXPAND_CONSTRUCTION_MS, { seed: t.forkling.seed, timezone: t.tz, ...(t.forkling.lateNight ? { lateNight: t.forkling.lateNight } : {}) })).toISOString()
  const built = { ...checked.place, state: { ...checked.place.state, construction: { kind: 'expand' as const, finishesAt } } }
  t.placeUpdates.push(built)
  t.places = t.places.map((p) => (p.id === built.id ? built : p))

  if (r.wishes && r.wishes.length > 0) {
    const known = new Map(readWishes(t.dir).map((w) => [w.id, w]))
    for (const w of t.wishUpdates) known.set(w.id, w)
    const added = addWishes([...known.values()], r.wishes, t.nowIso)
    for (const w of added.wishes) t.wishUpdates = [...t.wishUpdates.filter((x) => x.id !== w.id), w]
    if (added.dropped.length > 0) t.notes.push(`expand ${place.id}: ${added.dropped.length} wish(es) dropped, 5 are already open: ${added.dropped.join(', ')}`)
  }
  if (r.constraint?.refused) {
    t.remember.push({ at: t.nowIso, kind: 'event', text: clampText(`I refused the constraint "${r.constraint.text}" for ${name}: ${r.constraint.reason ?? ''}`, 300), verb: 'expand' })
  }
  return { ok: true, text: `the builders finished expanding ${name}: ${clampText(r.patch.summary, 140)} It is under construction now` }
}
