import { ReflectionAnswer } from '@forkling/schema'
import { applyBeliefOps, applyWantEdits, checkInsights, checkReflection, fixedImportance, MAX_QUESTIONS, moodWords, QUESTION_MAX_CHARS, reflectDue, wantEditsFrom } from '@forkling/sim'
import { clampText } from '../decision.ts'
import { claimsHuman } from '../honesty.ts'
import { stopFailure } from '../llm.ts'
import { buildReflectUser } from '../prompts/reflection.ts'
import { recentStream } from '../stream.ts'
import type { Tick } from './context.ts'
import { reflectState } from './importance.ts'
import { applyPage } from './page.ts'
import { clock, same, weekday } from './util.ts'

/** The insights, belief changes and want edits take more room than a thought. Sonnet's thinking counts too, so the limit is generous. */
const REFLECT_OUTPUT_TOKENS = 4000
/** Spec 9.3: the 60 most recent stream items. */
const STREAM_ITEMS = 60

/**
 * Reflection (spec 9.3, 9.4): when the importance since the last one adds up, Sonnet looks back over the stream and says what it
 * thinks. Code only runs it at the right time and keeps what the honesty rules allow: insights that cite what happened, belief
 * changes on new evidence, edits to the wants list inside their limits, and nothing that claims to be human. What Merge reflects
 * on, what it wants and whether the plan fits are its own. A reflection is the loop's alone, like the thought tick.
 */
export async function reflectionStep(t: Tick): Promise<void> {
  if (!t.deps.thoughts || t.asleep) return
  const state = reflectState(t.mind)
  const doneToday = state.date === t.today ? state.today : 0
  const due = reflectDue({ sum: state.sum, wantCount: t.wants.length, reflectionsToday: doneToday, lastReflectionMs: state.lastAt ? Date.parse(state.lastAt) : null, nowMs: t.nowMs, asleep: t.asleep })
  if (!due) return
  const stream = recentStream(t.dir, t.today, STREAM_ITEMS)
  if (stream.length === 0) return

  const user = buildReflectUser({
    localTime: `${weekday(t.tz, t.nowMs)} ${t.today} ${clock(t.tz, t.nowMs)}`,
    timeZone: t.tz,
    mood: moodWords({ mood: t.mood, energy: t.energy }),
    stream: stream.map((e) => ({ id: e.id, kind: e.kind, text: e.text })),
    beliefs: t.beliefs.filter((b) => b.status !== 'dropped'),
    wants: t.wants,
    about: t.about,
    pageChangedToday: t.mind.pageChangedOn === t.today,
    plan: t.goals.today ? { reason: t.goals.today.reason, steps: t.goals.today.steps.map((s) => ({ verb: s.verb, target: s.targetId ?? null, reason: s.reason })) } : null,
    questions: state.questions,
  })

  const result = await t.ask('reflection', 'claude-sonnet-5-5', user, ReflectionAnswer, REFLECT_OUTPUT_TOKENS)
  const answer = result?.parsed
  if (!result || !answer || stopFailure(result.stopReason, answer)) {
    // No answer (or no call). The sum stays, the day is not counted, and the next try waits the 2 hours.
    t.notes.push('a reflection gave nothing usable: trying again no sooner than 2 hours from now')
    t.mind.reflect = { ...state, lastAt: t.nowIso }
    return
  }

  const human = (what: string, text: string) => {
    if (!claimsHuman(text)) return false
    t.notes.push(`reflection: a ${what} was thrown away: it claimed to be human`)
    return true
  }

  const insights = checkInsights(answer.insights.filter((i) => !human('insight', i.text)), stream)
  t.notes.push(...insights.dropped)
  for (const i of insights.kept) t.remember.push({ at: t.nowIso, kind: 'reflection', text: i.text, importance: fixedImportance('insight'), cites: i.cites })

  const checked = checkReflection({ journal: { title: '', paragraphs: [] }, beliefOps: answer.beliefOps.filter((o) => !(o.statement && human('belief', o.statement))) }, stream, t.beliefs)
  t.notes.push(...checked.dropped.map((d) => `reflection: ${d}`))
  t.beliefs = applyBeliefOps(t.beliefs, checked.reflection.beliefOps, t.nowIso)

  const asked = wantEditsFrom(answer.wants.filter((w) => !(w.op === 'add' && w.text && human('want', w.text))))
  const edited = applyWantEdits(t.wants, asked.edits, t.nowIso)
  t.notes.push(...[...asked.rejected, ...edited.rejected].map((r) => `reflection: want edit turned down, ${r}`))
  const wantsChanged = !same(edited.wants, t.wants)
  t.wants = edited.wants

  applyPage(t, answer.page)

  const fits = answer.planNoLongerFits?.trim()
  const pending = fits && !claimsHuman(fits) ? { reason: `the plan no longer fits: ${clampText(fits, 200)}` } : wantsChanged ? { reason: 'a reflection changed your wants list' } : null
  const questions = answer.questions.map((q) => q.trim().slice(0, QUESTION_MAX_CHARS)).filter((q) => q && !human('question', q)).slice(0, MAX_QUESTIONS)

  // The sum starts again from nothing: the insights are Merge's own words, not events, and do not count toward the next one.
  t.mind.reflect = { sum: 0, lastAt: t.nowIso, date: t.today, today: doneToday + 1, pending, questions }
  t.parts.push('reflected')
}
