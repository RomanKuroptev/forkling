import type { Belief, BeliefOp, Reflection } from '@forkling/schema'

export interface ClaimsCheck {
  /** The reflection with every unsupported claim taken out. */
  reflection: Reflection
  /** What was taken out and why, one line each. */
  dropped: string[]
  /** Most of the journal was made up: worth asking once more. */
  retry: boolean
}

/** Ops that need new evidence to stand. Dropping or weakening a belief needs only that the belief exists. */
const NEEDS_EVIDENCE: ReadonlySet<BeliefOp['op']> = new Set(['new', 'revise', 'strengthen'])

const short = (text: string) => (text.length > 50 ? `${text.slice(0, 47)}...` : text)

/**
 * Honest by construction: a journal paragraph may only say what the day's stream backs up, and a belief may only
 * form or change on evidence that exists. Unsupported claims are removed, not repaired. Pure.
 */
export function checkReflection(reflection: Reflection, streamIds: ReadonlySet<string>, beliefs: readonly Belief[]): ClaimsCheck {
  const dropped: string[] = []

  const paragraphs = reflection.journal.paragraphs.filter((p) => {
    const ok = p.refs.length > 0 && p.refs.every((r) => streamIds.has(r))
    if (!ok) dropped.push(`journal: "${short(p.text)}" cites ${p.refs.length === 0 ? 'nothing' : 'something that did not happen'}`)
    return ok
  })

  const live = new Map(beliefs.filter((b) => b.status !== 'dropped').map((b) => [b.id, b]))
  const beliefOps: BeliefOp[] = []
  for (const op of reflection.beliefOps) {
    const evidence = op.evidence.filter((e) => streamIds.has(e))
    if (op.op !== 'new' && !(op.beliefId && live.has(op.beliefId))) {
      dropped.push(`belief: ${op.op} on ${op.beliefId ?? 'no belief'}, which it does not hold`)
    } else if (NEEDS_EVIDENCE.has(op.op) && op.op !== 'strengthen' && evidence.length === 0) {
      dropped.push(`belief: ${op.op} "${short(op.statement ?? op.beliefId ?? '')}" has no evidence in the day's stream`)
    } else {
      beliefOps.push({ ...op, evidence })
    }
  }

  const total = reflection.journal.paragraphs.length
  const retry = total > 0 && (total - paragraphs.length) * 2 > total
  return { reflection: { journal: { ...reflection.journal, paragraphs }, beliefOps }, dropped, retry }
}
