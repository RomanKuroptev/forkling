import type { BuildRequest } from '@forkling/schema'
import { hourInZone } from '@forkling/sim'
import { canSpend } from '../budget.ts'
import { buildIdFor, checkBuildRequest } from '../builds.ts'
import { clampText } from '../decision.ts'
import type { Tick } from './context.ts'
import { leaveStep } from './apply-step.ts'
import { checkPlan, startStep } from './plan.ts'

/** What a design call may cost, held back before a request is accepted. */
const DESIGN_ESTIMATE_USD = 0.02
/** A late night is only a choice for the evening. */
const LATE_NIGHT_FROM_HOUR = 18
/** After a plan came back empty or was turned down, a new one is not asked for before this long. */
export const REPLAN_COOLDOWN_MS = 60 * 60_000

/** What the mind decided becomes true: goals, a design request, a late night, and the plan if the body can carry it out. */
export function applyDecision(t: Tick): void {
  const { decision, thinkKind, goals, mind, parts, notes, remember, nowIso, nowMs, today, tz, asleep, triggers, events, w } = t
  if (!decision) return
  parts.push(thinkKind === 'morning' ? 'morning plan' : thinkKind === 'weekly' ? 'weekly review' : `thought about ${triggers[0]!.kind}`)

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
      // Saying the same goal again is not a review: only the weekly review, or a goal that changed, moves the date.
      reviewedAt: same && thinkKind !== 'weekly' ? goals.long!.reviewedAt : nowIso,
    }
    if (w.goals.long?.text !== text) parts.push('new long goal')
  } else if (thinkKind === 'weekly' && goals.long) {
    goals.long = { ...goals.long, reviewedAt: nowIso }
  }

  // The plan is checked first, against what was left before a design takes the build slot: both may be in one answer.
  const planned = decision.plan && decision.plan.length > 0 ? checkPlan(t, decision.plan) : null

  if (decision.design?.name.trim() && decision.design.purpose.trim() && !t.deps.dryRun) {
    const verdict = checkBuildRequest({ state: mind, today, asleep, canAfford: canSpend(t.budget, DESIGN_ESTIMATE_USD) })
    if (verdict.ok) {
      const name = clampText(decision.design.name.trim(), 60)
      const request: BuildRequest = {
        id: buildIdFor(name, new Set(t.objects.map((o) => o.id))),
        kind: 'object',
        name,
        purpose: clampText(decision.design.purpose.trim(), 300),
        contraption: decision.design.contraption === true,
        ...(goals.now ? { goalRef: `today:${goals.now.index}` } : {}),
        requestedAt: nowIso,
      }
      t.buildRequests.push(request)
      mind.openBuild = { id: request.id, kind: request.kind, requestedAt: nowIso }
      mind.builds = { date: today, count: (mind.builds?.date === today ? mind.builds.count : 0) + 1 }
      remember.push({ at: nowIso, kind: 'event', text: `Asked for ${request.name} to be built: ${request.purpose}`, ...(request.goalRef ? { goalRef: request.goalRef } : {}) })
      parts.push(`asked for ${request.name}`)
    } else {
      notes.push(`design not asked for: ${verdict.reason}`)
    }
  }

  if (decision.stayUpLate?.trim() && !asleep && hourInZone(tz, nowMs) >= LATE_NIGHT_FROM_HOUR) {
    t.lateNight = today
    mind.lateNightReason = clampText(decision.stayUpLate.trim(), 200)
    parts.push('staying up late')
  }

  // What the mind took in and thought, for the day's stream.
  for (const x of triggers) {
    if (x.kind === 'novelty' || x.kind === 'blocked' || x.kind === 'need') remember.push({ at: nowIso, kind: 'trigger', text: x.detail })
  }
  for (const e of events) remember.push({ at: nowIso, kind: 'visitor', text: `A visitor left a ${e.type}.` })
  if (decision.thought.trim()) remember.push({ at: nowIso, kind: 'thought', text: decision.thought.trim() })

  // What the mind took in counts for how it feels: something new, a need running low, a plan that did not work out.
  for (const x of triggers) {
    if (x.kind === 'novelty' || x.kind === 'need' || (x.kind === 'blocked' && !t.failed)) t.appraisals.push({ kind: x.kind })
  }

  if (thinkKind === 'morning') mind.lastPlanDate = today
  // A weekly review looks at the long goal, not at the beach, so what is new stays new until it is looked at.
  if (thinkKind === 'morning' || thinkKind === 'decide') {
    mind.knownObjects = [...new Set([...mind.knownObjects, ...t.objects.map((o) => o.id)])]
    mind.seenEventTypes = [...new Set([...mind.seenEventTypes, ...events.map((e) => e.type)])]
  }
  // A step whose target was gone has been asked about, so it is not asked about again.
  if (goals.now && triggers.some((x) => x.kind === 'blocked')) mind.blockedStep = goals.now.startedAt
  const replanAfter = new Date(nowMs + REPLAN_COOLDOWN_MS).toISOString()

  if (planned) {
    const { usable, check } = planned
    if (check.ok) {
      t.planPage = true
      // A plan that takes over in the middle of a step settles the old step first.
      leaveStep(t)
      goals.today = { date: today, steps: usable, reason: clampText((decision.planReason ?? decision.thought).trim() || 'This is what I feel like doing.', 200) }
      delete mind.replanAfter
      startStep(t, 0, decision.thought)
      if (thinkKind !== 'morning') parts.push('new plan')
    } else {
      mind.rejections = [...mind.rejections, { at: nowIso, reasons: check.reasons.slice(0, 8) }].slice(-10)
      notes.push(`plan rejected: ${check.reasons.join('; ')}`)
      remember.push({ at: nowIso, kind: 'rejected', text: `A plan was turned down: ${check.reasons[0] ?? 'it could not be carried out'}` })
      parts.push('plan rejected')
      mind.replanAfter = replanAfter
      // The body goes on with the plan it has, unless that is from another day: then it falls back on its own judgement.
      if (!goals.today || goals.today.date !== today) {
        delete goals.today
        delete goals.now
      }
    }
  } else if (triggers.some((x) => x.kind === 'replan')) {
    // It was asked for a plan and wants none: it is left to itself for a while before it is asked again.
    mind.replanAfter = replanAfter
  }
}
