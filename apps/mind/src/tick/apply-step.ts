import type { PlanStep, SpeciesAction } from '@forkling/schema'
import { addXp, applyStep, eventsFromStep, fixableNeeds, hourInZone, scoreSurprise, skillLevel } from '@forkling/sim'
import type { Tick } from './context.ts'
import { describeEvent, PAST } from './describe.ts'
import { spotsFor } from './create.ts'
import { intentionSeed } from './util.ts'

/** Strong needs wake the model at most this often. */
const NEED_COOLDOWN_MS = 30 * 60_000
/** A step's effect and practice land only when the body spent this much of the step's minutes on its verb. */
export const MIN_WORKED_SHARE = 0.6
const MAX_BROKEN_OFF = 30

const minutesOf = (seconds: number) => Math.round(seconds / 60)
const enough = (step: PlanStep, workedSec: number) => workedSec >= step.minutes * 60 * MIN_WORKED_SHARE

/** The step is over without what it said: nothing was gathered, made or learned, and the record says so. */
function leaveUnfinished(t: Tick, step: PlanStep, workedSec: number): void {
  const text = `Left ${step.verb} unfinished: the body spent ${minutesOf(workedSec)} of ${step.minutes} minutes on it.`
  t.remember.push({ at: t.nowIso, kind: 'event', text, verb: step.verb })
  t.justNow.push(text)
  t.parts.push(`left ${step.verb} unfinished`)
}

/**
 * The step's effect becomes true: what it gathered, made or ate, the practice for the minutes the body really spent, and,
 * when `queue` is set, the side calls that follow a finished step (art, reading, a photo, a brief for the builder).
 */
function landStep(t: Tick, finishing: PlanStep, index: number, verb: SpeciesAction, workedSec: number, queue: boolean): void {
  const { forkling, nowMs, nowIso, body } = t
  const before = t.objects
  const result = applyStep({ holding: t.holding, stored: t.stored, position: { x: body.pos.x, z: body.pos.z }, objects: t.objects }, finishing, verb, {
    nowMs,
    skill: skillLevel(t.skills, verb.group),
    seed: intentionSeed(forkling.seed, nowMs),
  })
  if (result.ok) {
    t.holding = result.world.holding
    t.stored = result.world.stored
    t.objects = [...result.world.objects]
    t.skills = addXp(t.skills, result.group, minutesOf(workedSec))
    if (queue) {
      if (verb.artifact === 'photo') t.pendingPhoto = { step: finishing, index }
      else if (verb.artifact === 'code') t.pendingCode = { step: finishing, index }
      else if (verb.artifact) t.pendingArt = { kind: verb.artifact, verb: verb.id, step: finishing, index }
      if (verb.effect === 'read' || verb.effect === 'study') t.pendingReading = { depth: verb.effect === 'study' ? 4 : 1, topic: finishing.topic ?? null }
    }
    for (const id of result.upserted) {
      t.touched.add(id)
      t.gone.delete(id)
    }
    for (const id of result.removed) {
      t.gone.add(id)
      t.touched.delete(id)
    }
    // Things it made itself are not news to it.
    t.mind.knownObjects = [...new Set([...t.mind.knownObjects, ...result.upserted])]
    t.appraisals.push(...eventsFromStep(result.events, [...before, ...t.objects]))
    t.justNow.push(...result.events.map((e) => describeEvent(e, [...before, ...t.objects])))
    for (const e of result.events) {
      t.remember.push({
        at: nowIso,
        kind: e.kind === 'finished' ? 'made' : 'step',
        text: `${finishing.verb}: ${describeEvent(e, [...before, ...t.objects])}`,
        verb: finishing.verb,
        ...(e.objectId ? { objectId: e.objectId } : {}),
      })
    }
    if (result.events.length > 0) t.parts.push(`${finishing.verb}: ${result.events.map((e) => PAST[e.kind]).join(', ')}`)
    t.spotKeys = spotsFor(t, t.objects)
  } else {
    t.failed = true
    t.notes.push(`step ${index + 1} (${finishing.verb}) could not happen: ${result.reason}`)
    t.justNow.push(`${finishing.verb} did not work out: ${result.reason}`)
    t.remember.push({ at: nowIso, kind: 'event', text: `${finishing.verb} did not work out: ${result.reason}`, verb: finishing.verb })
    t.appraisals.push({ kind: 'blocked' })
    t.triggers = [...t.triggers, { kind: 'blocked', score: 0.9, detail: `${finishing.verb} did not work out: ${result.reason}` }]
  }
}

