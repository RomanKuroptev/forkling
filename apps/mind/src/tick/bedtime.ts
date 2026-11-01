import { Reflection } from '@forkling/schema'
import { applyBeliefOps, checkReflection } from '@forkling/sim'
import { buildReflectionUser, renderJournal } from '../reflect.ts'
import { readStream } from '../stream.ts'
import type { Tick } from './context.ts'
import { clock, same, weekday } from './util.ts'

/** The diary and the belief changes take more room than a plan. */
const REFLECT_OUTPUT_TOKENS = 4000

/** Bedtime: the day goes into a diary entry and into what it believes. Only what the day's stream backs up is kept. */
export async function bedtime(t: Tick): Promise<void> {
  if (t.thinkKind !== 'bedtime') return
  const { evening, notes, mind, tz, nowMs, nowIso } = t
  const stream = readStream(t.dir, evening)
  if (stream.length === 0) {
    mind.lastReflectDate = evening
    notes.push('nothing to reflect on today: no call')
    return
  }
  const ids = new Set(stream.map((e) => e.id))
  let turnedDown: string[] | undefined
  for (let attempt = 0; attempt < 2; attempt++) {
    const user = buildReflectionUser({
      name: t.forkling.name,
      date: evening,
      localTime: `${weekday(tz, nowMs)} ${t.today} ${clock(tz, nowMs)}`,
      timeZone: tz,
      goals: t.goals,
      beliefs: t.beliefs,
      summary: t.w.summary,
      stream,
      ...(turnedDown ? { turnedDown } : {}),
    })
    const result = await t.ask('bedtime', 'claude-sonnet-5-5', user, Reflection, REFLECT_OUTPUT_TOKENS)
    if (!result) break
    if (!result.parsed) {
      notes.push(`no usable reflection (stopped: ${result.stopReason ?? 'unknown'})`)
      break
    }
    const checked = checkReflection(result.parsed, ids, t.beliefs)
    if (checked.retry && attempt === 0) {
      notes.push(`reflection turned down (${checked.dropped.length} unsupported claims): asking again`)
      turnedDown = checked.dropped
      continue
    }
    notes.push(...checked.dropped.map((d) => `claim dropped, ${d}`))
    const text = renderJournal(evening, checked.reflection)
    const before = t.beliefs
    t.beliefs = applyBeliefOps(t.beliefs, checked.reflection.beliefOps, nowIso)
    if (text) {
      t.journal = { date: evening, text }
      t.parts.push('wrote the journal')
    }
    const changed = t.beliefs.filter((b) => !same(b, before.find((o) => o.id === b.id))).length
    if (changed > 0) t.parts.push(`${changed} belief${changed === 1 ? '' : 's'} changed`)
    mind.lastReflectDate = evening
    break
  }
}
