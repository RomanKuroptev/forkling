import { daysSinceCare, validatePlacePatch } from '@forkling/sim'
import { kit } from '@forkling/schema/kit'
import { clampText } from '../decision.ts'
import { claimsHuman } from '../honesty.ts'
import { REVISIT_MAX_TOKENS, RevisitAnswer, buildRevisitUser, readSouvenirs, souvenirsSince, toRevisitPatch } from '../builds/revisit.ts'
import type { Tick } from './context.ts'
import { recentTitles } from './mind-step.ts'

/** A revisit step that has run its time: one Haiku call, and the place changes only in its care time and one history line (spec 5.4). */
export async function revisitStep(t: Tick): Promise<void> {
  const pending = t.pendingRevisit
  if (!pending) return
  const { step } = pending
  const place = t.places.find((p) => p.id === step.targetId)
  if (!place) return
  const fail = (why: string) => {
    t.notes.push(`revisit ${place.id}: ${why}`)
    t.remember.push({ at: t.nowIso, kind: 'event', text: `My visit to ${place.name} did not work out (${clampText(why, 160)}).`, verb: 'revisit' })
  }
  const user = buildRevisitUser({
    place,
    reason: step.reason,
    daysSinceCare: daysSinceCare({ lastCareAt: place.state.lastCareAt, founded: place.founded }, t.nowMs),
    since: souvenirsSince(readSouvenirs(t.dir), place.state.lastCareAt),
    notes: recentTitles(t.dir),
  })
  const result = await t.ask('revisit', 'claude-haiku-5-5', user, RevisitAnswer, REVISIT_MAX_TOKENS)
  if (!result) return
  const answer = RevisitAnswer.safeParse(result.parsed)
  if (!answer.success) {
    t.notes.push(`no usable revisit (stopped: ${result.stopReason ?? 'unknown'})`)
    return
  }
  if (claimsHuman(answer.data.summary) || claimsHuman(answer.data.thought)) return fail('the words claimed to be human')
  const checked = validatePlacePatch(place, toRevisitPatch(answer.data), { kit, nowIso: t.nowIso })
  if (!checked.ok) return fail(checked.reasons.join('; '))
  t.placeUpdates.push(checked.place)
  t.places = t.places.map((p) => (p.id === place.id ? checked.place : p))
  t.remember.push({ at: t.nowIso, kind: 'made', text: `revisited ${place.name}: ${clampText(answer.data.thought, 300)}`, verb: 'revisit', goalRef: `today:${pending.index}` })
  t.parts.push(`revisited ${place.name}`)
}
