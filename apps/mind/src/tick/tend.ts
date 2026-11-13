import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Souvenir } from '@forkling/schema'
import { kit } from '@forkling/schema/kit'
import { daysSinceCare, validatePlacePatch } from '@forkling/sim'
import { clampText } from '../decision.ts'
import { claimsHuman } from '../honesty.ts'
import { TEND_MAX_TOKENS, TendAnswer, buildTendUser, pileSouvenirs, refFile, shelvedWorks, toTendPatch } from '../builds/tend.ts'
import type { Tick } from './context.ts'

const readSouvenir = (dir: string, id: string): Souvenir | null => {
  try {
    const parsed = Souvenir.safeParse(JSON.parse(readFileSync(join(dir, 'souvenirs', `${id}.json`), 'utf8')))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** A tend step that has run its time: one call, a patch checked by code, and only then a file changes (spec 2.4, 5.4, 11). */
export async function tendStep(t: Tick): Promise<void> {
  const pending = t.pendingTend
  if (!pending) return
  const { step } = pending
  const place = t.places.find((p) => p.id === step.targetId)
  if (!place) return
  const name = place.name
  const fail = (why: string) => {
    t.notes.push(`tend ${place.id}: ${why}`)
    t.remember.push({ at: t.nowIso, kind: 'event', text: `My tend of ${name} was turned down (${clampText(why, 160)}), so nothing changed.`, verb: 'tend' })
    t.justNow.push(`Your tend of ${name} did not work: ${clampText(why, 160)}`)
  }
  const user = buildTendUser({
    place,
    kit,
    reason: step.reason,
    daysSinceCare: daysSinceCare({ lastCareAt: place.state.lastCareAt, founded: place.founded }, t.nowMs),
    pile: pileSouvenirs(t.dir),
    works: shelvedWorks(t.dir),
  })
  const model = step.deep ? 'claude-sonnet-5-5' : 'claude-haiku-5-5'
  const result = await t.ask('tend', model, user, TendAnswer, TEND_MAX_TOKENS)
  if (!result) return
  const answer = TendAnswer.safeParse(result.parsed)
  if (!answer.success) {
    t.notes.push(`no usable tend (stopped: ${result.stopReason ?? 'unknown'})`)
    t.remember.push({ at: t.nowIso, kind: 'event', text: `My tend of ${name} gave nothing usable, so nothing changed.`, verb: 'tend' })
    return
  }
  const words = [answer.data.summary, answer.data.sign ?? '', ...answer.data.labels.map((l) => l.label), ...answer.data.exhibits.map((e) => e.label ?? '')]
  if (words.some((w) => claimsHuman(w))) return fail('the words claimed to be human')
  const converted = toTendPatch(answer.data)
  if (!converted.ok) return fail(converted.reason)
  const checked = validatePlacePatch(place, converted.patch, {
    kit,
    nowIso: t.nowIso,
    placeIds: new Set(t.places.map((p) => p.id)),
    exists: (ref) => {
      const f = refFile(ref)
      return f !== null && existsSync(join(t.dir, f))
    },
    souvenirKind: (ref) => (ref.startsWith('souvenirs/') ? readSouvenir(t.dir, ref.slice('souvenirs/'.length))?.kind : undefined),
  })
  if (!checked.ok) return fail(checked.reasons.join('; '))

  const placed = (p: { exhibits: { kind: string; ref: string | null }[] }) => new Set(p.exhibits.filter((e) => e.kind === 'souvenir' && e.ref).map((e) => e.ref!.slice('souvenirs/'.length)))
  const before = placed(place)
  const after = placed(checked.place)
  for (const id of after) if (!before.has(id)) setPlaced(t, id, place.id)
  for (const id of before) if (!after.has(id)) setPlaced(t, id, null)

  t.placeUpdates.push(checked.place)
  t.places = t.places.map((p) => (p.id === place.id ? checked.place : p))
  t.remember.push({ at: t.nowIso, kind: 'made', text: `tended ${name}: ${clampText(converted.patch.summary, 140)}`, verb: 'tend', goalRef: `today:${pending.index}` })
  t.parts.push(`tended ${name}`)
}

function setPlaced(t: Tick, id: string, placeId: string | null): void {
  const s = readSouvenir(t.dir, id)
  if (s) t.souvenirUpdates.push({ ...s, placedIn: placeId })
}
