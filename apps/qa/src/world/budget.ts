import type { CheckResult } from '../report/finding.ts'

/**
 * The drawing budget (audit spec 7.2, 7.5): the proxy for frame rate that CI can measure with software rendering. Counts are
 * for one whole frame (every pass) from `__qa.renderer()`. Starting limits from the spec, for a phone.
 */
export const BUDGET = { drawCalls: 150, triangles: 300_000 }

export interface FrameCost {
  view: string
  drawCalls: number
  triangles: number
}

export function budgetFindings(costs: readonly FrameCost[], fixture: string): CheckResult[] {
  const worst = (k: 'drawCalls' | 'triangles') => costs.reduce<FrameCost | null>((a, c) => (!a || c[k] > a[k] ? c : a), null)
  const out: CheckResult[] = []
  const calls = worst('drawCalls')
  if (calls && calls.drawCalls > BUDGET.drawCalls)
    out.push({ id: 'world.budget', fingerprint: `world.budget|${fixture}|draw-calls`, severity: 'major', title: 'The world draws too many things a frame for a phone', what: `${calls.drawCalls} draw calls in one frame (view "${calls.view}"); the budget is ${BUDGET.drawCalls}.`, causes: 'On a phone the world stutters.', evidence: [], fixKind: 'code', fixture })
  const tris = worst('triangles')
  if (tris && tris.triangles > BUDGET.triangles)
    out.push({ id: 'world.budget', fingerprint: `world.budget|${fixture}|triangles`, severity: 'major', title: 'The world has too many triangles a frame for a phone', what: `${tris.triangles.toLocaleString('en-GB')} triangles in one frame (view "${tris.view}"); the budget is ${BUDGET.triangles.toLocaleString('en-GB')}.`, causes: 'On a phone the world stutters.', evidence: [], fixKind: 'code', fixture })
  return out
}
