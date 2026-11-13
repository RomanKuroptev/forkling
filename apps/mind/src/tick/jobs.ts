import type { JobResult } from '@forkling/schema'
import { readResults } from '../build-worker.ts'
import { recordCall } from '../budget.ts'
import { clampText } from '../decision.ts'
import type { Tick } from './context.ts'
import { applyExpandResult } from './expand.ts'

const MAX_SEEN = 100
const MAX_PENDING = 10

/** What a result means, in plain words for the stream and for the decide call that answers it. */
export function describeResult(r: JobResult): string {
  const title = r.title ?? r.workId ?? r.id
  if (r.status === 'failed') return `the workshop could not build ${title}${r.reason ? `: ${r.reason}` : ''}`
  if (r.workStatus === 'shelf') return `the workshop finished "${title}": it passed its check and is on its way to the shelf`
  if (r.workStatus === 'scrap') return `the workshop finished "${title}", but it did not pass its check${r.reason ? ` (${clampText(r.reason, 140)})` : ''}: it is in the scrap bin`
  return `the workshop finished ${title}`
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
    const expanded = r.kind === 'expand' ? applyExpandResult(t, r) : null
    t.moodEvents.push(expanded ? (expanded.ok ? 'buildAccepted' : 'buildFailed') : r.status === 'done' && r.workStatus === 'shelf' ? 'buildAccepted' : 'buildFailed')
    const text = expanded ? expanded.text : describeResult(r)
    t.remember.push({ at: t.nowIso, kind: 'event', text: clampText(text, 300), verb: expanded ? 'expand' : 'tinker' })
    jobs.seen.push(r.id)
    jobs.pending.push({ id: r.id, text: clampText(text, 300) })
  }
  jobs.seen = jobs.seen.slice(-MAX_SEEN)
  jobs.pending = jobs.pending.slice(-MAX_PENDING)
  t.mind.jobs = jobs
  t.parts.push(`${fresh.length} build ${fresh.length === 1 ? 'result' : 'results'}`)
}
