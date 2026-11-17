import { hourInZone, REJECTS_BEFORE_HOLD, REPLAN_HOLD_MS, SAME_TOPIC_REASON } from '@forkling/sim'
import { clampText } from '../decision.ts'
import type { Tick } from './context.ts'
import { leaveStep } from './apply-step.ts'
import { checkPlan, startStep } from './plan.ts'
import { flagGoalClosed } from './variety.ts'

/** A late night is only a choice for the evening. */
const LATE_NIGHT_FROM_HOUR = 18
/** After a plan came back empty or was turned down, a new one is not asked for before this long. */
export const REPLAN_COOLDOWN_MS = 60 * 60_000

/** What the mind decided becomes true: goals, a design request, a late night, and the plan if the body can carry it out. */
export function applyDecision(t: Tick): void {
  const { decision, thinkKind, goals, mind, parts, notes, remember, nowIso, nowMs, today, tz, asleep, triggers, w } = t
  if (!decision) return
  parts.push(thinkKind === 'morning' ? 'morning plan' : `thought about ${triggers[0]!.kind}`)

  if (decision.dropLongGoal && goals.long) {
    delete goals.long
    parts.push('gave up the long goal')
  }
  const newGoal = decision.longGoal && decision.longGoal.text.trim() ? decision.longGoal : null
  if (newGoal) {
    const text = clampText(newGoal.text.trim(), 300)
    const same = goals.long?.text === text
    goals.long = {
      text,
      reason: clampText(newGoal.reason.trim() || 'It is what I want now.', 200),
      setAt: same ? goals.long!.setAt : nowIso,
      // Saying the same goal again is not a review: only the weekly review (spec 9.5), or a goal that changed, moves the date.
      reviewedAt: same ? goals.long!.reviewedAt : nowIso,
    }
    if (w.goals.long?.text !== text) parts.push('new long goal')
  }

  const planned = decision.plan && decision.plan.length > 0 ? checkPlan(t, decision.plan) : null

  if (decision.stayUpLate?.trim() && !asleep && hourInZone(tz, nowMs) >= LATE_NIGHT_FROM_HOUR) {
    t.lateNight = today
    mind.lateNightReason = clampText(decision.stayUpLate.trim(), 200)
    parts.push('staying up late')
  }

  // What the mind took in and thought, for the day's stream.
  for (const x of triggers) {
    if (x.kind === 'sparked') remember.push({ at: nowIso, kind: 'trigger', text: x.detail })
  }
  if (decision.thought.trim()) remember.push({ at: nowIso, kind: 'thought', text: decision.thought.trim() })

  if (thinkKind === 'morning') mind.lastPlanDate = today
  // Any decide call answers a spark that was waiting.
  if ((thinkKind === 'morning' || thinkKind === 'decide') && mind.sparked?.pending) mind.sparked = { date: today, count: (mind.sparked.date === today ? mind.sparked.count : 0) + 1, pending: null }
  // A decide call is shown every note found so far, so none is announced again; the trigger waits 30 minutes (spec 2.3).
  if (thinkKind === 'morning' || thinkKind === 'decide') {
    if (triggers.some((x) => x.kind === 'note')) mind.lastNoteTriggerAt = nowIso
    mind.notesWaiting = []
  }
  // Any decide call answers a reflection that was waiting (spec 2.3: each reflection once).
  if ((thinkKind === 'morning' || thinkKind === 'decide') && mind.reflect?.pending) mind.reflect = { ...mind.reflect, pending: null }
  // The mind has been told what broke its steps off; the count starts again.
  mind.brokenOff = []
  const replanAfter = new Date(nowMs + REPLAN_COOLDOWN_MS).toISOString()

  if (planned) {
    const { usable, check } = planned
    if (planned.droppedStarts.length > 0) notes.push(`wander removed from the plan (a trip already started from it today): ${planned.droppedStarts.join(', ')}`)
    if (check.ok) {
      t.planPage = true
      // A plan that takes over in the middle of a step settles the old step first.
      leaveStep(t)
      goals.today = { date: today, steps: usable, reason: clampText((decision.planReason ?? decision.thought).trim() || 'This is what I feel like doing.', 200) }
      delete mind.replanAfter
      delete mind.planRejects
      startStep(t, 0, decision.thought)
      if (thinkKind !== 'morning') parts.push('new plan')
    } else {
      mind.rejections = [...mind.rejections, { at: nowIso, reasons: check.reasons.slice(0, 8) }].slice(-10)
      // Plans turned down in a row: after 2 no replan is asked for until 60 minutes pass, and the call that is then allowed starts the count again.
      const prev = mind.planRejects
      const fresh = !prev || (prev.count >= REJECTS_BEFORE_HOLD && nowMs - Date.parse(prev.lastAt) >= REPLAN_HOLD_MS)
      mind.planRejects = { count: fresh ? 1 : prev.count + 1, lastAt: nowIso }
      if (check.reasons.some((r) => r.includes(SAME_TOPIC_REASON))) flagGoalClosed(t)
      notes.push(`plan rejected: ${check.reasons.join('; ')}`)
      parts.push('plan rejected')
      mind.replanAfter = replanAfter
      // The body goes on with the plan it has, unless that is from another day: then it falls back on its own judgement.
      if (!goals.today || goals.today.date !== today) {
        delete goals.today
        delete goals.now
      }
    }
  } else if (triggers.some((x) => x.kind === 'replan') && !mind.thought?.replanRequest) {
    // It was asked for a plan and wants none: it is left to itself for a while before it is asked again.
    mind.replanAfter = replanAfter
  }
  // Build results the call was told about are answered once, whatever it decided (a failed call never gets here).
  if (mind.jobs && mind.jobs.pending.length > 0) mind.jobs.pending = []
  // What Roman said has been shown to the call once, and is forgotten.
  if (mind.fromRoman && mind.fromRoman.length > 0) mind.fromRoman = []
  // A replan a thought asked for is answered by this call, whatever it decided (a failed call never gets here).
  if (mind.thought?.replanRequest) delete mind.thought.replanRequest
}
