import type { NotesHidden, Visitors } from '@forkling/schema'

/** Spec v4 7: `memory/visitors.json` holds up to 200 entries; when it is full the entry seen longest ago goes. */
export const MAX_VISITORS = 200
export const VISITOR_NAME_MAX = 40

/** The key of a visitor: the name they gave, lowercase, trimmed, inner spaces collapsed, cut to 40. A note with no name is not remembered (null). */
export function foldName(name: string): string | null {
  const folded = name.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, VISITOR_NAME_MAX).trim()
  return folded || null
}

/** One more note seen from a name: a new entry or the old one updated, and the entry seen longest ago pushed out past 200. Pure. */
export function recordVisitor(v: Visitors, note: { name: string; at: string }): Visitors {
  const key = foldName(note.name)
  if (!key) return v
  const old = v.visitors[key]
  const entry = old
    ? { ...old, lastSeen: note.at > old.lastSeen ? note.at : old.lastSeen, notes: old.notes + 1 }
    : { name: note.name.trim().replace(/\s+/g, ' ').slice(0, VISITOR_NAME_MAX), firstSeen: note.at, lastSeen: note.at, notes: 1, about: '', made: [] as string[] }
  const visitors = { ...v.visitors, [key]: entry }
  const keys = Object.keys(visitors)
  if (keys.length > MAX_VISITORS) {
    const oldest = keys.filter((k) => k !== key).sort((a, b) => visitors[a]!.lastSeen.localeCompare(visitors[b]!.lastSeen) || a.localeCompare(b))[0]!
    delete visitors[oldest]
  }
  return { visitors }
}

/** Spec v4 7: a work made after a note from a remembered name is listed in that entry's `made` (newest 100). Returns the same object when nothing is added. Pure. */
export function reconcileMade(v: Visitors, works: readonly { id: string; inspiredBy: { name: string } | null }[]): Visitors {
  let visitors = v.visitors
  for (const w of works) {
    const key = w.inspiredBy ? foldName(w.inspiredBy.name) : null
    const entry = key ? visitors[key] : undefined
    if (!key || !entry || entry.made.includes(w.id)) continue
    visitors = { ...visitors, [key]: { ...entry, made: [...entry.made, w.id].slice(-100) } }
  }
  return visitors === v.visitors ? v : { visitors }
}

/** Whether Roman hid this folded name (`mind/notes-hidden.json`, `names`): its entry is in no prompt. */
export function hiddenVisitor(key: string, hidden: Pick<NotesHidden, 'hidden'> & { names?: readonly string[] }): boolean {
  return (hidden.names ?? []).includes(key)
}
