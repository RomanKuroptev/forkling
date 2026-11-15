import { SleepRewriteAnswer, type BudgetCall, type StreamEntry } from '@forkling/schema'
import { applyBeliefOps, checkReflection, rewriteWants, wantsFromRewrite } from '@forkling/sim'
import { canSpend, costUsd, estimateCallUsd, estimateTokens, MAX_PROMPT_TOKENS, recordCall } from '../budget.ts'
import { claimsHuman } from '../honesty.ts'
import { stopFailure, thinkingFor } from '../llm.ts'
import { buildSleepUser } from '../prompts/sleep.ts'
import { renderJournal, renderSummary } from '../reflect.ts'
import { readStream } from '../stream.ts'
import { wordCount } from '../honesty.ts'
import type { Tick } from './context.ts'
import { applyPage } from './page.ts'

const MODEL = 'claude-sonnet-5-5'
/** The diary, twelve memory slots, belief changes and the wants list. Sonnet's thinking counts too, so the limit is generous. */
const SLEEP_OUTPUT_TOKENS = 6000
/** Spec 9.4: a batch that is not back this long after waking is cancelled and the request run as a normal call. */
export const LATE_AFTER_WAKE_MS = 60 * 60_000
/** The Batch API is asked about a waiting batch no more often than this. */
export const POLL_EVERY_MS = 5 * 60_000
/** A normal call that gave nothing is not repeated sooner than this. */
export const RETRY_EVERY_MS = 30 * 60_000
/** Spec 9.2: a diary entry is up to 250 words. */
export const DIARY_MAX_WORDS = 250

type Rewrite = NonNullable<Tick['mind']['sleepRewrite']>

/**
 * The sleep rewrite (spec 9.4), once a night: at sleep time the day goes to Sonnet on the Batch API (half price, answered within a
 * day) and comes back as a diary entry, the long-term memory, belief changes and a gently rewritten wants list. If the batch is
 * not back an hour after waking it is cancelled and the same request runs as a normal call. Until it lands Merge runs on
 * yesterday's summary and wants. It replaces the pet-era bedtime reflection and nightly rewrite.
 */
export async function sleepRewriteStep(t: Tick): Promise<void> {
  const waiting = t.mind.sleepRewrite
  if (waiting) return collect(t, waiting)
  if (!t.asleep || t.mind.lastRewriteDate === t.evening) return
  await send(t)
}

/** A day has about 280 thought lines and fewer than 100 events, so the prompt shows every event (the newest 300) and the latest 60 thoughts. */
export const MAX_DAY_EVENTS = 300
export const MAX_DAY_THOUGHTS = 60

/** What the sleep rewrite is shown of a day, in order. A paragraph of the diary may cite only these. */
export function dayLines(stream: readonly StreamEntry[]): StreamEntry[] {
  const events = new Set(stream.filter((e) => e.kind !== 'thought').slice(-MAX_DAY_EVENTS))
  const thoughts = new Set(stream.filter((e) => e.kind === 'thought').slice(-MAX_DAY_THOUGHTS))
  return stream.filter((e) => events.has(e) || thoughts.has(e))
}

function prompt(t: Tick, date: string): string {
  const stream = dayLines(readStream(t.dir, date))
  return buildSleepUser({ date, summary: t.w.summary, stream: stream.map((e) => ({ id: e.id, kind: e.kind, text: e.text })), beliefs: t.beliefs, wants: t.wants, pageChangedToday: t.mind.pageChangedOn === t.today })
}

async function send(t: Tick): Promise<void> {
  const { deps, notes, mind, nowIso, evening, system } = t
  if (readStream(t.dir, evening).length === 0) {
    mind.lastRewriteDate = evening
    notes.push('nothing happened today: no sleep rewrite')
    return
  }
  const user = prompt(t, evening)
  const tokens = estimateTokens(system) + estimateTokens(user)
  const maxUsd = estimateCallUsd(MODEL, tokens, SLEEP_OUTPUT_TOKENS) / 2
  t.prompt ??= { model: MODEL, kind: 'sleep', system, user, tokens, maxUsd }
  if (tokens > MAX_PROMPT_TOKENS) notes.push(`prompt too long (about ${tokens} tokens): no sleep rewrite`)
  else if (deps.dryRun) notes.push(`dry run: sleep rewrite on the Batch API, about ${tokens} tokens, at most $${maxUsd.toFixed(4)}`)
  else if (!deps.llm) notes.push('no credentials: no sleep rewrite')
  else if (!canSpend(t.budget, maxUsd)) notes.push(`monthly budget reached ($${t.budget.spentUsd.toFixed(2)} of $${t.budget.capUsd}): no sleep rewrite`)
  else {
    try {
      const id = await deps.llm.submitBatch({ kind: 'sleep', model: MODEL, system, user, maxTokens: SLEEP_OUTPUT_TOKENS, effort: 'low', thinking: thinkingFor(MODEL, 'low'), schema: SleepRewriteAnswer })
      mind.sleepRewrite = { id, date: evening, submittedAt: nowIso }
      mind.lastRewriteDate = evening
      t.parts.push('sent the day off to be written down')
    } catch (e) {
      notes.push(`could not send the sleep rewrite: ${(e as Error).message}`)
    }
  }
}

