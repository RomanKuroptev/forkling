import { MAX_WANTS, type Want } from '@forkling/schema'
import { COLD_START_WANTS } from './mind-plan.ts'

/** Spec 9.3: a reflection returns up to 4 edits to the wants list. */
export const MAX_WANT_EDITS = 4
/** Spec 9.4: a want with 4 failed attempts (steps ended unfinished, or failed builds) is dropped by code. */
export const MAX_WANT_ATTEMPTS = 4

export type WantEdit =
  | { op: 'add'; kind: Want['kind']; text: string; why: string }
  | { op: 'drop'; id: string }
  | { op: 'reorder'; ids: readonly string[] }

export interface WantEdits {
  wants: Want[]
  /** What was turned down and why, one line each, for the stream. */
  rejected: string[]
}

const idNumber = (id: string) => (/^w(\d+)$/.exec(id) ? Number(id.slice(1)) : 0)
const cut = (text: string, max: number) => text.trim().slice(0, max)

/**
 * Applies a reflection's edits in order. Code only checks the edits (ids that exist, room for an add, text limits); which wants
 * to add, drop or reorder is Merge's. A new id is one past the highest ever seen in the list, so a dropped id is not reused in the same call.
 */
export function applyWantEdits(wants: readonly Want[], edits: readonly WantEdit[], nowIso: string): WantEdits {
  let list = wants.map((w) => ({ ...w }))
  const rejected: string[] = []
  let top = Math.max(0, ...wants.map((w) => idNumber(w.id)))
  edits.forEach((edit, n) => {
    if (n >= MAX_WANT_EDITS) {
      rejected.push(`edit ${n + 1}: a reflection makes at most ${MAX_WANT_EDITS} edits`)
      return
    }
    if (edit.op === 'add') {
      const text = cut(edit.text, 140)
      const why = cut(edit.why, 200)
      if (!text || !why) rejected.push(`add: a want needs text and a reason`)
      else if (list.length >= MAX_WANTS) rejected.push(`add "${text.slice(0, 30)}": the list holds ${MAX_WANTS}`)
      else list.push({ id: `w${++top}`, kind: edit.kind, text, why, since: nowIso, attempts: 0, lastTouched: nowIso })
    } else if (edit.op === 'drop') {
      if (list.some((w) => w.id === edit.id)) list = list.filter((w) => w.id !== edit.id)
      else rejected.push(`drop ${edit.id}: no such want`)
    } else {
      const unknown = edit.ids.filter((id) => !list.some((w) => w.id === id))
      if (unknown.length > 0) rejected.push(`reorder: no such want ${unknown.join(', ')}`)
      else {
        const first = [...new Set(edit.ids)].map((id) => list.find((w) => w.id === id) as Want)
        list = [...first, ...list.filter((w) => !edit.ids.includes(w.id))]
      }
    }
  })
  return { wants: list, rejected }
}

/** A step that ended unfinished, or a failed build, counts against the want it served. A step with no want, or one that is gone, counts against none. */
export function recordWantAttempt(wants: readonly Want[], wantId: string | undefined, nowIso: string): Want[] {
  return wants.map((w) => (w.id === wantId ? { ...w, attempts: w.attempts + 1, lastTouched: nowIso } : w))
}

export function dropFailedWants(wants: readonly Want[]): { wants: Want[]; dropped: Want[] } {
  return { wants: wants.filter((w) => w.attempts < MAX_WANT_ATTEMPTS), dropped: wants.filter((w) => w.attempts >= MAX_WANT_ATTEMPTS) }
}

/**
 * Spec 9.4: the sleep rewrite changes at most half of the list, so memory changes gently. A want counts as changed when it is gone
 * or its text is edited; a new want counts too; the larger of the two is compared with half the old list. Order does not count.
 * While the list has fewer than 3 wants there is no limit, so it can fill from empty.
 */
export function rewriteWants(prev: readonly Want[], next: readonly Want[]): { ok: boolean; reason?: string } {
  if (next.length > MAX_WANTS) return { ok: false, reason: `the list holds at most ${MAX_WANTS}` }
  if (new Set(next.map((w) => w.id)).size !== next.length) return { ok: false, reason: 'a want id is used twice' }
  if (prev.length < COLD_START_WANTS) return { ok: true }
  const kept = prev.filter((p) => next.some((n) => n.id === p.id && n.text === p.text)).length
  const added = next.filter((n) => !prev.some((p) => p.id === n.id)).length
  const changed = Math.max(prev.length - kept, added)
  const allowed = Math.floor(prev.length / 2)
  return changed > allowed ? { ok: false, reason: `${changed} of ${prev.length} wants changed; the rewrite may change at most half (${allowed})` } : { ok: true }
}

export interface RewriteRow {
  id: string | null
  kind: Want['kind']
  text: string
  why: string
}

/**
 * The whole wants list as the sleep rewrite hands it back (spec 9.4), as wants. A row with the id of a want it already has keeps
 * that want's `since` and attempts, and is touched now only if its words changed; any other row is a new want with a fresh id,
 * one past the highest ever seen in the list. The order is the order given. A row with no text or no reason is turned down; so is
 * a repeated id, and rows past 12.
 */
export function wantsFromRewrite(prev: readonly Want[], rows: readonly RewriteRow[], nowIso: string): { wants: Want[]; rejected: string[] } {
  const byId = new Map(prev.map((w) => [w.id, w]))
  const wants: Want[] = []
  const rejected: string[] = []
  const used = new Set<string>()
  let top = Math.max(0, ...prev.map((w) => idNumber(w.id)))
  for (const r of rows) {
    const text = cut(r.text, 140)
    const why = cut(r.why, 200)
    if (!text || !why) {
      rejected.push('a want needs text and a reason')
      continue
    }
    if (wants.length >= MAX_WANTS) {
      rejected.push(`the list holds ${MAX_WANTS}`)
      continue
    }
    const old = r.id ? byId.get(r.id) : undefined
    if (old) {
      if (used.has(old.id)) {
        rejected.push(`${old.id} is listed twice`)
        continue
      }
      used.add(old.id)
      wants.push({ ...old, kind: r.kind, text, why, lastTouched: text === old.text ? old.lastTouched : nowIso })
    } else {
      wants.push({ id: `w${++top}`, kind: r.kind, text, why, since: nowIso, attempts: 0, lastTouched: nowIso })
    }
  }
  return { wants, rejected }
}
