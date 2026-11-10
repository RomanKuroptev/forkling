import type { ModelId } from '../budget.ts'
import { Decision } from '../decision.ts'
import { buildUser } from '../prompts.ts'
import type { Tick } from './context.ts'
import { readRecentPast } from '../past.ts'
import { moodWords, PRICES } from '@forkling/sim'
import { checkPlan, STARTING_PLACES } from './plan.ts'
import { clock, weekday } from './util.ts'

/** The morning plan, the weekly review or a decision: one call, and one more if the body cannot carry out the plan. */
export async function think(t: Tick): Promise<void> {
  const { thinkKind, tz, nowMs, notes, window } = t
  if (!thinkKind || thinkKind === 'bedtime') return
  const model: ModelId = thinkKind === 'weekly' ? 'claude-sonnet-5-5' : 'claude-haiku-5-5'
  const user = buildUser({
    kind: thinkKind,
    forkling: t.forkling,
    goals: t.goals,
    mindState: t.mind,
    places: [...STARTING_PLACES],
    triggers: t.triggers,
    events: t.events,
    localTime: `${weekday(tz, nowMs)} ${t.today} ${clock(tz, nowMs)}`,
    wakeTime: clock(tz, window.wakeMs),
    bedTime: clock(tz, window.bedMs),
    hoursLeft: Math.max(0, Math.round((window.bedMs - nowMs) / 3_600_000)),
    allowance: { points: t.mind.allowance?.points ?? 0, prices: PRICES },
    mood: moodWords({ mood: t.mood, energy: t.energy }),
    justNow: t.justNow,
    beliefs: t.beliefs,
    memory: t.w.summary,
    interests: t.interests,
    past: readRecentPast(t.dir, t.today, t.w.art),
  })
  let asking = user
  // A plan the body cannot carry out gets one more chance, with the reasons, before the body falls back on itself.
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await t.ask(thinkKind, model, asking, Decision)
    if (!result) break
    if (!result.parsed) {
      notes.push(`no usable answer (stopped: ${result.stopReason ?? 'unknown'})`)
      t.mind.thinkFailedAt = t.nowIso
      break
    }
    t.decision = result.parsed
    t.thought = true
    const checked = t.decision.plan && t.decision.plan.length > 0 ? checkPlan(t, t.decision.plan) : null
    if (!checked || checked.check.ok || attempt === 1) break
    notes.push(`plan turned down (${checked.check.reasons.join('; ')}): asking again`)
    asking = [
      user,
      '',
      '## Your plan was turned down',
      'It cannot be carried out as written:',
      ...checked.check.reasons.map((r) => `- ${r}`),
      'Write the whole plan again so that every step can happen.',
    ].join('\n')
  }
}
