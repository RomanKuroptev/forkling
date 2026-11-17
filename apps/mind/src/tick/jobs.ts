import type { JobResult } from '@forkling/schema'
import { readResults } from '../build-worker.ts'
import { recordCall, sessionPoints } from '../budget.ts'
import { sessionJobId } from '@forkling/schema'
import { clampText } from '../decision.ts'
import type { Tick } from './context.ts'
import { applyExpandResult } from './expand.ts'
import { applyFoundResult } from './fallback.ts'
import { rememberScored } from './importance.ts'
import { failWant } from './wants.ts'

const MAX_SEEN = 100
const MAX_PENDING = 10

/** What a result means, in plain words for the stream and for the decide call that answers it. */
export function describeResult(r: JobResult): string {
  const title = r.title ?? r.workId ?? r.id
  if (r.kind === 'session') {
    if (r.status === 'failed') return `I could not work on ${title}${r.reason ? `: ${r.reason}` : ''}`
    return `I worked on ${title}: ${r.caption ?? 'a session'}${r.told ? ` ${r.told}` : ''}`
  }
  if (r.status === 'failed') return `the workshop could not build ${title}${r.reason ? `: ${r.reason}` : ''}`
  if (r.workStatus === 'shelf') return `the workshop finished "${title}": it passed its check and is on its way to the shelf`
  if (r.workStatus === 'scrap') return `the workshop finished "${title}", but it did not pass its check${r.reason ? ` (${clampText(r.reason, 140)})` : ''}: it is in the scrap bin`
  return `the workshop finished ${title}`
}

/**
 * A session has ended (spec-v4 3.3). Its points are taken (1 per $0.001 it spent, which the session already kept within the points
 * in hand), and the build step that asked for it closes now, so the steps after it start. A session that ends after its step has
 * already run out (the plan moved on) only reports.
 */
function settleSession(t: Tick, r: JobResult): void {
  const usd = r.calls.reduce((sum, c) => sum + c.usd, 0)
  if (t.mind.allowance && usd > 0) t.mind.allowance = { ...t.mind.allowance, points: Math.max(0, t.mind.allowance.points - sessionPoints(usd)) }
  const now = t.goals.now
  const step = now ? t.goals.today?.steps[now.index] : undefined
  if (now && step?.verb === 'build' && sessionJobId(now.startedAt) === r.id && t.nowMs < Date.parse(now.until)) now.until = t.nowIso
  if (r.told) t.justNow.push(clampText(r.told, 300))
}

/**
 * Takes in what the build worker has finished (spec 2.2, step 4): each result once. The worker never writes the ledger, so
 * the mind books what the worker's calls cost here; a work that passed lifts the mood and one that did not lowers it (spec
 * 3.2); and the result waits in `mind.jobs.pending` for a decide call (the `buildResult` trigger, spec 2.3), which clears it.
 */
export function settleJobs(t: Tick): void {
  const jobs = t.mind.jobs ?? { seen: [], pending: [] }
  const seen = new Set(jobs.seen)
  const fresh = readResults(t.dir).filter((r) => !seen.has(r.id))
  if (fresh.length === 0) return
  for (const r of fresh) {
    for (const call of r.calls) {
      t.budget = recordCall(t.budget, call)
      t.calls.push(call)
    }
    // An expand is applied here, by the loop, which is the one writer of `places/`; a work arrives as a pull request.
    const applied = r.kind === 'expand' ? applyExpandResult(t, r) : r.kind === 'found' ? applyFoundResult(t, r) : null
    const ok = applied ? applied.ok : r.kind === 'session' ? r.status === 'done' : r.status === 'done' && r.workStatus === 'shelf'
    if (r.kind === 'session') settleSession(t, r)
    t.moodEvents.push(ok ? 'buildAccepted' : 'buildFailed')
    const text = applied ? applied.text : describeResult(r)
    rememberScored(t, { at: t.nowIso, kind: 'event', text: clampText(text, 300), verb: r.kind === 'expand' ? 'expand' : r.kind === 'found' ? 'found' : r.kind === 'session' ? 'build' : 'tinker' }, ok ? 'buildLanded' : 'buildFailed')
    // A build that failed counts against the want of the step that asked for it (spec 9.4); either way the note of which want it was is done with.
    if (!ok) failWant(t, t.mind.jobWants?.[r.id])
    if (t.mind.jobWants && r.id in t.mind.jobWants) delete t.mind.jobWants[r.id]
    jobs.seen.push(r.id)
    jobs.pending.push({ id: r.id, text: clampText(text, 300) })
  }
  jobs.seen = jobs.seen.slice(-MAX_SEEN)
  jobs.pending = jobs.pending.slice(-MAX_PENDING)
  t.mind.jobs = jobs
  t.parts.push(`${fresh.length} build ${fresh.length === 1 ? 'result' : 'results'}`)
}