/**
 * Scores what is surprising, adds the body's time on the step, then lands the effect of a step whose time is up, but only
 * if the body really spent most of it on that verb. A step that fell short is given its time again once, then ends
 * unfinished with nothing gathered, made or learned, so the files never say more than the body did.
 */
export function finishStep(t: Tick): void {
  const { forkling, goals, mind, pack, nowMs, asleep, body } = t
  // What the body can do for itself, between steps, is routine and never a reason to think.
  const fixable = fixableNeeds(pack, { visitorDistance: null, timeOfDay: hourInZone(t.tz, nowMs), asleep, spotKinds: t.spotKeys })
  t.triggers = scoreSurprise({ forkling: { ...forkling, needs: body.needs }, goals, mindState: mind, objects: t.objects, events: t.events, nowMs, asleep, spotKinds: t.spotKeys, fixableNeeds: fixable })
  if (mind.lastThinkAt && nowMs - Date.parse(mind.lastThinkAt) < NEED_COOLDOWN_MS) t.triggers = t.triggers.filter((x) => x.kind !== 'need')

  const finishing = goals.now ? goals.today?.steps[goals.now.index] : undefined
  if (goals.now && finishing && !asleep) {
    goals.now.workedSec = Math.round(((goals.now.workedSec ?? 0) + t.worked) * 10) / 10
    // What broke the step off, for the next time the mind is asked.
    if (t.drift.length > 0) mind.brokenOff = [...mind.brokenOff, ...t.drift.map((d) => ({ step: finishing.verb, ...d }))].slice(-MAX_BROKEN_OFF)
  }

  if (finishing && goals.now && t.triggers.some((x) => x.kind === 'stepDone') && mind.appliedStepAt !== goals.now.startedAt && !asleep) {
    const worked = goals.now.workedSec ?? 0
    if (!enough(finishing, worked) && !goals.now.extended) {
      goals.now.extended = true
      goals.now.until = new Date(Date.parse(goals.now.until) + finishing.minutes * 60_000).toISOString()
      t.notes.push(`step ${goals.now.index + 1} (${finishing.verb}) has had ${minutesOf(worked)} of ${finishing.minutes} minutes of the body's time: given the same again`)
      t.triggers = t.triggers.filter((x) => x.kind !== 'stepDone' && x.kind !== 'replan')
    } else {
      mind.appliedStepAt = goals.now.startedAt
      const verb = pack.actions.find((a) => a.id === finishing.verb)
      if (!enough(finishing, worked)) leaveUnfinished(t, finishing, worked)
      else if (verb) landStep(t, finishing, goals.now.index, verb, worked, true)
    }
  }
  t.objectIds = new Set(t.objects.map((o) => o.id))
}

/**
 * A new plan takes over in the middle of a step. If the body had done most of it, what it did still counts, except that
 * its artifact is not made; otherwise it is left unfinished. Either way it happens once.
 */
export function leaveStep(t: Tick): void {
  const { goals, mind, pack, asleep, nowMs } = t
  const step = goals.now ? goals.today?.steps[goals.now.index] : undefined
  if (!goals.now || !step || asleep || mind.appliedStepAt === goals.now.startedAt) return
  // A step that ran out was dealt with when it did.
  if (nowMs >= Date.parse(goals.now.until)) return
  mind.appliedStepAt = goals.now.startedAt
  const worked = goals.now.workedSec ?? 0
  const verb = pack.actions.find((a) => a.id === step.verb)
  if (enough(step, worked) && verb && !verb.artifact) landStep(t, step, goals.now.index, verb, worked, false)
  else leaveUnfinished(t, step, worked)
}
