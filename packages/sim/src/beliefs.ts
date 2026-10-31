import { MAX_ACTIVE_BELIEFS, type Belief, type BeliefOp } from '@forkling/schema'

const STRENGTHEN_BY = 0.15
const WEAKEN_BY = 0.2
/** A belief this unsure is let go. */
const DROP_BELOW = 0.1
const MAX_EVIDENCE = 12
const DEFAULT_CONFIDENCE = 0.5

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const round2 = (n: number) => Math.round(n * 100) / 100

/** Beliefs it still holds, including ones it has changed its mind about. */
export function liveBeliefs(beliefs: readonly Belief[]): Belief[] {
  return beliefs.filter((b) => b.status !== 'dropped')
}

/**
 * Applies what the bedtime reflection decided about its beliefs. Every change keeps what it was before, so a belief
 * can be traced through its revisions. Operations on beliefs that do not exist are ignored. Pure.
 */
export function applyBeliefOps(beliefs: readonly Belief[], ops: readonly BeliefOp[], nowIso: string): Belief[] {
  let next: Belief[] = beliefs.map((b) => ({ ...b, evidence: [...b.evidence], history: b.history.map((h) => ({ ...h })) }))
  const find = (id: string | null) => (id ? next.find((b) => b.id === id && b.status !== 'dropped') : undefined)
  const remember = (b: Belief, why: string) => {
    b.history = [...b.history, { at: nowIso, statement: b.statement, confidence: b.confidence, why }]
    b.revisedAt = nowIso
  }
  const withEvidence = (b: Belief, evidence: readonly string[]) => {
    b.evidence = [...new Set([...b.evidence, ...evidence])].slice(-MAX_EVIDENCE)
  }

  for (const op of ops) {
    if (op.op === 'new') {
      const statement = op.statement?.trim()
      if (!statement) continue
      const n = next.reduce((max, b) => Math.max(max, Number(b.id.slice(1))), 0) + 1
      next.push({
        id: `b${n}`,
        statement,
        confidence: round2(clamp01(op.confidence ?? DEFAULT_CONFIDENCE)),
        evidence: op.evidence.slice(-MAX_EVIDENCE),
        formedAt: nowIso,
        status: 'active',
        history: [],
      })
      continue
    }
    const b = find(op.beliefId)
    if (!b) continue
    remember(b, op.why)
    if (op.op === 'strengthen') {
      b.confidence = round2(clamp01(b.confidence + STRENGTHEN_BY))
      withEvidence(b, op.evidence)
    } else if (op.op === 'weaken') {
      b.confidence = round2(clamp01(b.confidence - WEAKEN_BY))
      if (b.confidence < DROP_BELOW) b.status = 'dropped'
    } else if (op.op === 'revise') {
      const statement = op.statement?.trim()
      if (statement) b.statement = statement
      b.confidence = round2(clamp01(op.confidence ?? b.confidence))
      b.status = 'revised'
      withEvidence(b, op.evidence)
    } else {
      b.status = 'dropped'
    }
  }

  // Beliefs compete for room: past the cap the least sure go.
  const live = liveBeliefs(next)
  if (live.length > MAX_ACTIVE_BELIEFS) {
    const out = new Set(
      [...live]
        .sort((a, b) => a.confidence - b.confidence || Date.parse(a.formedAt) - Date.parse(b.formedAt))
        .slice(0, live.length - MAX_ACTIVE_BELIEFS)
        .map((b) => b.id),
    )
    next = next.map((b) => (out.has(b.id) ? { ...b, status: 'dropped' as const } : b))
  }
  return next
}
