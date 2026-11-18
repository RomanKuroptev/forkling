import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ExpandJob, type JobResult, type Souvenir, type WishDraft } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { addWakingMs, addWishes, expandAllowed, expandEarned, finishedBuildings, interestFamilies, type ExpandEarned, validatePlacePatch } from '@forkling/sim'
import { pendingJobs } from '../build-worker.ts'
import { paceAhead } from '../budget.ts'
import { refFile } from '../builds/tend.ts'
import { readAllSouvenirs } from '../builds/works.ts'
import { clampText } from '../decision.ts'
import { readWishes } from '../wishes.ts'
import type { Tick } from './context.ts'
import { rememberJobWant } from './wants.ts'

/** Spec 4.5: an accepted expand starts a construction of 3 hours of waking time. */
export const EXPAND_CONSTRUCTION_MS = 3 * 3_600_000

/**
 * A call's wishes (spec 5.3, 10.3): wishing a part that is open adds to its count, a new part is a new wish, and with 5 open a new
 * one is dropped and noted. Written to `wishes/` with the tick.
 */
export function recordWishes(t: Tick, drafts: readonly WishDraft[], label: string): void {
  if (drafts.length === 0) return
  const known = new Map(readWishes(t.dir).map((w) => [w.id, w]))
  for (const w of t.wishUpdates) known.set(w.id, w)
  const added = addWishes([...known.values()], drafts, t.nowIso)
  for (const w of added.wishes) t.wishUpdates = [...t.wishUpdates.filter((x) => x.id !== w.id), w]
  if (added.dropped.length > 0) t.notes.push(`${label}: ${added.dropped.length} wish(es) dropped, 5 are already open: ${added.dropped.join(', ')}`)
}

/** When a construction that starts now ends: `ms` of waking time from now, the night not counted (spec 4.5). */
export function constructionEnd(t: Tick, ms: number): string {
  return new Date(addWakingMs(t.nowMs, ms, { seed: t.forkling.seed, timezone: t.tz, ...(t.forkling.lateNight ? { lateNight: t.forkling.lateNight } : {}) })).toISOString()
}

/** Every souvenir kept, those on disk and those kept earlier in this tick. */
function allSouvenirs(t: Tick): Souvenir[] {
  const seen = new Set<string>()
  return [...readAllSouvenirs(t.dir), ...t.newSouvenirs].filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
}

/**
 * The places that may be expanded (spec v4 2.2: not closed, not under construction), each with whether it has earned the lower price
 * and why. The last-expanded rail is the plan's and the step's own, so it is not applied here.
 */
export function expandablePlaces(t: Tick): { id: string; earned: ExpandEarned }[] {
  const souvenirs = allSouvenirs(t)
  const families = interestFamilies(t.interests)
  return t.places.flatMap((p) => (expandAllowed(p, null).ok ? [{ id: p.id, earned: expandEarned(p, families, souvenirs, p.exhibits) }] : []))
}

/**
 * A construction whose finish time has come ends (spec 4.5): it is cleared from the place file, and the place can be expanded
 * again. The finish time was worked out in waking time when it began, so the clock can be compared with it as it is. Runs
 * before the builders' results are taken in, so a result that arrives as a build ends is not turned away.
 */
export function finishConstruction(t: Tick): void {
  for (const place of finishedBuildings(t.places, t.nowMs)) {
    const done = { ...place, state: { ...place.state, construction: null } }
    t.placeUpdates.push(done)
    t.places = t.places.map((p) => (p.id === done.id ? done : p))
    const text = `${place.name} is finished: the building is done.`
    t.remember.push({ at: t.nowIso, kind: 'event', text, verb: place.state.construction?.kind ?? 'expand' })
    t.parts.push(`${place.name} is finished`)
  }
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
  if (paceAhead(t.budget, t.today, t.credits)) return rest("spending is ahead of the month's pace, so building waits")
  if (t.mind.lastExpandedPlace === place.id) return rest('it was the last place I expanded')
  const check = expandAllowed(place, null)
  if (!check.ok) return rest(check.reasons.join('; '))

  const base = `expand-${t.today.replaceAll('-', '')}-${t.nowIso.slice(11, 16).replace(':', '')}`
  let id = base
  for (let n = 2; existsSync(join(t.dir, 'mind/builds', `${id}.json`)) || existsSync(join(t.dir, 'mind/builds', `${id}.result.json`)); n++) id = `${base}-${n}`
  t.newJobs.push(ExpandJob.parse({ id, kind: 'expand', requestedAt: t.nowIso, placeId: place.id, reason: clampText(step.reason, 200) }))
  t.mind.lastExpandedPlace = place.id
  rememberJobWant(t, id, step.wantId)
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

  const check = expandAllowed(place, null)
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

  const finishesAt = constructionEnd(t, EXPAND_CONSTRUCTION_MS)
  const built = { ...checked.place, state: { ...checked.place.state, construction: { kind: 'expand' as const, finishesAt } } }
  t.placeUpdates.push(built)
  t.places = t.places.map((p) => (p.id === built.id ? built : p))

  recordWishes(t, r.wishes ?? [], `expand ${place.id}`)
  if (r.constraint?.refused) {
    t.remember.push({ at: t.nowIso, kind: 'event', text: clampText(`I refused the constraint "${r.constraint.text}" for ${name}: ${r.constraint.reason ?? ''}`, 300), verb: 'expand' })
  }
  return { ok: true, text: `the builders finished expanding ${name}: ${clampText(r.patch.summary, 140)} It is under construction now` }
}
