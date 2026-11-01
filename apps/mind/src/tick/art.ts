import type { z } from 'zod'
import { ArtOutput } from '@forkling/schema'
import { skillLevel } from '@forkling/sim'
import { artifactFrom, buildArtUser, MAX_ARTIFACTS_PER_DAY } from '../art.ts'
import { runContraption } from '../physics.ts'
import type { Tick } from './context.ts'

export const MAX_ART_TOKENS = 3000

/** Making things: when a creative step finishes, one Haiku call writes what it made to art/. Skill sets how good it is. */
export async function artStep(t: Tick): Promise<void> {
  const { notes, nowIso, today, mind, w } = t
  const pending = t.pendingArt
  if (pending) {
    if (t.arts.count >= MAX_ARTIFACTS_PER_DAY) {
      notes.push(`art limit reached (${MAX_ARTIFACTS_PER_DAY} a day): ${pending.verb} left nothing behind`)
    } else {
      const { kind, step: made, index } = pending
      // A contraption is run here, headless, so what is recorded is what the physics did: the model only says what it thought.
      let run: { objectId: string; name: string; moved: boolean; maxTravel: number; settled: boolean } | null = null
      if (kind === 'contraption') {
        const mechanism = t.objects.find((o) => o.id === made.targetId)
        const outcome = mechanism ? await runContraption(mechanism) : null
        if (mechanism && outcome) {
          run = { objectId: mechanism.id, name: mechanism.name, moved: outcome.moved, maxTravel: outcome.maxTravel, settled: outcome.settled }
          const ran = { ...mechanism, contraption: { ...mechanism.contraption!, lastRun: { at: nowIso, moved: outcome.moved, maxTravel: outcome.maxTravel, settled: outcome.settled } } }
          t.objects = t.objects.map((o) => (o.id === mechanism.id ? ran : o))
          t.touched.add(mechanism.id)
        }
      }
      if (kind === 'contraption' && !run) {
        notes.push(`tinker: ${made.targetId ?? 'its target'} is not a mechanism: nothing to run`)
      } else {
        const user = buildArtUser({
          kind,
          topic: made.topic ?? t.interests.current?.topic ?? null,
          reason: made.reason,
          skillLevel: skillLevel(t.skills, 'mind'),
          obsession: t.interests.current?.topic ?? null,
          recentTitles: [...w.art].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5).map((a) => a.title),
          interests: t.interests,
          temperament: t.temperament,
          date: today,
          run: run ?? undefined,
        })
        const result = await t.ask('art', 'claude-haiku-5-5', user, ArtOutput[kind] as z.ZodType<unknown>, MAX_ART_TOKENS)
        if (result && !result.parsed) {
          notes.push(`no usable ${kind} (stopped: ${result.stopReason ?? 'unknown'})`)
        } else if (result) {
          const art = artifactFrom(kind, result.parsed as never, {
            skillLevel: skillLevel(t.skills, 'mind'),
            goalRef: `today:${index}`,
            obsessionRef: t.interests.current?.topic,
            nowIso,
            takenIds: new Set(w.art.map((a) => a.id)),
            ...(run ? { contraption: run } : {}),
          })
          if (art) {
            t.madeArt.push(art)
            t.arts = { ...t.arts, count: t.arts.count + 1 }
            t.remember.push({ at: nowIso, kind: 'made', text: `Made a ${kind}: "${art.title}"`, verb: pending.verb, goalRef: `today:${index}` })
            t.justNow.push(`made a ${kind}: "${art.title}"`)
            t.parts.push(`made a ${kind}`)
          } else {
            notes.push(`the ${kind} it made was not usable`)
          }
        }
      }
    }
  }
  if (t.arts.count !== (mind.arts?.count ?? 0) || (t.arts.count > 0 && mind.arts?.date !== today)) mind.arts = t.arts
}
