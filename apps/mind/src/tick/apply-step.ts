import { addXp, applyStep, eventsFromStep, scoreSurprise, skillLevel } from '@forkling/sim'
import type { Tick } from './context.ts'
import { describeEvent, PAST } from './describe.ts'
import { spotsFor } from './create.ts'
import { intentionSeed } from './util.ts'

/** Strong needs wake the model at most this often. */
const NEED_COOLDOWN_MS = 30 * 60_000

/** Scores what is surprising, then lands the effect of a step whose time is up: what it gathered, made or ate becomes true here. */
export function finishStep(t: Tick): void {
  const { forkling, goals, mind, pack, nowMs, nowIso, asleep, body } = t
  t.triggers = scoreSurprise({ forkling: { ...forkling, needs: body.needs }, goals, mindState: mind, objects: t.objects, events: t.events, nowMs, asleep, spotKinds: t.spotKeys })
  if (mind.lastThinkAt && nowMs - Date.parse(mind.lastThinkAt) < NEED_COOLDOWN_MS) t.triggers = t.triggers.filter((x) => x.kind !== 'need')

  const finishing = goals.now ? goals.today?.steps[goals.now.index] : undefined
  if (finishing && goals.now && t.triggers.some((x) => x.kind === 'stepDone') && mind.appliedStepAt !== goals.now.startedAt && !asleep) {
    mind.appliedStepAt = goals.now.startedAt
    const verb = pack.actions.find((a) => a.id === finishing.verb)
    if (verb) {
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
        t.skills = addXp(t.skills, result.group, result.xp)
        if (verb.artifact === 'photo') t.pendingPhoto = { step: finishing, index: goals.now.index }
        else if (verb.artifact === 'code') t.pendingCode = { step: finishing, index: goals.now.index }
        else if (verb.artifact) t.pendingArt = { kind: verb.artifact, verb: verb.id, step: finishing, index: goals.now.index }
        if (verb.effect === 'read' || verb.effect === 'study') t.pendingReading = { depth: verb.effect === 'study' ? 4 : 1, topic: finishing.topic ?? null }
        for (const id of result.upserted) {
          t.touched.add(id)
          t.gone.delete(id)
        }
        for (const id of result.removed) {
          t.gone.add(id)
          t.touched.delete(id)
        }
        // Things it made itself are not news to it.
        mind.knownObjects = [...new Set([...mind.knownObjects, ...result.upserted])]
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
        t.notes.push(`step ${goals.now.index + 1} (${finishing.verb}) could not happen: ${result.reason}`)
        t.justNow.push(`${finishing.verb} did not work out: ${result.reason}`)
        t.remember.push({ at: nowIso, kind: 'event', text: `${finishing.verb} did not work out: ${result.reason}`, verb: finishing.verb })
        t.appraisals.push({ kind: 'blocked' })
        t.triggers = [...t.triggers, { kind: 'blocked', score: 0.9, detail: `${finishing.verb} did not work out: ${result.reason}` }]
      }
    }
  }
  t.objectIds = new Set(t.objects.map((o) => o.id))
}
