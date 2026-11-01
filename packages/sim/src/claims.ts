import type { Belief, BeliefOp, Reflection, StreamKind } from '@forkling/schema'

export interface ClaimsCheck {
  /** The reflection with every unsupported claim taken out. */
  reflection: Reflection
  /** What was taken out and why, one line each. */
  dropped: string[]
  /** Most of the journal was made up: worth asking once more. */
  retry: boolean
}

/** What the check needs to know about each entry of the day's stream: which it is, what kind, and when. */
export interface EvidenceEntry {
  id: string
  kind: StreamKind
  at: string
}

/** Ops that need new evidence to stand. Dropping or weakening a belief needs only that the belief exists. */
const NEEDS_EVIDENCE: ReadonlySet<BeliefOp['op']> = new Set(['new', 'revise', 'strengthen'])

/**
 * Entries that are the mind talking to itself or about itself, not something that happened: a thought it wrote, what
 * woke it, a plan the validator turned down. A belief may not stand on these, or it would only be believing itself.
 */
const ABOUT_THE_MIND: ReadonlySet<StreamKind> = new Set(['thought', 'trigger', 'rejected'])

const short = (text: string) => (text.length > 50 ? `${text.slice(0, 47)}...` : text)

/**
 * Honest by construction: a journal paragraph may only say what the day's stream backs up, and a belief may only
 * form or change on evidence that exists, was not just the mind's own words, and for a belief it already holds, came
 * after the belief was last changed. Unsupported claims are removed, not repaired. Pure.
 */
export function checkReflection(reflection: Reflection, stream: readonly EvidenceEntry[], beliefs: readonly Belief[]): ClaimsCheck {
  const dropped: string[] = []
  const entries = new Map(stream.map((e) => [e.id, e]))

  const paragraphs = reflection.journal.paragraphs.filter((p) => {
    const real = p.refs.length > 0 && p.refs.every((r) => entries.has(r))
    if (!real) {
      dropped.push(`journal: "${short(p.text)}" cites ${p.refs.length === 0 ? 'nothing' : 'something that did not happen'}`)
      return false
    }
    // Something other than its own thoughts has to be in there.
    if (p.refs.every((r) => entries.get(r)!.kind === 'thought')) {
      dropped.push(`journal: "${short(p.text)}" cites only its own thoughts`)
      return false
    }
    return true
  })

  const live = new Map(beliefs.filter((b) => b.status !== 'dropped').map((b) => [b.id, b]))
  const beliefOps: BeliefOp[] = []
  for (const op of reflection.beliefOps) {
    const held = op.beliefId ? live.get(op.beliefId) : undefined
    // Real, about the world, and after the belief last changed (a belief it does not hold yet has no "last").
    const since = held ? Date.parse(held.revisedAt ?? held.formedAt) : -Infinity
    const evidence = op.evidence.filter((id) => {
      const e = entries.get(id)
      return !!e && !ABOUT_THE_MIND.has(e.kind) && (op.op === 'new' || Date.parse(e.at) > since)
    })
    if (op.op !== 'new' && !held) {
      dropped.push(`belief: ${op.op} on ${op.beliefId ?? 'no belief'}, which it does not hold`)
    } else if (NEEDS_EVIDENCE.has(op.op) && evidence.length === 0) {
      dropped.push(
        op.op === 'strengthen'
          ? `belief: strengthen "${short(held?.statement ?? op.beliefId ?? '')}" has no new evidence since it last changed`
          : `belief: ${op.op} "${short(op.statement ?? op.beliefId ?? '')}" has no evidence in the day's stream`,
      )
    } else {
      beliefOps.push({ ...op, evidence: NEEDS_EVIDENCE.has(op.op) ? evidence : op.evidence.filter((id) => entries.has(id)) })
    }
  }

  const total = reflection.journal.paragraphs.length
  const retry = total > 0 && (total - paragraphs.length) * 2 > total
  return { reflection: { journal: { ...reflection.journal, paragraphs }, beliefOps }, dropped, retry }
}
