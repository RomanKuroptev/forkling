import type { ReflectionWantEdit } from '@forkling/schema'
import type { EvidenceEntry } from './claims.ts'
import type { WantEdit } from './wants.ts'

/** Spec 9.3: a reflection asks itself up to 3 questions and draws up to 5 insights. */
export const MAX_QUESTIONS = 3
export const MAX_INSIGHTS = 5
export const INSIGHT_MAX_CHARS = 200
export const QUESTION_MAX_CHARS = 140
const MAX_CITES = 6

export interface Insight {
  text: string
  cites: string[]
}

/**
 * Entries that are the mind talking to itself or about itself, or an earlier reflection: an insight may build on these (so later
 * reflections can build on earlier ones) but may not rest on them alone, or it would only be believing itself.
 */
const ABOUT_THE_MIND: ReadonlySet<string> = new Set(['thought', 'trigger', 'rejected', 'reflection'])

const short = (text: string) => (text.length > 50 ? `${text.slice(0, 47)}...` : text)

/**
 * Honest by construction (spec 9.3): every insight cites stream items that were shown to it, and at least one of them is
 * something that happened and not Merge's own words. Unsupported insights are taken out, not repaired. Pure.
 */
export function checkInsights(insights: readonly Insight[], stream: readonly EvidenceEntry[]): { kept: Insight[]; dropped: string[] } {
  const entries = new Map(stream.map((e) => [e.id, e]))
  const kept: Insight[] = []
  const dropped: string[] = []
  for (const raw of insights) {
    const text = raw.text.trim().slice(0, INSIGHT_MAX_CHARS)
    const cites = [...new Set(raw.cites)].slice(0, MAX_CITES)
    if (!text) continue
    if (kept.length >= MAX_INSIGHTS) {
      dropped.push(`insight dropped: "${short(text)}" is past the ${MAX_INSIGHTS} allowed`)
    } else if (cites.length === 0) {
      dropped.push(`insight dropped: "${short(text)}" cites nothing`)
    } else if (!cites.every((c) => entries.has(c))) {
      dropped.push(`insight dropped: "${short(text)}" cites something that did not happen`)
    } else if (cites.every((c) => ABOUT_THE_MIND.has(entries.get(c)!.kind))) {
      dropped.push(`insight dropped: "${short(text)}" rests only on its own thoughts or earlier reflections`)
    } else kept.push({ text, cites })
  }
  return { kept, dropped }
}

/** The flat edits of a structured answer, as typed edits. An edit with a missing part is turned down, with the reason. */
export function wantEditsFrom(raw: readonly ReflectionWantEdit[]): { edits: WantEdit[]; rejected: string[] } {
  const edits: WantEdit[] = []
  const rejected: string[] = []
  for (const e of raw) {
    if (e.op === 'add') {
      if (e.kind && e.text?.trim() && e.why?.trim()) edits.push({ op: 'add', kind: e.kind, text: e.text, why: e.why })
      else rejected.push('add: a want needs a kind, text and a reason')
    } else if (e.op === 'drop') {
      if (e.id) edits.push({ op: 'drop', id: e.id })
      else rejected.push('drop: no id given')
    } else if (e.ids && e.ids.length > 0) edits.push({ op: 'reorder', ids: e.ids })
    else rejected.push('reorder: no ids given')
  }
  return { edits, rejected }
}
