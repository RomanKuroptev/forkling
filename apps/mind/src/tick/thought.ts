import { THOUGHT_MAX_CHARS, ThoughtAnswer } from '@forkling/schema'
import { afterThought, requestReplan, type ThoughtOutcome } from '@forkling/sim'
import { clampText } from '../decision.ts'
import { claimsHuman } from '../honesty.ts'
import { stopFailure } from '../llm.ts'
import { buildThoughtUser } from '../prompts/thought.ts'
import { readStream } from '../stream.ts'
import { NO_CALL_REASONS } from './ask.ts'
import type { Tick } from './context.ts'
import { clock } from './util.ts'

/** A thought line and a few scores: a short answer, with room for the model to think first. */
export const THOUGHT_MAX_TOKENS = 600
/** The most events a thought tick is shown. */
const MAX_EVENTS = 20

/**
 * One thought tick (spec 2.2): Haiku at low effort reads the step, the new events and its last five lines, and answers
 * with a line, importance scores, a surprise and one of continue, replan or notice. It writes nothing but a stream
 * entry and its own bookkeeping, and never touches the plan, a goal or a file of the world. The loop decides when one is
 * due (`thoughtDue` in the sim); this only makes it.
 */
export async function thoughtTick(t: Tick): Promise<void> {
  const { mind, notes, goals } = t
  const since = mind.thought?.lastAt ? Date.parse(mind.thought.lastAt) : -Infinity
  const events = readStream(t.dir, t.today)
    .filter((e) => e.kind !== 'thought' && Date.parse(e.at) > since)
    .slice(-MAX_EVENTS)
  const stepOf = goals.now ? goals.today?.steps[goals.now.index] : undefined
  const user = buildThoughtUser({
    step: stepOf && goals.now ? { verb: stepOf.verb, target: stepOf.targetId ?? null, reason: stepOf.reason, until: clock(t.tz, Date.parse(goals.now.until)) } : null,
    events: events.map((e) => ({ id: e.id, text: e.text })),
    recent: mind.thought?.recent ?? [],
    wants: [],
  })

  const before = t.attempts.length
  const result = await t.ask('thought', 'claude-haiku-5-5', user, ThoughtAnswer, THOUGHT_MAX_TOKENS)
  const done = (outcome: ThoughtOutcome) => {
    mind.thought = afterThought(mind.thought, outcome, t.nowMs)
  }

  if (!result) {
    // No call was made (no key, the budget, a long prompt), or it threw. Only the second is a failure.
    const attempt = t.attempts[before]
    return done(attempt && !attempt.ok && !NO_CALL_REASONS.has(attempt.error ?? '') ? { ok: false } : { skipped: true })
  }
  const answer = result.parsed
  if (!answer || stopFailure(result.stopReason, answer)) return done({ ok: false })

  const line = clampText(answer.thought.trim(), THOUGHT_MAX_CHARS)
  if (!line || claimsHuman(line)) {
    notes.push('a thought line was thrown away: it claimed to be human')
    return done({ ok: false })
  }

  const shown = new Set(events.map((e) => e.id))
  const scored = answer.scores.filter((s) => shown.has(s.id)).slice(0, 20)
  t.remember.push({ at: t.nowIso, kind: 'thought', text: line, ...(scored.length > 0 ? { scored } : {}), surprise: answer.surprise })
  done({ ok: true, line })

  if (answer.action === 'replan') {
    const reason = answer.reason?.trim()
    if (!reason) notes.push('a thought said replan without a reason: ignored')
    else {
      const asked = requestReplan(mind.thought, { today: t.today, reason, at: t.nowIso })
      if (asked) mind.thought = asked
      else notes.push('a thought asked for a replan, but the 4 allowed today are used')
    }
  }
}