async function collect(t: Tick, rw: Rewrite): Promise<void> {
  const { deps, notes, nowMs, nowIso } = t
  if (deps.dryRun || !deps.llm) return
  const lateFrom = t.window.wakeMs + LATE_AFTER_WAKE_MS
  const late = !t.asleep && nowMs >= lateFrom && Date.parse(rw.submittedAt) < t.window.wakeMs

  if (rw.id) {
    if (rw.polledAt && nowMs - Date.parse(rw.polledAt) < POLL_EVERY_MS && !late) return
    let outcome
    try {
      outcome = await deps.llm.fetchBatch(rw.id, SleepRewriteAnswer)
    } catch (e) {
      notes.push(`could not check the sleep rewrite: ${(e as Error).message}`)
      return
    }
    if (outcome.status === 'done') {
      const call: BudgetCall = { at: nowIso, kind: 'sleep', model: MODEL, ...outcome.usage, usd: costUsd(MODEL, outcome.usage, { batch: true }) }
      t.calls.push(call)
      t.attempts.push({ kind: 'sleep', model: MODEL, usd: call.usd, ok: true })
      t.budget = recordCall(t.budget, call)
      return apply(t, rw.date, outcome.parsed)
    }
    if (outcome.status === 'failed') {
      notes.push(`the sleep rewrite ${outcome.reason}: it will run as a normal call once Merge is up`)
      t.mind.sleepRewrite = { ...rw, id: null, polledAt: nowIso }
      return rerun(t, { ...rw, id: null })
    }
    t.mind.sleepRewrite = { ...rw, polledAt: nowIso }
    if (!late) {
      notes.push('the sleep rewrite is still running')
      return
    }
    try {
      await deps.llm.cancelBatch(rw.id)
    } catch (e) {
      notes.push(`could not cancel the late sleep rewrite (it may just have ended): ${(e as Error).message}`)
      return
    }
    notes.push('the sleep rewrite is late: cancelled, and run as a normal call instead')
    t.mind.sleepRewrite = { ...rw, id: null, polledAt: nowIso }
    return rerun(t, { ...rw, id: null })
  }
  return rerun(t, rw)
}

/** The same request as a normal call: only once Merge is up, and not again within 30 minutes of a call that gave nothing. */
async function rerun(t: Tick, rw: Rewrite): Promise<void> {
  if (t.asleep) return
  if (rw.triedAt && t.nowMs - Date.parse(rw.triedAt) < RETRY_EVERY_MS) return
  const user = prompt(t, rw.date)
  const result = await t.ask('sleep', MODEL, user, SleepRewriteAnswer, SLEEP_OUTPUT_TOKENS)
  const answer = result?.parsed
  if (!result || !answer || stopFailure(result.stopReason, answer)) {
    t.notes.push('the sleep rewrite gave nothing usable as a normal call: trying again in 30 minutes')
    t.mind.sleepRewrite = { ...rw, triedAt: t.nowIso }
    return
  }
  apply(t, rw.date, answer)
}

/** Keeps what the honesty rules allow of the rewrite and drops the rest. Nothing is repaired. */
function apply(t: Tick, date: string, parsed: unknown): void {
  const { notes, nowIso } = t
  t.mind.sleepRewrite = null
  t.mind.lastRewriteDate = date
  const answer = SleepRewriteAnswer.safeParse(parsed)
  if (!answer.success) {
    notes.push('the sleep rewrite had nothing usable: keeping the old diary, memory and wants')
    return
  }
  const a = answer.data
  const stream: StreamEntry[] = dayLines(readStream(t.dir, date))
  const human = (what: string, text: string) => {
    if (!claimsHuman(text)) return false
    notes.push(`claim dropped, ${what}: it claimed to be human`)
    return true
  }

  // The diary: only what the day backs up, nothing human, and up to 250 words (whole paragraphs, from the start).
  const checked = checkReflection({ journal: { title: a.diary.title, paragraphs: a.diary.paragraphs.filter((p) => !human('diary', p.text)) }, beliefOps: a.beliefOps.filter((o) => !(o.statement && human('belief', o.statement))) }, stream, t.beliefs)
  notes.push(...checked.dropped.map((d) => `claim dropped, ${d}`))
  let words = 0
  const paragraphs = checked.reflection.journal.paragraphs.filter((p) => {
    words += wordCount(p.text)
    if (words <= DIARY_MAX_WORDS) return true
    notes.push(`diary: a paragraph was cut to keep the entry to ${DIARY_MAX_WORDS} words`)
    return false
  })
  const text = renderJournal(date, { journal: { title: checked.reflection.journal.title, paragraphs }, beliefOps: [] })
  if (text) {
    t.journal = { date, text }
    t.parts.push('wrote the diary')
  } else notes.push('the diary had nothing the day backs up: none written')

  t.beliefs = applyBeliefOps(t.beliefs, checked.reflection.beliefOps, nowIso)

  const summary = renderSummary({ slots: a.slots.filter((s) => !human('memory', `${s.title} ${s.text}`)) })
  if (summary) {
    t.summaryNext = summary
    t.parts.push('rewrote its memory')
  } else notes.push('the memory rewrite had nothing usable: keeping the old memory')

  const next = wantsFromRewrite(t.wants, a.wants.filter((w) => !human('want', w.text)), nowIso)
  notes.push(...next.rejected.map((r) => `sleep rewrite: want turned down, ${r}`))
  const ok = rewriteWants(t.wants, next.wants)
  if (ok.ok) t.wants = next.wants
  else notes.push(`the rewritten wants list was turned down (${ok.reason}): keeping the old one`)

  applyPage(t, a.page)
}
