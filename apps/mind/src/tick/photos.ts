import { MAX_PHOTOS_PER_DAY, type PhotoShot, type WorldObject } from '@forkling/schema'
import { eyeShot } from '@forkling/sim'
import { clampText } from '../decision.ts'
import { enqueueShot, noticedSubject, shotIdFor } from '../photos.ts'
import type { Tick } from './context.ts'

/** A shot of what it is looking at is queued here, free. The frame is rendered and captioned after the tick. */
function queueShot(t: Tick, why: PhotoShot['why'], subject: WorldObject | undefined, reason: string, goalRef?: string): boolean {
  const { eye, look } = eyeShot({
    pos: t.body.pos,
    heading: t.body.heading,
    pack: t.pack,
    island: t.world.cfg,
    ...(subject ? { target: { position: subject.position, size: subject.properties.size } } : {}),
  })
  const taken = new Set([...t.w.art.map((a) => a.id), ...(t.mind.photos?.queue ?? []).map((s) => s.id)])
  const r2 = (n: number) => Math.round(n * 100) / 100
  const shot: PhotoShot = {
    id: shotIdFor(subject?.id, taken),
    at: t.nowIso,
    eye: [r2(eye[0]), r2(eye[1]), r2(eye[2])],
    look: [r2(look[0]), r2(look[1]), r2(look[2])],
    ...(subject ? { subjectId: subject.id } : {}),
    why,
    ...(goalRef ? { goalRef } : {}),
    reason: clampText(reason, 200),
  }
  const next = enqueueShot(t.mind, shot, t.today)
  if (!next) return false
  t.mind.photos = next
  return true
}

/** Seeing: a photograph step leaves a frame, and something new coming into view gets one on its own. */
export function photoStep(t: Tick): void {
  const { mind, nowIso } = t
  const pending = t.pendingPhoto
  if (pending) {
    const { step, index } = pending
    const subject = step.targetId ? t.objects.find((o) => o.id === step.targetId) : undefined
    if (queueShot(t, 'photograph', subject, step.reason, `today:${index}`)) {
      t.remember.push({ at: nowIso, kind: 'step', text: `Took a photo${subject ? ` of ${subject.name}` : ''}.`, verb: 'photograph', ...(subject ? { objectId: subject.id } : {}), goalRef: `today:${index}` })
      t.parts.push('took a photo')
    } else {
      t.notes.push(`photo limit reached (${MAX_PHOTOS_PER_DAY} a day): the photograph left no frame`)
    }
  }
  if (!t.asleep && t.triggers.some((x) => x.kind === 'novelty')) {
    // Something new came into view that it was not looking for.
    const photographed = new Set([...t.w.art, ...(mind.photos?.queue ?? [])].flatMap((a) => ('subjectId' in a && a.subjectId ? [a.subjectId] : 'content' in a && a.kind === 'photo' && a.content.subjectId ? [a.content.subjectId] : [])))
    const subject = noticedSubject({ objects: t.objects, known: new Set([...mind.knownObjects, ...photographed]), pos: t.body.pos, range: t.pack.perception.noticeRadius * 3 })
    if (subject && queueShot(t, 'noticed', subject, `${subject.name} is new here.`)) {
      t.remember.push({ at: nowIso, kind: 'event', text: `Noticed ${subject.name} and took a photo.`, objectId: subject.id })
    }
  }
}
