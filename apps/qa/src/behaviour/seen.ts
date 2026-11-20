import type { CheckResult } from '../report/finding.ts'
import type { RunData } from './read-run.ts'

/**
 * What the planner can see about its own world (issues #400 and #422): Merge waited for visitors it could not notice and kept
 * planning to run sketches the work check had already run. Read from the captured prompts of a fast-forward (which has simulated
 * visits): the morning and decide prompts must carry the day's visits as data, and, once the run made a work, the work check's
 * results. A run without captured prompts (live) cannot tell, and raises nothing.
 */
const PLANNER_KINDS = new Set(['morning', 'decide'])
const VISITS_BLOCK = /<data source="visits">\nvisitors today: \d+/
const WORKS_BLOCK = /<works-checked>\n[\s\S]*?\n- "/

export function seenFindings(run: RunData): Omit<CheckResult, 'area'>[] {
  const planner = run.prompts?.filter((p) => PLANNER_KINDS.has(p.kind)) ?? []
  if (planner.length === 0) return []
  const out: Omit<CheckResult, 'area'>[] = []
  const withVisits = planner.filter((p) => VISITS_BLOCK.test(p.user)).length
  if (withVisits === 0) {
    out.push({
      id: 'behaviour.visits-unseen',
      fingerprint: `behaviour.visits-unseen|${run.label}`,
      severity: 'major',
      fixKind: 'data',
      title: 'The planner is never shown how many visitors came',
      what: `None of the ${planner.length} morning and decide prompts has the visits data block (visitors today and the places they stood in).`,
      causes: 'Merge cannot tell whether anyone came, so a wish to be seen can never be met or let go, and it waits (issue #422).',
      evidence: [],
      fixture: run.label,
    })
  }
  const firstWork = run.made.map((m) => m.at).filter(Boolean).sort()[0]
  if (firstWork) {
    const after = planner.filter((p) => p.at > firstWork)
    const withWorks = after.filter((p) => WORKS_BLOCK.test(p.user)).length
    if (after.length > 0 && withWorks === 0) {
      out.push({
        id: 'behaviour.work-check-unseen',
        fingerprint: `behaviour.work-check-unseen|${run.label}`,
        severity: 'major',
        fixKind: 'data',
        title: 'The planner is never told what the work check found',
        what: `The run made ${run.made.length} works, but none of the ${after.length} morning and decide prompts after the first one says whether a work ran and drew, or why not.`,
        causes: 'Merge plans to run sketches that already ran, and does not learn which of its toys work (issue #400).',
        evidence: [],
        fixture: run.label,
      })
    }
  }
  return out
}
